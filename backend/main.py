import os
import re
import json
import time
import logging
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# Carrega variáveis de ambiente do .env se existir
load_dotenv()

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query, Request, Response, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from auth import verify_credentials, require_admin, verify_ws_auth
import monitor
import services
import adguard
import logs as system_logs
import n8n as n8n_client

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

# 1. Configuração de CORS Dinâmico e Seguro (Elimina conflito de allow_origins=["*"] com allow_credentials=True)
cors_env = os.getenv("CORS_ORIGINS", "").strip()
allowed_origins_list = [orig.strip() for orig in cors_env.split(",") if orig.strip() and orig.strip() != "*"]

# Origens locais, LAN e Tailscale padrão confiáveis
default_trusted_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "http://localhost:80",
    "http://127.0.0.1:80",
    "http://192.168.100.23",
    "http://192.168.100.23:80",
    "http://192.168.100.23:3000",
    "http://100.97.208.102",
    "http://100.97.208.102:80",
    "http://100.97.208.102:3000"
]

all_allowed_origins = list(dict.fromkeys(allowed_origins_list + default_trusted_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=all_allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\]|192\.168\.100\.\d+|100\.\d+\.\d+\.\d+|samuelserver)(:\d+)?$",
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
async def verify_auth(role: str = Depends(verify_credentials)):
    """Valida as credenciais enviadas pelo frontend e retorna informações básicas."""
    admin_env_user = os.getenv("ADMIN_USERNAME", "admin")
    user_env_user = os.getenv("USER_USERNAME", "user")
    username = admin_env_user if role == "admin" else user_env_user
    return {
        "authenticated": True,
        "user": username,
        "role": role,
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
@app.get("/api/adguard/stats", tags=["AdGuard"])
async def get_adguard_metrics(user: str = Depends(verify_credentials)):
    """Consulta à API interna do AdGuard Home configurada no servidor."""
    return await adguard.fetch_adguard_stats()

@app.get("/api/adguard/status", tags=["AdGuard"])
async def get_adguard_status_endpoint(user: str = Depends(verify_credentials)):
    """Status de execução e proteção do AdGuard Home."""
    return await adguard.fetch_adguard_status()

@app.get("/api/adguard/querylog", tags=["AdGuard"])
async def get_adguard_querylog_endpoint(limit: int = 30, user: str = Depends(verify_credentials)):
    """Log recente de consultas DNS filtradas pelo AdGuard Home."""
    return await adguard.fetch_adguard_querylog(limit=limit)

@app.post("/api/adguard/sync", tags=["AdGuard"])
async def sync_adguard_raw_stats_endpoint(request: Request, user: str = Depends(verify_credentials)):
    """Sincroniza estatísticas reais brutas enviadas pelo operador."""
    body = await request.json()
    res = adguard.update_raw_stats(body)
    return {"success": True, "stats": res}

@app.post("/api/adguard/clear-history", tags=["AdGuard"])
async def clear_adguard_history_endpoint(user: str = Depends(require_admin)):
    """Zera histórico de consultas e reseta estatísticas do AdGuard."""
    return await adguard.clear_adguard_history()

@app.get("/api/adguard/clear-command", tags=["AdGuard"])
async def get_adguard_clear_command_endpoint(user: str = Depends(verify_credentials)):
    """Retorna comando curl do shell para limpar histórico no Ubuntu."""
    url, u, p = adguard.get_config_credentials()
    return {"shellCommand": f'curl -s -X POST -u "{u}:{p}" {url}/control/querylog_clear && curl -s -X POST -u "{u}:{p}" {url}/control/stats_reset'}

# -------------------------------------------------------------
# AUDITORIA DE SEGURANÇA E ATAQUES
# -------------------------------------------------------------

@app.get("/api/security/attack-monitor", tags=["Security"])
async def get_security_attack_monitor(user: str = Depends(verify_credentials)):
    """Auditoria em tempo real de tentativas de invasão SSH, firewall e bots."""
    total_attempts = 0
    attack_sources = []
    target_accounts: Dict[str, int] = {}
    ip_counts: Dict[str, int] = {}

    try:
        cmd = ["journalctl", "-u", "ssh", "-n", "80", "--no-pager"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2.0)
        lines = proc.stdout.splitlines() if proc.returncode == 0 else []

        for line in lines:
            if "Failed password" in line or "Invalid user" in line:
                total_attempts += 1
                ip_match = re.search(r'from\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', line)
                user_match = re.search(r'for\s+(?:invalid user\s+)?([a-zA-Z0-9_\-]+)', line)
                if ip_match:
                    ip = ip_match.group(1)
                    ip_counts[ip] = ip_counts.get(ip, 0) + 1
                if user_match:
                    target_u = user_match.group(1)
                    target_accounts[target_u] = target_accounts.get(target_u, 0) + 1

        for ip, count in sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
            attack_sources.append({
                "ip": ip,
                "count": count,
                "lastAttempt": "recente",
                "targetUser": "root",
                "service": "OpenSSH",
                "status": "bloqueado" if count >= 5 else "detectado"
            })
    except Exception:
        pass

    target_list = [{"user": u, "attempts": c} for u, c in sorted(target_accounts.items(), key=lambda x: x[1], reverse=True)[:5]]
    threat_level = "NORMAL"
    if total_attempts >= 15:
        threat_level = "SOB ATAQUE"
    elif total_attempts >= 3:
        threat_level = "MODERADO"

    return {
        "threatLevel": threat_level,
        "isUnderAttack": threat_level == "SOB ATAQUE",
        "totalFailedAttempts24h": total_attempts,
        "failedAttemptsLastHour": total_attempts,
        "totalScansDetected": 0,
        "sshStatus": "normal" if total_attempts < 5 else "alerta",
        "nginxStatus": "normal",
        "attackSources": attack_sources,
        "targetAccounts": target_list,
        "recentIncidents": [],
        "lastChecked": datetime.now().strftime("%H:%M:%S")
    }

# -------------------------------------------------------------
# EXPLORADOR DE ARQUIVOS E BLOCO DE NOTAS
# -------------------------------------------------------------

@app.get("/api/files/list", tags=["Files"])
async def list_files_endpoint(path: Optional[str] = Query(None), user: str = Depends(verify_credentials)):
    target = Path(path or "/home/samuel").resolve()
    if not target.exists():
        target = Path(os.path.expanduser("~")).resolve()
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="O caminho especificado não é uma pasta.")

    items = []
    try:
        with os.scandir(target) as entries:
            for entry in entries:
                try:
                    stat_info = entry.stat()
                    is_dir = entry.is_dir()
                    items.append({
                        "name": entry.name,
                        "path": str(Path(entry.path).resolve()),
                        "isDirectory": is_dir,
                        "size": stat_info.st_size if not is_dir else 0,
                        "sizeFormatted": f"{stat_info.st_size} B" if not is_dir else "--",
                        "mtime": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                        "typeCategory": "folder" if is_dir else "document"
                    })
                except Exception:
                    continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permissão negada ao listar pasta.")

    parent = str(target.parent) if str(target) != "/" else None
    return {
        "currentPath": str(target),
        "parentPath": parent,
        "items": items,
        "totalFolders": sum(1 for i in items if i["isDirectory"]),
        "totalFiles": sum(1 for i in items if not i["isDirectory"]),
        "totalSizeBytes": sum(i["size"] for i in items if not i["isDirectory"]),
        "totalSizeFormatted": "--",
        "canWrite": True
    }

