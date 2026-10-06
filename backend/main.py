import asyncio
import os
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from auth import verify_credentials, ADMIN_USERNAME, ADMIN_PASSWORD
from monitor import (
    get_full_snapshot,
    get_cpu_info,
    get_memory_info,
    get_disk_info,
    get_temperature_info,
    get_network_info,
    get_top_processes
)
from services import get_all_services
from adguard import fetch_adguard_stats, fetch_adguard_status, fetch_adguard_querylog
from logs import get_system_logs
from n8n import fetch_n8n_status

load_dotenv()

app = FastAPI(
    title="Server Monitor - Ubuntu Telemetry Agent",
    description="Agente de Telemetria Ultraleve para Ubuntu Server na porta 8000",
    version="2.0.0"
)

# CORS
cors_origins_raw = os.getenv("ALLOWED_ORIGINS", os.getenv("CORS_ORIGINS", "*"))
origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "online", "agent": "Server Monitor FastAPI", "port": 8000}

@app.get("/api/auth/verify")
def verify_auth(user_data: dict = Depends(verify_credentials)):
    return {
        "authenticated": True,
        "user": user_data["user"],
        "role": user_data["role"]
    }

@app.get("/api/system")
def get_system(user_data: dict = Depends(verify_credentials)):
    return get_full_snapshot()

@app.get("/api/cpu")
def get_cpu(user_data: dict = Depends(verify_credentials)):
    return get_cpu_info()

@app.get("/api/memory")
def get_memory(user_data: dict = Depends(verify_credentials)):
    return get_memory_info()

@app.get("/api/disk")
def get_disk(user_data: dict = Depends(verify_credentials)):
    return get_disk_info()

@app.get("/api/temperature")
def get_temperature(user_data: dict = Depends(verify_credentials)):
    return get_temperature_info()

@app.get("/api/network")
def get_network(user_data: dict = Depends(verify_credentials)):
    return get_network_info()

@app.get("/api/processes")
def get_processes(
    limit: int = Query(30, ge=1, le=100),
    sort_by: str = Query("cpu", regex="^(cpu|memoria)$"),
    user_data: dict = Depends(verify_credentials)
):
    return {"processos": get_top_processes(limit=limit, sort_by=sort_by)}

@app.get("/api/services")
def get_services(user_data: dict = Depends(verify_credentials)):
    return {"services": get_all_services()}

@app.get("/api/adguard")
async def get_adguard(user_data: dict = Depends(verify_credentials)):
    return await fetch_adguard_stats()

@app.get("/api/adguard/status")
async def get_adguard_status(user_data: dict = Depends(verify_credentials)):
    return await fetch_adguard_status()

@app.get("/api/adguard/querylog")
async def get_adguard_querylog(
    limit: int = Query(30, ge=1, le=100),
    user_data: dict = Depends(verify_credentials)
):
    return await fetch_adguard_querylog(limit=limit)

@app.get("/api/logs")
def get_logs(
    source: str = Query("syslog", regex="^(syslog|agent|panel|adguard|auth|dmesg)$"),
    lines: int = Query(50, ge=5, le=300),
    filter: str = Query("", max_length=100),
    user_data: dict = Depends(verify_credentials)
):
    # Logs do sistema são restritos a administradores
    if user_data.get("role") != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Acesso restrito ao perfil Administrador.")
    return get_system_logs(source=source, lines_count=lines, filter_term=filter)

@app.get("/api/n8n/status")
async def get_n8n_status(user_data: dict = Depends(verify_credentials)):
    return await fetch_n8n_status()

@app.get("/api/n8n/workflows")
async def get_n8n_workflows(user_data: dict = Depends(verify_credentials)):
    status_data = await fetch_n8n_status()
    return {"workflows": status_data.get("workflows", [])}

@app.websocket("/ws/monitor")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            snapshot = get_full_snapshot()
            await websocket.send_json(snapshot)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
