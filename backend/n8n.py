import os
import httpx
from typing import Dict, Any, List

DEFAULT_N8N_URL = os.getenv("N8N_URL", "http://127.0.0.1:5678")

_custom_n8n_key: str = None
_custom_n8n_url: str = None

def update_n8n_config(url: str = None, api_key: str = None):
    global _custom_n8n_url, _custom_n8n_key
    if url:
        _custom_n8n_url = url.rstrip("/")
    if api_key is not None:
        _custom_n8n_key = api_key.strip()

async def fetch_n8n_status() -> Dict[str, Any]:
    api_key = _custom_n8n_key if _custom_n8n_key is not None else os.getenv("N8N_API_KEY", "")
    active_base = _custom_n8n_url or os.getenv("N8N_URL", "http://127.0.0.1:5678").rstrip("/")
    
    if not api_key:
        return {
            "status": "unconfigured",
            "online": False,
            "url": active_base,
            "apiConnected": False,
            "apiAuthError": "n8n não configurado: Nenhuma chave N8N_API_KEY informada.",
            "hasApiKey": False,
            "message": "n8n não configurado",
            "version": None,
            "activeWorkflowsCount": 0,
            "totalWorkflowsCount": 0,
            "workflows": []
        }

    candidate_urls = [
        active_base,
        "http://127.0.0.1:5678",
        "http://localhost:5678",
        "http://192.168.100.23:5678"
    ]
    
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
                        "status": "ok" if api_connected else "warning",
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
