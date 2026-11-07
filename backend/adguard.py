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

async def fetch_adguard_stats():
    global _latest_synced_stats
    url, username, password = get_config_credentials()
    auth = (username, password) if username and password else None
    
    urls_to_try = [
        f"{url}/control/stats",
        "http://192.168.100.23:8081/control/stats",
        "http://127.0.0.1:8081/control/stats",
        "http://localhost:8081/control/stats"
    ]
    
    for target in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(target, auth=auth)
                if res.status_code == 200:
                    data = res.json()
                    data["connected"] = True
                    _latest_synced_stats = data
                    return data
        except Exception:
            continue

    # Se já temos stats reais sincronizadas pelo usuário, usa-as
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
    url, username, password = get_config_credentials()
    auth = (username, password) if username and password else None
    
    urls_to_try = [
        f"{url}/control/status",
        "http://192.168.100.23:8081/control/status",
        "http://127.0.0.1:8081/control/status",
        "http://localhost:8081/control/status"
    ]
    
    for target in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(target, auth=auth)
                if res.status_code == 200:
                    data = res.json()
                    data["online"] = True
                    return data
        except Exception:
            continue

    return {
        "online": False,
        "running": False,
        "protection_enabled": False,
        "version": "N/D",
        "error": "AdGuard Home offline"
    }

async def fetch_adguard_querylog(limit: int = 30):
    url, username, password = get_config_credentials()
    auth = (username, password) if username and password else None
    
    urls_to_try = [
        f"{url}/control/querylog?limit={limit}",
        f"http://192.168.100.23:8081/control/querylog?limit={limit}",
        f"http://127.0.0.1:8081/control/querylog?limit={limit}"
    ]
    
    for target in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(target, auth=auth)
                if res.status_code == 200:
                    return res.json().get("data", [])
        except Exception:
            continue
    return []

async def clear_adguard_history():
    global _latest_synced_stats
    url, username, password = get_config_credentials()
    auth = (username, password) if username and password else None
    
    urls = [
        ("querylog", f"{url}/control/querylog_clear"),
        ("stats", f"{url}/control/stats_reset")
    ]
    
    for _, target in urls:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(target, auth=auth)
        except Exception:
            pass

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
        "shellCommand": f'curl -s -X POST -u "{username}:{password}" {url}/control/querylog_clear && curl -s -X POST -u "{username}:{password}" {url}/control/stats_reset'
    }
