import os
import httpx
from typing import Dict, Any, List

DEFAULT_N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDkxMWM0Ny1iNTAzLTRlZGQtYmM0ZS0xZjViZWIyNmM3Y2IiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZDI3MDc0MzUtOWU0My00ZWExLWFkYzAtYTNiYjIwZmUyZjc0IiwiaWF0IjoxNzkxMjMwNjgzfQ.D8oeda_ApWe9DK06D5JZc7L0ZJ2IeA4B-uyok2Poluw"
DEFAULT_N8N_URL = os.getenv("N8N_URL", "http://127.0.0.1:5678")

async def fetch_n8n_status() -> Dict[str, Any]:
    api_key = os.getenv("N8N_API_KEY", DEFAULT_N8N_API_KEY)
    
    candidate_urls = [
        os.getenv("N8N_URL", "http://127.0.0.1:5678").rstrip("/"),
        "http://127.0.0.1:5678",
        "http://localhost:5678",
        "http://[2804:2d5c:a2:852:5ecd:5bff:fe5a:7445]:5678",
        "http://192.168.100.23:5678"
    ]
    
    # Remove duplicatas preservando ordem
    seen = set()
    unique_urls = []
    for u in candidate_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    async with httpx.AsyncClient(timeout=3.0) as client:
        for base_url in unique_urls:
            try:
                # 1. Testa healthz
                health_res = await client.get(f"{base_url}/healthz")
                if health_res.status_code == 200:
                    workflows = []
                    api_connected = False
                    api_error = None
                    
                    if api_key:
                        try:
                            headers = {
                                "Accept": "application/json",
                                "X-N8N-API-KEY": api_key,
                                "Authorization": f"Bearer {api_key}"
                            }
                            wf_res = await client.get(f"{base_url}/api/v1/workflows?limit=100", headers=headers)
                            if wf_res.status_code == 200:
                                api_connected = True
                                json_data = wf_res.json()
                                items = json_data.get("data", [])
                                for wf in items:
                                    workflows.append({
                                        "id": str(wf.get("id", "")),
                                        "name": wf.get("name") or "Fluxo sem título",
                                        "active": bool(wf.get("active", False)),
                                        "createdAt": wf.get("createdAt", ""),
                                        "updatedAt": wf.get("updatedAt", ""),
                                        "tags": [t.get("name") if isinstance(t, dict) else str(t) for t in wf.get("tags", [])],
                                        "nodesCount": len(wf.get("nodes", [])) if isinstance(wf.get("nodes"), list) else 0,
                                        "triggers": ["Manual/Trigger"],
                                        "executionsCount": 0
                                    })
                            elif wf_res.status_code in (401, 403):
                                api_error = "Chave de API inválida no n8n."
                            else:
                                api_error = f"Status {wf_res.status_code} na API de workflows."
                        except Exception as e:
                            api_error = str(e)
                    
                    active_count = sum(1 for w in workflows if w.get("active"))
                    return {
                        "status": "ok",
                        "online": True,
                        "url": base_url,
                        "apiConnected": api_connected,
                        "apiAuthError": api_error,
                        "hasApiKey": bool(api_key),
                        "version": "1.78.1",
                        "activeWorkflowsCount": active_count,
                        "totalWorkflowsCount": len(workflows),
                        "workflows": workflows
                    }
            except Exception:
                continue

    return {
        "status": "offline",
        "online": False,
        "url": DEFAULT_N8N_URL,
        "apiConnected": False,
        "apiAuthError": "Servidor n8n não está respondendo na porta 5678.",
        "hasApiKey": bool(api_key),
        "version": None,
        "activeWorkflowsCount": 0,
        "totalWorkflowsCount": 0,
        "workflows": []
    }
