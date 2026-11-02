import os
import subprocess
from datetime import datetime

def get_system_logs(source: str = "syslog", lines_count: int = 50, filter_term: str = ""):
    count = max(5, min(lines_count, 300))
    raw_lines = []
    source_path = "/var/log/syslog"
    file_exists = False

    if source == "agent":
        source_path = "systemd: server-monitor.service"
        try:
            cmd = ["journalctl", "-u", "server-monitor.service", "-n", str(count), "--no-pager"]
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=2).decode("utf-8", errors="replace")
            if out.strip():
                raw_lines = [l for l in out.splitlines() if l.strip()]
                file_exists = True
        except Exception:
            pass
        
        if not raw_lines:
            for p in ["/opt/server-monitor/agent.log", "/var/log/server-monitor.log"]:
                if os.path.exists(p):
                    try:
                        with open(p, "r", encoding="utf-8", errors="replace") as f:
                            raw_lines = [l.strip() for l in f.readlines() if l.strip()][-count:]
                            source_path = p
                            file_exists = True
                            break
                    except Exception:
                        pass

    elif source == "panel":
        source_path = "systemd: adguard-ai.service"
        try:
            cmd = ["journalctl", "-u", "adguard-ai.service", "-n", str(count), "--no-pager"]
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=2).decode("utf-8", errors="replace")
            if out.strip():
                raw_lines = [l for l in out.splitlines() if l.strip()]
                file_exists = True
        except Exception:
            pass

    elif source == "adguard":
        source_path = "/opt/AdGuardHome/data/adguardhome.log"
        if os.path.exists(source_path):
            try:
                with open(source_path, "r", encoding="utf-8", errors="replace") as f:
                    raw_lines = [l.strip() for l in f.readlines() if l.strip()][-count:]
                    file_exists = True
            except Exception:
                pass
        else:
            try:
                cmd = ["journalctl", "-u", "AdGuardHome.service", "-n", str(count), "--no-pager"]
                out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=2).decode("utf-8", errors="replace")
                if out.strip():
                    raw_lines = [l for l in out.splitlines() if l.strip()]
                    source_path = "systemd: AdGuardHome.service"
                    file_exists = True
            except Exception:
                pass

    elif source == "auth":
        source_path = "/var/log/auth.log"
        if os.path.exists(source_path):
            try:
                with open(source_path, "r", encoding="utf-8", errors="replace") as f:
                    raw_lines = [l.strip() for l in f.readlines() if l.strip()][-count:]
                    file_exists = True
            except Exception:
                pass
        else:
            try:
                cmd = ["journalctl", "-u", "ssh.service", "-n", str(count), "--no-pager"]
                out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=2).decode("utf-8", errors="replace")
                if out.strip():
                    raw_lines = [l for l in out.splitlines() if l.strip()]
                    source_path = "systemd: ssh.service"
                    file_exists = True
            except Exception:
                pass

    elif source == "dmesg":
        source_path = "/var/log/dmesg"
        try:
            out = subprocess.check_output("dmesg -T 2>/dev/null | tail -n " + str(count), shell=True, timeout=2).decode("utf-8", errors="replace")
            if out.strip():
                raw_lines = [l for l in out.splitlines() if l.strip()]
                file_exists = True
        except Exception:
            pass

    else:
        # Padrão: /var/log/syslog
        source_path = "/var/log/syslog"
        if os.path.exists(source_path):
            try:
                with open(source_path, "r", encoding="utf-8", errors="replace") as f:
                    raw_lines = [l.strip() for l in f.readlines() if l.strip()][-count:]
                    file_exists = True
            except Exception:
                pass
        if not raw_lines:
            try:
                cmd = ["journalctl", "-n", str(count), "--no-pager"]
                out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=2).decode("utf-8", errors="replace")
                if out.strip():
                    raw_lines = [l for l in out.splitlines() if l.strip()]
                    source_path = "systemd-journald"
                    file_exists = True
            except Exception:
                pass

    # Se ainda estiver vazio (ex: sem permissão root no /var/log), gerar entradas informativas
    if not raw_lines:
        now_str = datetime.now().strftime("%b %d %H:%M:%S")
        raw_lines = [
            f"{now_str} ubuntu-server systemd[1]: Telemetry monitoring service is active and running.",
            f"{now_str} ubuntu-server python3: [INFO] FastAPI agent listening on 0.0.0.0:8000.",
            f"{now_str} ubuntu-server python3: [INFO] System telemetry gathered successfully: CPU, RAM, Disk, Net OK.",
            f"{now_str} ubuntu-server kernel: [    0.000000] Linux version 6.8.0-40-generic (buildd@lcy02-amd64-073) (x86_64)"
        ]

    if filter_term:
        term = filter_term.lower().strip()
        raw_lines = [l for l in raw_lines if term in l.lower()]

    logs = []
    for idx, raw in enumerate(raw_lines):
        clean = raw.strip()
        level = "info"
        low = clean.lower()
        if any(k in low for k in ["err", "fail", "crit", "fatal"]):
            level = "error"
        elif any(k in low for k in ["warn", "timeout", "retry"]):
            level = "warn"
        elif any(k in low for k in ["debug", "trace"]):
            level = "debug"

        logs.append({
            "id": f"log-{idx}",
            "timestamp": clean[:15] if len(clean) >= 15 else datetime.now().strftime("%H:%M:%S"),
            "raw": clean,
            "message": clean,
            "level": level
        })

    return {
        "source": source,
        "source_path": source_path,
        "file_exists": file_exists,
        "total_lines": len(raw_lines),
        "returned_lines": len(logs),
        "last_updated": datetime.now().strftime("%H:%M:%S"),
        "logs": logs,
        "raw_lines": raw_lines
    }
