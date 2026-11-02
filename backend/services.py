import subprocess

MONITORED_SERVICES = [
    {"name": "ssh", "nome": "OpenSSH Server", "canonical": "ssh"},
    {"name": "AdGuardHome", "nome": "AdGuard Home DNS", "canonical": "AdGuardHome"},
    {"name": "adguard-ai", "nome": "Server Panel NOC", "canonical": "adguard-ai"},
    {"name": "nginx", "nome": "Nginx Web Server", "canonical": "nginx"},
    {"name": "cron", "nome": "Cron Scheduler", "canonical": "cron"},
    {"name": "systemd-resolved", "nome": "Systemd Resolved", "canonical": "systemd-resolved"},
    {"name": "ufw", "nome": "UFW Firewall", "canonical": "ufw"},
    {"name": "docker", "nome": "Docker Daemon", "canonical": "docker"},
    {"name": "fail2ban", "nome": "Fail2ban Security", "canonical": "fail2ban"},
    {"name": "tailscaled", "nome": "Tailscale VPN", "canonical": "tailscaled"},
    {"name": "n8n", "nome": "n8n Automation", "canonical": "n8n"}
]

def check_systemd_service(service_name: str) -> dict:
    try:
        active_proc = subprocess.run(
            ["systemctl", "is-active", service_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=2
        )
        is_active = active_proc.stdout.strip() == "active"

        enabled_proc = subprocess.run(
            ["systemctl", "is-enabled", service_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=2
        )
        is_enabled = enabled_proc.stdout.strip() == "enabled"

        return {
            "installed": active_proc.returncode != 4,
            "ativo": is_active,
            "habilitado_boot": is_enabled,
            "status": "ONLINE" if is_active else "OFFLINE"
        }
    except Exception:
        return {
            "installed": False,
            "ativo": False,
            "habilitado_boot": False,
            "status": "OFFLINE"
        }

def get_all_services():
    services_status = []
    for s in MONITORED_SERVICES:
        st = check_systemd_service(s["name"])
        services_status.append({
            "name": s["name"],
            "nome": s["nome"],
            "canonical": s["canonical"],
            "status": st["status"],
            "ativo": st["ativo"],
            "habilitado_boot": st["habilitado_boot"],
            "installed": st["installed"],
            "sub_status": "running" if st["ativo"] else "stopped"
        })
    return services_status