@app.get("/api/files/read", tags=["Files"])
async def read_file_endpoint(path: str = Query(...), user: str = Depends(verify_credentials)):
    p = Path(path).resolve()
    if not p.exists() or p.is_dir():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
        return {
            "name": p.name,
            "path": str(p),
            "size": p.stat().st_size,
            "content": content,
            "isBinary": False,
            "truncated": False,
            "mtime": datetime.fromtimestamp(p.stat().st_mtime).isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo: {str(e)}")

@app.post("/api/files/create", tags=["Files"])
async def create_file_endpoint(request: Request, user: str = Depends(verify_credentials)):
    body = await request.json()
    dir_path = body.get("dirPath") or "/home/samuel"
    name = body.get("name")
    content = body.get("content", "")

    if not name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    target_dir = Path(dir_path).resolve()
    if not target_dir.exists():
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            subprocess.run(["sudo", "mkdir", "-p", str(target_dir)], capture_output=True)

    target_file = target_dir / name
    if target_file.exists():
        raise HTTPException(status_code=400, detail="Arquivo já existe.")

    try:
        target_file.write_text(content, encoding="utf-8")
        return {"success": True, "filePath": str(target_file)}
    except PermissionError:
        proc = subprocess.run(
            ["sudo", "tee", str(target_file)],
            input=content,
            text=True,
            capture_output=True
        )
        if proc.returncode == 0:
            subprocess.run(["sudo", "chmod", "666", str(target_file)], capture_output=True)
            return {"success": True, "filePath": str(target_file)}
        raise HTTPException(status_code=403, detail="Permissão negada para criar arquivo nesta pasta.")

@app.post("/api/files/save", tags=["Files"])
async def save_file_endpoint(request: Request, user: str = Depends(verify_credentials)):
    body = await request.json()
    file_path = body.get("path")
    content = body.get("content", "")

    p = Path(file_path).resolve()
    if not p.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    try:
        p.write_text(content, encoding="utf-8")
        return {"success": True, "size": p.stat().st_size}
    except PermissionError:
        proc = subprocess.run(
            ["sudo", "tee", str(p)],
            input=content,
            text=True,
            capture_output=True
        )
        if proc.returncode == 0:
            return {"success": True, "size": p.stat().st_size}
        raise HTTPException(status_code=403, detail="Permissão negada ao salvar arquivo.")

# -------------------------------------------------------------
# TERMINAL SHELL EXECUTION
# -------------------------------------------------------------

@app.post("/api/terminal/exec", tags=["Terminal"])
async def exec_terminal_endpoint(request: Request, user: str = Depends(require_admin)):
    body = await request.json()
    command = (body.get("command") or "").strip()
    cwd = body.get("cwd") or "/home/samuel"

    # Sanitiza contra-barras soltas que quebram execução bash ("\ git: command not found")
    command = re.sub(r'\\\s*[\r\n]+\s*', ' ', command)
    command = re.sub(r'\\\s+', ' ', command).strip()

    # Injeta PATH completo do sistema para encontrar git, npm, node, nginx, systemctl
    env_vars = dict(os.environ)
    system_paths = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    current_path = env_vars.get("PATH", "")
    env_vars["PATH"] = f"{system_paths}:{current_path}" if current_path else system_paths

    start_time = time.time()
    try:
        proc = subprocess.run(
            ["/bin/bash", "-c", command],
            cwd=cwd if os.path.exists(cwd) else None,
            capture_output=True,
            text=True,
            env=env_vars,
            timeout=90
        )
        elapsed = int((time.time() - start_time) * 1000)
        return {
            "success": proc.returncode == 0,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "exitCode": proc.returncode,
            "cwd": cwd,
            "executionTimeMs": elapsed
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "command": command,
            "stdout": "",
            "stderr": "Comando excedeu o tempo limite de 90 segundos.",
            "exitCode": 124,
            "cwd": cwd,
            "executionTimeMs": 90000
        }
    except Exception as e:
        return {
            "success": False,
            "command": command,
            "stdout": "",
            "stderr": str(e),
            "exitCode": 1,
            "cwd": cwd,
            "executionTimeMs": 0
        }

# -------------------------------------------------------------
# CREDENCIAIS DO SISTEMA (server-config.json)
# -------------------------------------------------------------

@app.get("/api/credentials", tags=["Credentials"])
async def get_credentials_endpoint(user: str = Depends(require_admin)):
    cfg_file = Path(__file__).resolve().parent.parent / "server-config.json"
    if cfg_file.exists():
        with open(cfg_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

@app.post("/api/credentials", tags=["Credentials"])
async def save_credentials_endpoint(request: Request, user: str = Depends(require_admin)):
    data = await request.json()
    cfg_file = Path(__file__).resolve().parent.parent / "server-config.json"
    with open(cfg_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return {"success": True, "message": "Configurações salvas em server-config.json com sucesso."}

@app.get("/api/logs", tags=["Logs"])
async def get_logs_endpoint(
    source: str = Query("syslog", enum=["syslog", "agent", "panel", "adguard", "auth", "dmesg"]),
    lines: int = Query(50, ge=5, le=300),
    filter: str = Query(""),
    user: str = Depends(require_admin)
):
    """Logs do sistema e dos daemons (acesso restrito ao perfil Administrador)."""
    return system_logs.get_system_logs(source=source, lines=lines, filter=filter)

@app.get("/api/n8n/status", tags=["n8n"])
async def get_n8n_status_endpoint(user: str = Depends(require_admin)):
    """Status operacional e fluxos do n8n (acesso restrito ao perfil Administrador)."""
    return await n8n_client.fetch_n8n_status()

@app.post("/api/n8n/config", tags=["n8n"])
async def update_n8n_config_endpoint(request: Request, user: str = Depends(require_admin)):
    """Atualização dinâmica de endereço e chave de API do n8n."""
    body = await request.json()
    url = body.get("url")
    api_key = body.get("apiKey")
    n8n_client.update_n8n_config(url=url, api_key=api_key)
    updated_status = await n8n_client.fetch_n8n_status()
    return {
        "success": True,
        "message": "Configuração do n8n atualizada com sucesso.",
        "status": updated_status
    }

# -------------------------------------------------------------
# API DE FORNECEDORES DE MAC (api.macvendors.com)
# Serviço externo independente para identificação de fabricante OUI
# -------------------------------------------------------------

_mac_cache: Dict[str, Dict[str, Any]] = {}
_last_mac_call: float = 0.0

KNOWN_OUI_FALLBACK = {
    'FCA13E': 'Samsung Electronics Co., Ltd.',
    'FCFBFB': 'Cisco Systems, Inc',
    'B827EB': 'Raspberry Pi Foundation',
    'DCA632': 'Raspberry Pi Trading Ltd',
    'E45F01': 'Raspberry Pi Trading Ltd',
    '001A79': 'Apple, Inc.',
    '3C0630': 'Apple, Inc.',
    'ACDE48': 'Apple, Inc.',
    'F01898': 'Apple, Inc.',
    '641666': 'Intel Corporate',
    '00155D': 'Microsoft Corporation',
    '50EB71': 'TP-Link Corporation Limited',
    '58D9D5': 'TP-Link Corporation Limited',
    '18FE34': 'Espressif Inc.',
    '246F28': 'Espressif Inc.',
    '30AEA4': 'Espressif Inc.',
    '7C87CE': 'Xiaomi Communications Co Ltd',
    '68764F': 'Xiaomi Communications Co Ltd',
    '00E04C': 'Realtek Semiconductor Corp.'
}

@app.get("/api/mac-vendor/{mac_address:path}", tags=["Network Tools"])
async def get_mac_vendor(mac_address: str, user: str = Depends(verify_credentials)):
    """Consulta fabricante de endereço MAC usando api.macvendors.com com cache e fallback."""
    import re
    import urllib.request
    import urllib.error

    global _last_mac_call

    raw = (mac_address or "").strip()
    hex_only = re.sub(r'[^0-9A-Fa-f]', '', raw).upper()
    if len(hex_only) < 6:
        raise HTTPException(
            status_code=400,
            detail="Formato de MAC inválido. Forneça ao menos 6 caracteres hexadecimais (ex: FC-A1-3E)."
        )

    oui = hex_only[:6]
    formatted_oui = f"{oui[0:2]}:{oui[2:4]}:{oui[4:6]}"
    formatted_full = f"{oui[0:2]}:{oui[2:4]}:{oui[4:6]}:{hex_only[6:8]}:{hex_only[8:10]}:{hex_only[10:12]}" if len(hex_only) >= 12 else formatted_oui

    first_byte = int(hex_only[:2], 16)
    is_randomized = bool(first_byte & 0x02)

    # Verifica cache
    now = time.time()
    if oui in _mac_cache and now - _mac_cache[oui]["timestamp"] < 86400:
        c = _mac_cache[oui]
        if c.get("vendor"):
            return {
                "success": True,
                "found": True,
                "mac": formatted_full,
                "oui": formatted_oui,
                "vendor": c["vendor"],
                "is_randomized": is_randomized,
                "cached": True,
                "provider": "api.macvendors.com (Cache Local)",
                "service_notice": "Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu."
            }
        else:
            raise HTTPException(
                status_code=404,
                detail="Fabricante não encontrado na base OUI/IEEE"
            )

    # Verifica Fallback OUI
    if oui in KNOWN_OUI_FALLBACK:
        v = KNOWN_OUI_FALLBACK[oui]
        _mac_cache[oui] = {"vendor": v, "timestamp": now}
        return {
            "success": True,
            "found": True,
            "mac": formatted_full,
            "oui": formatted_oui,
            "vendor": v,
            "is_randomized": is_randomized,
            "cached": False,
            "provider": "api.macvendors.com (Base OUI Local)",
            "service_notice": "Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu."
        }

    # Respeita o limite de 1 req/segundo
    time_diff = now - _last_mac_call
    if time_diff < 1.05:
        await asyncio.sleep(1.05 - time_diff)
    _last_mac_call = time.time()

    url = f"https://api.macvendors.com/{urllib.parse.quote(formatted_full)}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "UbuntuServerMonitor/1.0", "Accept": "*/*"}
    )

    try:
        loop = asyncio.get_event_loop()
        def _fetch():
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.read().decode("utf-8").strip()

        vendor = await loop.run_in_executor(None, _fetch)
        _mac_cache[oui] = {"vendor": vendor, "timestamp": time.time()}
        return {
            "success": True,
            "found": True,
            "mac": formatted_full,
            "oui": formatted_oui,
            "vendor": vendor,
            "is_randomized": is_randomized,
            "cached": False,
            "provider": "api.macvendors.com",
            "service_notice": "Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu."
        }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            _mac_cache[oui] = {"vendor": None, "timestamp": time.time()}
            raise HTTPException(
                status_code=404,
                detail="Fabricante não encontrado: Este é um endereço MAC Privado/Aleatório ou não registrado no IEEE" if is_randomized else "Fabricante não encontrado na base OUI/IEEE"
            )
        elif e.code == 429:
            raise HTTPException(
                status_code=429,
                detail="Limite de 1 requisição por segundo atingido na API macvendors.com. Aguarde um instante."
            )
        else:
            raise HTTPException(
                status_code=e.code,
                detail=f"Erro retornado pela API externa: HTTP {e.code}"
            )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Falha de conexão com api.macvendors.com: {str(e)}"
        )

# -------------------------------------------------------------
# TESTE DE PING / LATÊNCIA (NATIVO TCP, ZERO COMANDOS EXTERNOS)
# -------------------------------------------------------------

def _measure_tcp_ping(host: str, port: int, timeout: float = 2.0) -> Optional[float]:
    import socket
    t0 = time.perf_counter()
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return None

@app.get("/api/ping", tags=["Network Tools"])
async def get_server_ping():
    """Mede o ping do servidor para fora usando conexões TCP socket nativas sem comandos extras."""
    loop = asyncio.get_event_loop()
    targets = [
        {"id": "cloudflare", "name": "Cloudflare DNS", "host": "1.1.1.1", "port": 53, "type": "external"},
        {"id": "google", "name": "Google Public DNS", "host": "8.8.8.8", "port": 53, "type": "external"},
        {"id": "quad9", "name": "Quad9 DNS Seguro", "host": "9.9.9.9", "port": 53, "type": "external"},
        {"id": "gateway", "name": "Gateway Local (Roteador)", "host": "192.168.100.1", "port": 80, "type": "local"}
    ]

    tasks = [
        loop.run_in_executor(None, _measure_tcp_ping, t["host"], t["port"], 0.8 if t["type"] == "external" else 0.35)
        for t in targets
    ]
    raw_latencies = await asyncio.gather(*tasks, return_exceptions=True)

    results = []
    for idx, t in enumerate(targets):
        val = raw_latencies[idx]
        latency = val if isinstance(val, (int, float)) else None
        quality = "FALHA"
        if latency is not None:
            if latency <= 20: quality = "EXCELENTE"
            elif latency <= 50: quality = "BOM"
            elif latency <= 100: quality = "MEDIO"
            else: quality = "ALTO"
        results.append({
            **t,
            "pingMs": latency,
            "status": "ONLINE" if latency is not None else "OFFLINE",
            "quality": quality
        })

    valid = [r["pingMs"] for r in results if r["pingMs"] is not None and r["type"] == "external"]
    avg = round(sum(valid) / len(valid), 1) if valid else None
    overall = "EXCELENTE" if avg and avg <= 25 else "BOM" if avg and avg <= 60 else "ALTO" if avg else "DESCONECTADO"

    return {
        "success": True,
        "timestamp": datetime.now().isoformat(),
        "average_ms": avg,
        "overall_status": overall,
        "targets": results
    }

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
