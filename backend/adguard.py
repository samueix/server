import os
import json
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

def get_config_credentials():
    config_file = Path(__file__).resolve().parent.parent / "server-config.json"
    if config_file.exists():
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                adg = data.get("adguard", {})
                url = (adg.get("url") or "http://192.168.100.23:8081").rstrip("/")
                user = adg.get("username") or "samuel"
                pwd = adg.get("password") or "REDACTED_PASSWORD"
                return url, user, pwd
        except Exception:
            pass
    url = os.getenv("ADGUARD_URL", "http://192.168.100.23:8081").rstrip("/")
    user = os.getenv("ADGUARD_USERNAME", "samuel")
    pwd = os.getenv("ADGUARD_PASSWORD", "REDACTED_PASSWORD")
    return url, user, pwd

# Dados em memória mantidos apenas se recebidos via sync real
_latest_synced_stats = None

def update_raw_stats(data: dict):
    global _latest_synced_stats
    if isinstance(data, dict):
        _latest_synced_stats = data
        _latest_synced_stats["connected"] = True
    return _latest_synced_stats

async def _request_adguard(endpoint: str, method: str = "GET", json_body=None):
    """
    Tenta acessar o AdGuard Home local em 127.0.0.1:8081/control.
    Primeiro tenta SEM autenticação (caso o proxy ou rede local não exija).
    Se retornar 401 Unauthorized, tenta com Basic Auth configurado.
    """
    clean_ep = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    if not clean_ep.startswith("/control"):
        clean_ep = f"/control{clean_ep}"

    url, username, password = get_config_credentials()
    auth = (username, password) if username and password else None

    # Candidatos locais prioritários
    bases_to_try = [
        "http://127.0.0.1:8081",
        "http://localhost:8081",
        url.rstrip("/"),
        "http://192.168.100.23:8081"
    ]
    # Remove duplicatas preservando ordem
    unique_bases = []
    for b in bases_to_try:
        if b and b not in unique_bases:
            unique_bases.append(b)

    for base in unique_bases:
        target = f"{base}{clean_ep}"
        # 1. Tenta sem autenticação
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                if method == "POST":
                    res = await client.post(target, json=json_body)
                else:
                    res = await client.get(target)

                if res.status_code == 200:
                    try:
                        return res.json()
                    except Exception:
                        return {"success": True}

                # Se retornar 401 Unauthorized e temos credenciais, tenta com auth
                if res.status_code == 401 and auth:
                    if method == "POST":
                        res_auth = await client.post(target, auth=auth, json=json_body)
                    else:
                        res_auth = await client.get(target, auth=auth)
                    if res_auth.status_code == 200:
                        try:
                            return res_auth.json()
                        except Exception:
                            return {"success": True}
        except Exception:
            continue

    return None

async def fetch_adguard_stats():
    global _latest_synced_stats
    data = await _request_adguard("/stats")
    if data and isinstance(data, dict):
        data["connected"] = True
        _latest_synced_stats = data
        return data

    # Se já temos dados válidos sincronizados em memória
    if _latest_synced_stats:
        return _latest_synced_stats

    # Zeroed real fallback if not reachable (sem dados inventados)
    return {
        "connected": False,
        "num_dns_queries": 0,
        "num_blocked_filtering": 0,
        "blocked_percentage": 0,
        "avg_processing_time": 0,
        "dns_queries": [],
        "blocked_filtering": [],
        "top_queried_domains": [],
        "top_blocked_domains": [],
        "top_clients": [],
        "top_upstreams_responses": [],
        "error": "AdGuard Home offline ou inacessível em :8081"
    }

async def fetch_adguard_status():
    data = await _request_adguard("/status")
    if data and isinstance(data, dict):
        data["online"] = True
        return data

    return {
        "online": False,
        "running": False,
        "protection_enabled": False,
        "version": "N/D",
        "error": "AdGuard Home offline"
    }

async def fetch_adguard_querylog(limit: int = 30):
    data = await _request_adguard(f"/querylog?limit={limit}")
    if data:
        if isinstance(data, dict) and "data" in data:
            return data.get("data", [])
        if isinstance(data, list):
            return data
    return []

async def clear_adguard_history():
    global _latest_synced_stats
    url, username, password = get_config_credentials()

    await _request_adguard("/querylog_clear", method="POST")
    await _request_adguard("/stats_reset", method="POST")

    _latest_synced_stats = {
        "connected": True,
        "num_dns_queries": 0,
        "num_blocked_filtering": 0,
        "blocked_percentage": 0,
        "avg_processing_time": 0,
        "dns_queries": [],
        "blocked_filtering": [],
        "top_queried_domains": [],
        "top_blocked_domains": [],
        "top_clients": [],
        "top_upstreams_responses": []
    }

    return {
        "success": True,
        "message": "Histórico do AdGuard zerado com sucesso.",
        "shellCommand": f'curl -s -X POST {url}/control/querylog_clear && curl -s -X POST {url}/control/stats_reset'
    }
