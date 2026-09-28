import os
import time
import logging
import asyncio
from typing import Optional, List
from dotenv import load_dotenv

# Carrega variáveis de ambiente do .env se existir
load_dotenv()

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from auth import verify_credentials, verify_ws_auth
import monitor
import services
import adguard

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("server-monitor")

app = FastAPI(
    title="Server Monitor API",
    description="API de monitoramento remoto em tempo real para Ubuntu Server",
    version="1.0.0"
)

# 1. Configuração de CORS Dinâmico
cors_env = os.getenv("CORS_ORIGINS", "*").strip()
if cors_env == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [orig.strip() for orig in cors_env.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# 2. Middleware de Segurança e Log de Acesso
# Proteção básica de Rate Limiting em memória (sem dependência de banco de dados)
_request_counts = {}
_RATE_LIMIT_WINDOW = 60 # 60 segundos
_RATE_LIMIT_MAX = 1200 # máx 1200 requisições por minuto por IP

@app.middleware("http")
async def security_and_logging_middleware(request: Request, call_next):
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"

    # Rate Limiting Simples (Proxy local em 127.0.0.1/::1/localhost é isento)
    is_local_proxy = client_ip in ("127.0.0.1", "::1", "localhost", "testclient")
    if not is_local_proxy:
        current_time = time.time()
        ip_records = _request_counts.get(client_ip, [])
        # Filtra requisições da janela atual
        ip_records = [t for t in ip_records if current_time - t < _RATE_LIMIT_WINDOW]
        if len(ip_records) >= _RATE_LIMIT_MAX:
            logger.warning(f"Rate limit excedido para o IP: {client_ip}")
            return JSONResponse(
                status_code=429,
                content={"detail": "Muitas requisições. Limite temporário atingido."}
            )
        ip_records.append(current_time)
        _request_counts[client_ip] = ip_records

    # Executa a requisição
    response: Response = await call_next(request)
    latency_ms = round((time.time() - start_time) * 1000, 2)

    # Headers de Segurança
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Log da requisição
    logger.info(f"{client_ip} - \"{request.method} {request.url.path}\" {response.status_code} ({latency_ms}ms)")
    return response

# -------------------------------------------------------------
# ROTAS PÚBLICAS
# -------------------------------------------------------------

@app.get("/api/health", tags=["Health"])
async def health_check():
    """Endpoint público de verificação de integridade da API."""
    return {
        "status": "ok",
        "service": "Server Monitor API",
        "timestamp": time.time(),
        "datetime": time.strftime("%Y-%m-%d %H:%M:%S")
    }

# -------------------------------------------------------------
# ROTAS PROTEGIDAS (Exigem Autenticação)
# -------------------------------------------------------------

@app.get("/api/auth/verify", tags=["Auth"])
async def verify_auth(user: str = Depends(verify_credentials)):
    """Valida as credenciais enviadas pelo frontend e retorna informações básicas."""
    return {
        "authenticated": True,
        "user": user,
        "server": monitor.get_os_info()
    }

@app.get("/api/system", tags=["System"])
async def get_system_summary(user: str = Depends(verify_credentials)):
    """Resumo geral de todo o servidor."""
    return monitor.get_full_system_snapshot()

@app.get("/api/cpu", tags=["Metrics"])
async def get_cpu(user: str = Depends(verify_credentials)):
    """Métricas detalhadas de CPU, núcleos e frequências."""
    return monitor.get_cpu_info()

@app.get("/api/memory", tags=["Metrics"])
async def get_memory(user: str = Depends(verify_credentials)):
    """Métricas de memória RAM e Swap."""
    return monitor.get_memory_info()

@app.get("/api/temperature", tags=["Metrics"])
async def get_temperature(user: str = Depends(verify_credentials)):
    """Sensores de temperatura disponíveis."""
    return monitor.get_temperature_info()

@app.get("/api/disk", tags=["Metrics"])
async def get_disk(user: str = Depends(verify_credentials)):
    """Espaço em disco e taxa de I/O de leitura/escrita."""
    return monitor.get_disk_info()

@app.get("/api/network", tags=["Metrics"])
async def get_network(user: str = Depends(verify_credentials)):
    """Tráfego de rede, velocidades em tempo real e conexões ativas."""
    return monitor.get_network_info()

@app.get("/api/processes", tags=["Processes"])
async def get_processes(
    sort_by: str = Query("cpu", enum=["cpu", "ram", "memory", "name"]),
    limit: int = Query(25, ge=5, le=100),
    user: str = Depends(verify_credentials)
):
    """Lista dos principais processos do sistema."""
    proc_info = monitor.get_processes_list(sort_by=sort_by, limit=limit)
    return {
        "count": proc_info.get("count", 0),
        "running": proc_info.get("running", 0),
        "sleeping": proc_info.get("sleeping", 0),
        "other": proc_info.get("other", 0),
        "sort_by": sort_by,
        "processes": proc_info.get("processes", [])
    }

@app.get("/api/services", tags=["Services"])
async def get_services(user: str = Depends(verify_credentials)):
    """Status dos serviços essenciais do systemd (ONLINE, OFFLINE, ERRO)."""
    return {
        "services": services.get_all_monitored_services()
    }

@app.get("/api/adguard", tags=["AdGuard"])
async def get_adguard_metrics(user: str = Depends(verify_credentials)):
    """Consulta à API interna do AdGuard Home configurada no servidor."""
    return await adguard.fetch_adguard_stats()

# -------------------------------------------------------------
# WEBSOCKET EM TEMPO REAL
# -------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    auth: Optional[str] = Query(None)
):
    """Canal WebSocket para transmissão contínua de telemetria a cada 1.5 segundos."""
    auth_token = token or auth

    # Autenticação do WebSocket
    if not verify_ws_auth(auth_token):
        logger.warning("Tentativa de conexão WebSocket recusada: token ausente ou inválido.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info(f"Cliente WebSocket conectado com sucesso: {websocket.client.host if websocket.client else 'client'}")

    try:
        while True:
            # Coleta snapshot completo
            snapshot = monitor.get_full_system_snapshot()
            
            # Envia para o cliente
            await websocket.send_json({
                "type": "telemetry",
                "data": snapshot
            })

            # Intervalo de 1.5s para manter dados suaves e leves
            await asyncio.sleep(1.5)

    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado normalmente.")
    except Exception as e:
        logger.error(f"Erro na transmissão WebSocket: {e}")
        try:
            await websocket.close()
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    logger.info(f"Iniciando Server Monitor na porta {port} ({host})...")
    uvicorn.run("main:app", host=host, port=port, reload=False)
