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
    sensores = []
    main_temp = None

    if hasattr(psutil, "sensors_temperatures"):
        try:
            temps = psutil.sensors_temperatures()
            for name, entries in temps.items():
                for entry in entries:
                    sensor_item = {
                        "sensor": name,
                        "nome": entry.label or name,
                        "temperatura_c": round(entry.current, 1) if entry.current else 0,
                        "critica": entry.critical or 85,
                        "alta": entry.high or 75
                    }
                    sensores.append(sensor_item)
                    if main_temp is None and entry.current:
                        main_temp = round(entry.current, 1)
        except Exception:
            pass

    return {
        "disponivel": len(sensores) > 0,
        "temperatura_c": main_temp,
        "sensores": sensores
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
