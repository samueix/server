import os
from typing import Dict, Any, List
import httpx

def get_adguard_config():
    url = os.getenv("ADGUARD_URL", "http://127.0.0.1:8081").strip().rstrip("/")
    username = os.getenv("ADGUARD_USERNAME", "samuel").strip()
    password = os.getenv("ADGUARD_PASSWORD", "12345678").strip()
    return url, username, password

async def fetch_adguard_stats() -> Dict[str, Any]:
    url, username, password = get_adguard_config()

    if not url:
        return {
            "configured": False,
            "available": False,
            "status": "OFFLINE",
            "message": "AdGuard Home não configurado no backend (ADGUARD_URL ausente)",
            "dns_queries": "Indisponível",
            "blocked_queries": "Indisponível",
            "blocked_percentage": "Indisponível",
            "queries_per_second": "Indisponível",
            "clients_count": "Indisponível",
            "avg_processing_time_ms": "Indisponível",
            "protection_enabled": "Indisponível",
            "top_queried_domains": [],
            "top_blocked_domains": [],
            "top_clients": []
        }

    auth = None
    if username and password:
        auth = (username, password)

    try:
        async with httpx.AsyncClient(timeout=3.0, verify=False) as client:
            # 1. Checa status
            status_resp = await client.get(f"{url}/control/status", auth=auth)
            status_data = status_resp.json() if status_resp.status_code == 200 else {}

            # 2. Checa estatísticas gerais
            stats_resp = await client.get(f"{url}/control/stats", auth=auth)
            stats_data = stats_resp.json() if stats_resp.status_code == 200 else {}

        running = status_data.get("running", True) if status_resp.status_code == 200 else False
        protection = status_data.get("protection_enabled", "Indisponível")

        num_dns = stats_data.get("num_dns_queries", 0)
        num_blocked = stats_data.get("num_blocked_filtering", 0)
        blocked_pct = round((num_blocked / num_dns * 100), 2) if num_dns and num_dns > 0 else 0.0

        # Média de tempo em ms
        avg_time = stats_data.get("avg_processing_time")
        avg_time_ms = round(avg_time * 1000, 2) if avg_time is not None else "Indisponível"

        # Cálculo aproximado de QPS baseado no período de 24h (86400s) ou estatísticas
        time_units = stats_data.get("time_units", "hours")
        dns_queries_series = stats_data.get("dns_queries", [])
        qps = "Indisponível"
        if dns_queries_series and len(dns_queries_series) > 0:
            last_hour_queries = dns_queries_series[-1]
            qps = round(last_hour_queries / 3600.0, 2)
        elif num_dns > 0:
            qps = round(num_dns / 86400.0, 2)

        # Top queried domains
        raw_top_domains = stats_data.get("top_queried_domains", [])
        top_domains: List[Dict[str, Any]] = []
        for item in raw_top_domains[:10]:
            if isinstance(item, dict):
                for domain, count in item.items():
                    top_domains.append({"domain": domain, "count": count})

        # Top blocked domains
        raw_top_blocked = stats_data.get("top_blocked_domains", [])
        top_blocked: List[Dict[str, Any]] = []
        for item in raw_top_blocked[:10]:
            if isinstance(item, dict):
                for domain, count in item.items():
                    top_blocked.append({"domain": domain, "count": count})

        # Top clients
        raw_top_clients = stats_data.get("top_clients", [])
        top_clients: List[Dict[str, Any]] = []
        for item in raw_top_clients[:8]:
            if isinstance(item, dict):
                for client_ip, count in item.items():
                    top_clients.append({"client": client_ip, "count": count})

        return {
            "configured": True,
            "available": True,
            "status": "ONLINE" if running else "OFFLINE",
            "version": status_data.get("version", "Indisponível"),
            "protection_enabled": protection,
            "dns_queries": num_dns,
            "blocked_queries": num_blocked,
            "blocked_percentage": blocked_pct,
            "queries_per_second": qps,
            "clients_count": len(top_clients) if top_clients else len(stats_data.get("top_clients", [])),
            "avg_processing_time_ms": avg_time_ms,
            "top_queried_domains": top_domains,
            "top_blocked_domains": top_blocked,
            "top_clients": top_clients,
            "message": "Conectado com sucesso ao AdGuard Home"
        }

    except Exception as e:
        return {
            "configured": True,
            "available": False,
            "status": "OFFLINE",
            "message": f"Erro de conexão com AdGuard Home ({str(e)})",
            "dns_queries": "Indisponível",
            "blocked_queries": "Indisponível",
            "blocked_percentage": "Indisponível",
            "queries_per_second": "Indisponível",
            "clients_count": "Indisponível",
            "avg_processing_time_ms": "Indisponível",
            "protection_enabled": "Indisponível",
            "top_queried_domains": [],
            "top_blocked_domains": [],
            "top_clients": []
        }
