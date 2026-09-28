import subprocess
import re
from typing import List, Dict, Any

# Lista canônica de serviços de interesse do Ubuntu Server com seus aliases
CANONICAL_SERVICES = [
    {
        "canonical": "ssh",
        "aliases": ["ssh", "sshd"],
        "name": "OpenSSH Server",
        "porta": 22,
        "descricao": "Serviço de acesso remoto seguro SSH"
    },
    {
        "canonical": "AdGuardHome",
        "aliases": ["AdGuardHome", "adguard-home"],
        "name": "AdGuard Home",
        "porta": "53, 8081",
        "descricao": "Servidor DNS com bloqueio de anúncios e rastreadores"
    },
    {
        "canonical": "server-panel",
        "aliases": ["server-panel", "server-monitor"],
        "name": "Server Panel",
        "porta": 8000,
        "descricao": "Daemon de monitoramento em tempo real"
    },
    {
        "canonical": "nginx",
        "aliases": ["nginx"],
        "name": "Nginx Web Server",
        "porta": "80, 443",
        "descricao": "Servidor proxy reverso HTTP"
    },
    {
        "canonical": "cron",
        "aliases": ["cron", "crond"],
        "name": "Cron Daemon",
        "porta": None,
        "descricao": "Agendador de tarefas periódicas"
    },
    {
        "canonical": "systemd-resolved",
        "aliases": ["systemd-resolved"],
        "name": "systemd-resolved",
        "porta": 53,
        "descricao": "Resolvedor DNS local do Ubuntu"
    },
    {
        "canonical": "ufw",
        "aliases": ["ufw"],
        "name": "UFW Firewall",
        "porta": None,
        "descricao": "Firewall do Ubuntu Server"
    },
    {
        "canonical": "docker",
        "aliases": ["docker"],
        "name": "Docker Engine",
        "porta": None,
        "descricao": "Mecanismo de contêineres Docker"
    },
    {
        "canonical": "fail2ban",
        "aliases": ["fail2ban"],
        "name": "Fail2Ban Security",
        "porta": None,
        "descricao": "Proteção contra ataques de força bruta"
    },
    {
        "canonical": "tailscaled",
        "aliases": ["tailscaled"],
        "name": "Tailscale VPN",
        "porta": None,
        "descricao": "Rede privada mesh VPN"
    },
    {
        "canonical": "n8n",
        "aliases": ["n8n"],
        "name": "n8n Workflow Automation",
        "porta": 5678,
        "descricao": "Automação de fluxos e integrações"
    }
]

SERVICE_PORTS = {svc["canonical"]: svc["porta"] for svc in CANONICAL_SERVICES if svc["porta"] is not None}

def format_systemd_uptime(active_enter_timestamp: str) -> str:
    """Extrai ou formata tempo ativo a partir do ActiveEnterTimestamp do systemd."""
    if not active_enter_timestamp or active_enter_timestamp == "n/a":
        return "N/D"
    return active_enter_timestamp.split("UTC")[0].strip()

