import os
import time
import socket
import platform
import psutil

def get_uptime_info():
    boot_time = psutil.boot_time()
    uptime_sec = int(time.time() - boot_time)
    days = uptime_sec // 86400
    hours = (uptime_sec % 86400) // 3600
    minutes = (uptime_sec % 3600) // 60
    seconds = uptime_sec % 60
    return {
        "segundos_total": uptime_sec,
        "dias": days,
        "horas": hours,
        "minutos": minutes,
        "segundos": seconds,
        "formatado": f"{days}d {hours}h {minutes}m {seconds}s"
    }

def get_system_info():
    hostname = socket.gethostname()
    uname = platform.uname()
    return {
        "hostname": hostname,
        "sistema": uname.system,
        "release": uname.release,
        "versao": uname.version,
        "arquitetura": uname.machine,
        "nome": "Ubuntu Linux" if "Ubuntu" in uname.version or os.path.exists("/etc/lsb-release") else uname.system
    }

def get_cpu_info():
    percent_total = psutil.cpu_percent(interval=0.1)
    percent_cores = psutil.cpu_percent(interval=0.1, percpu=True)
    count_physical = psutil.cpu_count(logical=False) or 1
    count_logical = psutil.cpu_count(logical=True) or 1
    freq = psutil.cpu_freq()

    return {
        "uso_percentual": percent_total,
        "nucleos_fisicos": count_physical,
        "nucleos_logicos": count_logical,
        "frequencia_mhz": round(freq.current, 1) if freq else None,
        "por_nucleo": [{"nucleo": i, "uso_percentual": p} for i, p in enumerate(percent_cores)]
    }

def get_memory_info():
    v = psutil.virtual_memory()
    s = psutil.swap_memory()
    return {
        "total_gb": round(v.total / (1024**3), 2),
        "usada_gb": round(v.used / (1024**3), 2),
        "livre_gb": round(v.free / (1024**3), 2),
        "disponivel_gb": round(v.available / (1024**3), 2),
        "cached_gb": round(getattr(v, 'cached', 0) / (1024**3), 2),
        "uso_percentual": v.percent,
        "swap": {
            "total_gb": round(s.total / (1024**3), 2),
            "usada_gb": round(s.used / (1024**3), 2),
            "livre_gb": round(s.free / (1024**3), 2),
            "uso_percentual": s.percent
        }
    }

def get_disk_info():
    partitions = []
    root_usage = None
    for p in psutil.disk_partitions(all=False):
        if 'loop' in p.device:
            continue
        try:
            u = psutil.disk_usage(p.mountpoint)
            p_data = {
                "dispositivo": p.device,
                "ponto_montagem": p.mountpoint,
                "tipo_fs": p.fstype,
                "total_gb": round(u.total / (1024**3), 2),
                "usado_gb": round(u.used / (1024**3), 2),
                "livre_gb": round(u.free / (1024**3), 2),
                "uso_percentual": u.percent,
                "alerta": u.percent >= 85
            }
            partitions.append(p_data)
            if p.mountpoint == '/':
                root_usage = p_data
        except PermissionError:
            continue

    if not root_usage and partitions:
        root_usage = partitions[0]

    return {
        "total_gb": root_usage["total_gb"] if root_usage else 0,
        "usado_gb": root_usage["usado_gb"] if root_usage else 0,
        "livre_gb": root_usage["livre_gb"] if root_usage else 0,
        "uso_percentual": root_usage["uso_percentual"] if root_usage else 0,
        "particoes": partitions
    }

