import os
import httpx
from dotenv import load_dotenv

load_dotenv()

ADGUARD_URL = os.getenv("ADGUARD_URL", "http://127.0.0.1:8081").rstrip("/")
ADGUARD_USERNAME = os.getenv("ADGUARD_USERNAME", "samuel")
ADGUARD_PASSWORD = os.getenv("ADGUARD_PASSWORD", "12345678")

async def fetch_adguard_stats():
    auth = (ADGUARD_USERNAME, ADGUARD_PASSWORD) if ADGUARD_USERNAME and ADGUARD_PASSWORD else None
    urls_to_try = [
        f"{ADGUARD_URL}/control/stats",
        "http://127.0.0.1:8081/control/stats",
        "http://localhost:8081/control/stats"
    ]
    for url in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(url, auth=auth)
                if res.status_code == 200:
                    data = res.json()
                    data["connected"] = True
                    return data
        except Exception:
            continue

    # Zeroed real fallback if not reachable
    return {
        "connected": False,
        "num_dns_queries": 0,
        "num_blocked_filtering": 0,
        "blocked_percentage": 0,
        "avg_processing_time": 0,
        "dns_queries": [0] * 24,
        "blocked_filtering": [0] * 24,
        "top_queried_domains": [],
        "top_blocked_domains": [],
        "top_clients": [],
        "top_upstreams_responses": []
    }

async def fetch_adguard_status():
    auth = (ADGUARD_USERNAME, ADGUARD_PASSWORD) if ADGUARD_USERNAME and ADGUARD_PASSWORD else None
    urls_to_try = [
        f"{ADGUARD_URL}/control/status",
        "http://127.0.0.1:8081/control/status",
        "http://localhost:8081/control/status"
    ]
    for url in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(url, auth=auth)
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
        "version": "N/D"
    }

async def fetch_adguard_querylog(limit: int = 30):
    auth = (ADGUARD_USERNAME, ADGUARD_PASSWORD) if ADGUARD_USERNAME and ADGUARD_PASSWORD else None
    urls_to_try = [
        f"{ADGUARD_URL}/control/querylog?limit={limit}",
        f"http://127.0.0.1:8081/control/querylog?limit={limit}"
    ]
    for url in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                res = await client.get(url, auth=auth)
                if res.status_code == 200:
                    return res.json().get("data", [])
        except Exception:
            continue
    return []