def get_systemd_service_status(service_name: str) -> Dict[str, Any]:
    # Sanitização rigorosa do nome do serviço contra injeção
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '', service_name)
    if not clean_name:
        return {"name": service_name, "status": "OFFLINE", "cpu": "N/D", "memory": "N/D", "uptime": "N/D"}

    if not clean_name.endswith(".service"):
        unit_name = f"{clean_name}.service"
    else:
        unit_name = clean_name

    try:
        # Consulta propriedades seguras através do systemctl show
        result = subprocess.run(
            [
                "systemctl", "show", unit_name,
                "--property=ActiveState,SubState,LoadState,UnitFileState,MainPID,Description,ActiveEnterTimestamp,CPUUsageNSec,MemoryCurrent"
            ],
            capture_output=True,
            text=True,
            timeout=3
        )

        props = {}
        for line in result.stdout.strip().splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                props[k.strip()] = v.strip()

        load_state = props.get("LoadState", "not-found")
        active_state = props.get("ActiveState", "inactive")
        sub_state = props.get("SubState", "dead")
        unit_file_state = props.get("UnitFileState", "disabled")
        is_enabled = unit_file_state == "enabled"
        main_pid = int(props.get("MainPID", "0")) if props.get("MainPID", "").isdigit() else None
        if main_pid == 0:
            main_pid = None
        description = props.get("Description", "")
        
        # Se o serviço não existe/não foi instalado
        if load_state == "not-found":
            return {
                "name": clean_name.replace(".service", ""),
                "nome": clean_name.replace(".service", ""),
                "status": "OFFLINE",
                "ativo": False,
                "habilitado_boot": False,
                "installed": False,
                "pid": None,
                "descricao": "Serviço não instalado",
                "porta": SERVICE_PORTS.get(clean_name.replace(".service", ""), None),
                "cpu": "N/D",
                "memory": "N/D",
                "uptime": "Não instalado"
            }

        # Mapeamento do status para as 3 categorias obrigatórias
        is_active = (active_state == "active" and sub_state in ["running", "listening"])
        if is_active:
            display_status = "ONLINE"
        elif active_state == "failed" or sub_state == "failed":
            display_status = "ERRO"
        else:
            display_status = "OFFLINE"

        # Consumo de memória (MemoryCurrent em bytes)
        memory_str = "N/D"
        mem_curr = props.get("MemoryCurrent", "")
        if mem_curr and mem_curr.isdigit() and int(mem_curr) < 18446744073709551615: # Not MAX_UINT
            bytes_val = int(mem_curr)
            if bytes_val > 1024 * 1024 * 1024:
                memory_str = f"{round(bytes_val / (1024**3), 2)} GB"
            else:
                memory_str = f"{round(bytes_val / (1024**2), 1)} MB"

        # Consumo de CPU acumulado (CPUUsageNSec)
        cpu_str = "N/D"
        cpu_nsec = props.get("CPUUsageNSec", "")
        if cpu_nsec and cpu_nsec.isdigit() and int(cpu_nsec) > 0:
            cpu_seconds = round(int(cpu_nsec) / 1_000_000_000, 1)
            cpu_str = f"{cpu_seconds}s total"

        active_time = props.get("ActiveEnterTimestamp", "")
        uptime_display = "Inativo"
        if display_status == "ONLINE":
            uptime_display = format_systemd_uptime(active_time) if active_time else "Ativo"
        elif display_status == "ERRO":
            uptime_display = "Falhou"

        svc_short = clean_name.replace(".service", "")
        return {
            "name": svc_short,
            "nome": svc_short,
            "status": display_status,
            "ativo": is_active,
            "habilitado_boot": is_enabled,
            "installed": True,
            "sub_state": sub_state,
            "pid": main_pid,
            "tempo_ativo": uptime_display,
            "ultima_inicializacao": active_time if active_time and active_time != "n/a" else "N/D",
            "descricao": description or f"Serviço {svc_short}",
            "porta": SERVICE_PORTS.get(svc_short, None),
            "cpu": cpu_str,
            "memory": memory_str,
            "uptime": uptime_display
        }
    except Exception as e:
        svc_short = clean_name.replace(".service", "")
        return {
            "name": svc_short,
            "nome": svc_short,
            "status": "OFFLINE",
            "ativo": False,
            "habilitado_boot": False,
            "installed": False,
            "pid": None,
            "descricao": "Erro ao consultar serviço",
            "porta": SERVICE_PORTS.get(svc_short, None),
            "cpu": "N/D",
            "memory": "N/D",
            "uptime": "Indisponível"
        }

def get_all_monitored_services(extra_services: List[str] = None) -> List[Dict[str, Any]]:
    """Consulta lista canônica de serviços sem duplicatas e retorna status consolidado."""
    results = []
    seen_canonical = set()

    for item in CANONICAL_SERVICES:
        canonical = item["canonical"]
        aliases = item.get("aliases", [canonical])
        selected_info = None

        # Testa os aliases para encontrar o que está instalado/ativo no host
        for alias in aliases:
            info = get_systemd_service_status(alias)
            if info.get("installed") and info.get("status") == "ONLINE":
                selected_info = info
                break
            elif info.get("installed") and not selected_info:
                selected_info = info

        # Se nenhum alias estiver instalado, usa o primeiro alias como representação
        if not selected_info:
            selected_info = get_systemd_service_status(aliases[0])

        # Aplica metadados amigáveis
        selected_info["name"] = item.get("name", canonical)
        selected_info["nome"] = item.get("name", canonical)
        selected_info["canonical"] = canonical
        if item.get("descricao") and (selected_info.get("descricao") == "Serviço não instalado" or not selected_info.get("descricao")):
            selected_info["descricao"] = item["descricao"]
        if item.get("porta") is not None and not selected_info.get("porta"):
            selected_info["porta"] = item["porta"]

        results.append(selected_info)
        seen_canonical.add(canonical.lower())
        for a in aliases:
            seen_canonical.add(a.lower())

    # Adiciona serviços extras solicitados caso não existam
    if extra_services:
        for s in extra_services:
            clean_s = s.lower().replace(".service", "").strip()
            if clean_s not in seen_canonical:
                info = get_systemd_service_status(s)
                results.append(info)
                seen_canonical.add(clean_s)

    # Ordena: ONLINE primeiro, depois ERRO, depois OFFLINE
    order_map = {"ONLINE": 0, "ERRO": 1, "OFFLINE": 2}
    results.sort(key=lambda x: (order_map.get(x["status"], 3), x["name"]))
    return results