def get_temperature_info():
    import re, os

    sensores = []
    cores = []

    # 1) psutil (quando disponível)
    if hasattr(psutil, "sensors_temperatures"):
        try:
            temps = psutil.sensors_temperatures() or {}
            for name, entries in temps.items():
                for entry in entries:
                    if not entry or entry.current is None:
                        continue
                    label = entry.label or name
                    lower = str(label).lower()
                    is_core = "core" in lower
                    m = re.search(r"core\s*(\d+)", lower)
                    item = {
                        "sensor": name,
                        "nome": label,
                        "temperatura_c": round(float(entry.current), 1),
                        "maxima_c": round(float(entry.high), 1) if entry.high else None,
                        "critica_c": round(float(entry.critical), 1) if entry.critical else None,
                        "isCore": is_core,
                    }
                    if m:
                        item["coreIndex"] = int(m.group(1))
                    sensores.append(item)
                    if is_core:
                        cores.append(item)
        except Exception:
            pass

    # 2) Fallback via sysfs hwmon (mais confiável em alguns hosts)
    if not sensores:
        try:
            base_hw = "/sys/class/hwmon"
            if os.path.isdir(base_hw):
                for hw in os.listdir(base_hw):
                    base = os.path.join(base_hw, hw)
                    try:
                        with open(os.path.join(base, "name")) as f:
                            chip = f.read().strip() or hw
                    except Exception:
                        chip = hw
                    try:
                        files = os.listdir(base)
                    except Exception:
                        continue
                    for fn in files:
                        if not fn.startswith("temp") or not fn.endswith("_input"):
                            continue
                        tid = fn.replace("_input", "")
                        try:
                            with open(os.path.join(base, fn)) as f:
                                raw = f.read().strip()
                            val = float(raw)
                            temp_c = round((val / 1000.0) if val > 200 else val, 1)
                        except Exception:
                            continue
                        if temp_c <= 0 or temp_c >= 130:
                            continue
                        label = f"{chip} {tid}"
                        try:
                            lf = os.path.join(base, f"{tid}_label")
                            if os.path.exists(lf):
                                with open(lf) as f:
                                    label = f.read().strip() or label
                        except Exception:
                            pass
                        def read_t(suffix):
                            p = os.path.join(base, f"{tid}_{suffix}")
                            if not os.path.exists(p):
                                return None
                            try:
                                with open(p) as f:
                                    v = float(f.read().strip())
                                return round((v / 1000.0) if v > 200 else v, 1)
                            except Exception:
                                return None
                        lower = label.lower()
                        is_core = "core" in lower
                        m = re.search(r"core\s*(\d+)", lower)
                        item = {
                            "sensor": chip,
                            "nome": label,
                            "temperatura_c": temp_c,
                            "maxima_c": read_t("max"),
                            "critica_c": read_t("crit"),
                            "isCore": is_core,
                        }
                        if m:
                            item["coreIndex"] = int(m.group(1))
                        sensores.append(item)
                        if is_core:
                            cores.append(item)
        except Exception:
            pass

    # 3) Complemento thermal_zone
    try:
        tz_base = "/sys/class/thermal"
        if os.path.isdir(tz_base):
            existing = {(s.get("nome"), s.get("temperatura_c")) for s in sensores}
            for tz in os.listdir(tz_base):
                if not tz.startswith("thermal_zone"):
                    continue
                base = os.path.join(tz_base, tz)
                try:
                    with open(os.path.join(base, "type")) as f:
                        tname = f.read().strip() or tz
                    with open(os.path.join(base, "temp")) as f:
                        raw = float(f.read().strip())
                    temp_c = round((raw / 1000.0) if raw > 200 else raw, 1)
                except Exception:
                    continue
                if temp_c <= 0 or temp_c >= 130:
                    continue
                if (tname, temp_c) in existing:
                    continue
                sensores.append({
                    "sensor": "thermal_zone",
                    "nome": tname,
                    "temperatura_c": temp_c,
                    "isCore": False,
                })
    except Exception:
        pass

    # escolher temperatura principal (CPU package preferencial)
    def pick_main():
        if not sensores:
            return None
        def find(rx):
            for s in sensores:
                if re.search(rx, (s.get("nome") or "").lower()):
                    return s
            return None
        return (find(r"package id") or find(r"x86_pkg_temp") or find(r"tctl") or
                find(r"cpu") or (cores[0] if cores else None) or sensores[0])

    main = pick_main()
    main_temp = main.get("temperatura_c") if main else None

    return {
        "disponivel": len(sensores) > 0,
        "temperatura_c": main_temp,
        "sensores": sensores,
        "cores": cores,
    }

def get_network_info():
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    io = psutil.net_io_counters(pernic=True)

    interfaces = []
    primary_ip = None
    primary_ipv6 = None

    for iface, addr_list in addrs.items():
        if iface.startswith('lo'):
            continue
        stat = stats.get(iface)
        is_up = stat.isup if stat else False
        ipv4 = None
        ipv6 = None
        mac = None

        for a in addr_list:
            if a.family == socket.AF_INET:
                ipv4 = a.address
            elif a.family == socket.AF_INET6:
                if not a.address.startswith('fe80'):
                    ipv6 = a.address
            elif hasattr(psutil, 'AF_LINK') and a.family == psutil.AF_LINK:
                mac = a.address

        if is_up and ipv4 and not primary_ip:
            primary_ip = ipv4
        if is_up and ipv6 and not primary_ipv6:
            primary_ipv6 = ipv6

        nic_io = io.get(iface)
        interfaces.append({
            "nome": iface,
            "status": "UP" if is_up else "DOWN",
            "ipv4": ipv4,
            "ipv6": ipv6,
            "mac": mac,
            "velocidade_mbps": stat.speed if stat else 0,
            "bytes_enviados": nic_io.bytes_sent if nic_io else 0,
            "bytes_recebidos": nic_io.bytes_recv if nic_io else 0
        })

    return {
        "primaryIp": primary_ip or "127.0.0.1",
        "primaryIpv6": primary_ipv6,
        "interfaces": interfaces
    }

def get_top_processes(limit=30, sort_by="cpu"):
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_percent', 'status', 'create_time', 'cmdline']):
        try:
            info = p.info
            procs.append({
                "pid": info['pid'],
                "nome": info['name'] or 'unknown',
                "usuario": info['username'] or 'root',
                "cpu_percent": round(info['cpu_percent'] or 0, 1),
                "memoria_percent": round(info['memory_percent'] or 0, 1),
                "status": info['status'] or 'running',
                "comando": " ".join(info['cmdline']) if info.get('cmdline') else info['name']
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if sort_by == "memoria":
        procs.sort(key=lambda x: x["memoria_percent"], reverse=True)
    else:
        procs.sort(key=lambda x: x["cpu_percent"], reverse=True)

    return procs[:limit]

def get_full_snapshot():
    return {
        "servidor": socket.gethostname(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sistema": get_system_info(),
        "uptime": get_uptime_info(),
        "cpu": get_cpu_info(),
        "memoria": get_memory_info(),
        "disco": get_disk_info(),
        "temperatura": get_temperature_info(),
        "rede": get_network_info()
    }
