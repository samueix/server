import subprocess
import re
from typing import List, Dict, Any

# Lista de serviços systemd importantes monitorados por padrão
DEFAULT_IMPORTANT_SERVICES = [
    "ssh",
    "AdGuardHome",
    "adguard-home",
    "server-panel",
    "server-monitor",
    "cron",
    "systemd-resolved",
    "nginx",
    "ufw",
    "docker",
    "fail2ban",
    "tailscaled",
    "n8n"
]

SERVICE_PORTS = {
    "ssh": 22,
    "AdGuardHome": "53, 8081",
    "adguard-home": "53, 8081",
    "nginx": "80, 443",
    "server-panel": 8000,
    "server-monitor": 8000,
    "n8n": 5678,
    "systemd-resolved": 53
}

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
    """Consulta lista de serviços de interesse e retorna apenas aqueles instalados ou críticos."""
    service_list = list(DEFAULT_IMPORTANT_SERVICES)
    if extra_services:
        for s in extra_services:
            if s not in service_list:
                service_list.append(s)

    results = []
    for svc in service_list:
        info = get_systemd_service_status(svc)
        # Se for um serviço relevante instalado ou que o usuário gostaria de saber que está offline
        results.append(info)

    # Ordena: ONLINE primeiro, depois ERRO, depois OFFLINE
    order_map = {"ONLINE": 0, "ERRO": 1, "OFFLINE": 2}
    results.sort(key=lambda x: (order_map.get(x["status"], 3), x["name"]))
    return results
