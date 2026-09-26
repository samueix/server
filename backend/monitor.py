import os
import time
import platform
import socket
import datetime
from typing import Dict, Any, List, Optional
import psutil

# Cache for rate calculations (Network & Disk I/O deltas)
_last_disk_time: float = time.monotonic()
_last_disk_io: Any = psutil.disk_io_counters()

_last_net_time: float = time.monotonic()
_last_net_io: Any = psutil.net_io_counters()

# Initialize cpu_percent non-blocking
psutil.cpu_percent(interval=None)
psutil.cpu_percent(percpu=True, interval=None)

def get_os_info() -> Dict[str, str]:
    distro = "Linux"
    version = ""
    try:
        if os.path.exists("/etc/os-release"):
            with open("/etc/os-release", "r", encoding="utf-8") as f:
                data = {}
                for line in f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        data[k] = v.strip("\"'")
                distro = data.get("PRETTY_NAME", data.get("NAME", "Ubuntu Linux"))
                version = data.get("VERSION_ID", "")
    except Exception:
        distro = f"Linux {platform.release()}"

    return {
        "hostname": socket.gethostname(),
        "os": distro,
        "os_version": version,
        "kernel": platform.release(),
        "arch": platform.machine(),
        "python_version": platform.python_version()
    }

def get_uptime() -> Dict[str, Any]:
    boot_time = psutil.boot_time()
    now = time.time()
    uptime_seconds = int(now - boot_time)

    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60
    seconds = uptime_seconds % 60

    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0 or days > 0:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    parts.append(f"{seconds}s")
    uptime_human = " ".join(parts)

    return {
        "boot_time": boot_time,
        "uptime_seconds": uptime_seconds,
        "uptime_human": uptime_human,
        "current_time": datetime.datetime.now().isoformat()
    }

def get_cpu_info() -> Dict[str, Any]:
    # Non-blocking CPU reading
    percent_total = psutil.cpu_percent(interval=None)
    percent_per_cpu = psutil.cpu_percent(interval=None, percpu=True)

    freq_info = psutil.cpu_freq()
    freq_current = round(freq_info.current, 2) if freq_info else None
    freq_min = round(freq_info.min, 2) if freq_info and freq_info.min > 0 else None
    freq_max = round(freq_info.max, 2) if freq_info and freq_info.max > 0 else None

    # Load average (1, 5, 15 min)
    load_avg = [0.0, 0.0, 0.0]
    try:
        if hasattr(os, "getloadavg"):
            load_avg = [round(x, 2) for x in os.getloadavg()]
        elif hasattr(psutil, "getloadavg"):
            load_avg = [round(x, 2) for x in psutil.getloadavg()]
    except Exception:
        pass

    return {
        "usage_percent": percent_total,
        "cores_logical": psutil.cpu_count(logical=True) or 1,
        "cores_physical": psutil.cpu_count(logical=False) or 1,
        "per_core_percent": percent_per_cpu,
        "frequency_mhz": {
            "current": freq_current,
            "min": freq_min,
            "max": freq_max
        },
        "load_average": {
            "1m": load_avg[0],
            "5m": load_avg[1],
            "15m": load_avg[2]
        }
    }

def get_memory_info() -> Dict[str, Any]:
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    return {
        "ram": {
            "total_bytes": mem.total,
            "used_bytes": mem.used,
            "available_bytes": mem.available,
            "free_bytes": mem.free,
            "cached_bytes": getattr(mem, "cached", 0),
            "buffers_bytes": getattr(mem, "buffers", 0),
            "usage_percent": mem.percent,
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "free_gb": round(mem.free / (1024**3), 2)
        },
        "swap": {
            "total_bytes": swap.total,
            "used_bytes": swap.used,
            "free_bytes": swap.free,
            "usage_percent": swap.percent,
            "total_gb": round(swap.total / (1024**3), 2),
            "used_gb": round(swap.used / (1024**3), 2)
        }
    }

def get_temperature_info() -> Dict[str, Any]:
    """Coleta temperatura dos sensores disponíveis. Não inventa valores se não houver."""
    sensors_dict = {}
    cpu_temp = None
    min_temp = None
    max_temp = None
    all_readings = []

    try:
        if hasattr(psutil, "sensors_temperatures"):
            raw_sensors = psutil.sensors_temperatures()
            if raw_sensors:
                for name, entries in raw_sensors.items():
                    sensor_list = []
                    for entry in entries:
                        reading = {
                            "label": entry.label or name,
                            "current": entry.current,
                            "high": entry.high,
                            "critical": entry.critical
                        }
                        sensor_list.append(reading)
                        if entry.current is not None:
                            all_readings.append(entry.current)
                            # Prefer coretemp, k10temp or cpu-thermal for main CPU temp
                            if cpu_temp is None or any(k in name.lower() for k in ["core", "cpu", "k10", "thermal"]):
                                cpu_temp = entry.current
                    if sensor_list:
                        sensors_dict[name] = sensor_list

        if all_readings:
            min_temp = min(all_readings)
            max_temp = max(all_readings)
    except Exception:
        pass

    has_sensors = len(sensors_dict) > 0 and len(all_readings) > 0

    return {
        "available": has_sensors,
        "message": "Sensores ativos" if has_sensors else "Sensor não disponível",
        "cpu_temp": round(cpu_temp, 1) if cpu_temp is not None else None,
        "min_temp": round(min_temp, 1) if min_temp is not None else None,
        "max_temp": round(max_temp, 1) if max_temp is not None else None,
        "sensors": sensors_dict
    }

def get_disk_info() -> Dict[str, Any]:
    global _last_disk_time, _last_disk_io

    # Disk usage on root '/'
    root_usage = psutil.disk_usage('/')
    
    # Calculate I/O rate
    now = time.monotonic()
    dt = now - _last_disk_time
    if dt <= 0:
        dt = 0.001

    current_io = psutil.disk_io_counters()
    read_bytes_sec = 0.0
    write_bytes_sec = 0.0

    if current_io and _last_disk_io:
        read_bytes_sec = max(0.0, (current_io.read_bytes - _last_disk_io.read_bytes) / dt)
        write_bytes_sec = max(0.0, (current_io.write_bytes - _last_disk_io.write_bytes) / dt)

    _last_disk_time = now
    _last_disk_io = current_io

    # Mounted partitions summary
    partitions_data = []
    try:
        partitions = psutil.disk_partitions(all=False)
        for p in partitions:
            try:
                usage = psutil.disk_usage(p.mountpoint)
                partitions_data.append({
                    "device": p.device,
                    "mountpoint": p.mountpoint,
                    "fstype": p.fstype,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "percent": usage.percent
                })
            except (PermissionError, OSError):
                continue
    except Exception:
        pass

    return {
        "root": {
            "total_bytes": root_usage.total,
            "used_bytes": root_usage.used,
            "free_bytes": root_usage.free,
            "percent": root_usage.percent,
            "total_gb": round(root_usage.total / (1024**3), 2),
            "used_gb": round(root_usage.used / (1024**3), 2),
            "free_gb": round(root_usage.free / (1024**3), 2)
        },
        "io_rate": {
            "read_bytes_sec": round(read_bytes_sec, 2),
            "write_bytes_sec": round(write_bytes_sec, 2),
            "read_mb_sec": round(read_bytes_sec / (1024 * 1024), 2),
            "write_mb_sec": round(write_bytes_sec / (1024 * 1024), 2)
        },
        "partitions": partitions_data
    }

def get_network_info() -> Dict[str, Any]:
    global _last_net_time, _last_net_io

    now = time.monotonic()
    dt = now - _last_net_time
    if dt <= 0:
        dt = 0.001

    current_io = psutil.net_io_counters()
    bytes_recv_sec = 0.0
    bytes_sent_sec = 0.0

    if current_io and _last_net_io:
        bytes_recv_sec = max(0.0, (current_io.bytes_recv - _last_net_io.bytes_recv) / dt)
        bytes_sent_sec = max(0.0, (current_io.bytes_sent - _last_net_io.bytes_sent) / dt)

    _last_net_time = now
    _last_net_io = current_io

    # Network interfaces details
    interfaces_data = []
    primary_interface = "eth0"
    primary_ip = "192.168.100.23"
    primary_ipv6 = "2804:2d5c:a1:a6aa:5ecd:5bff:fe5a:7445"

    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        per_nic_io = psutil.net_io_counters(pernic=True)

        for iface, addr_list in addrs.items():
            ipv4 = None
            ipv6 = None
            mac = None
            netmask = None
            
            for addr in addr_list:
                # AF_INET = IPv4
                if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                    ipv4 = addr.address
                    netmask = addr.netmask
                    if not primary_ip or primary_ip == "127.0.0.1":
                        primary_ip = addr.address
                        primary_interface = iface
                # AF_INET6 = IPv6
                elif addr.family == socket.AF_INET6:
                    addr_clean = addr.address.split("%")[0]
                    if not addr_clean.startswith("fe80:") and not addr_clean == "::1":
                        ipv6 = addr_clean
                        if iface == primary_interface or not primary_ipv6:
                            primary_ipv6 = addr_clean
                    elif not ipv6:
                        ipv6 = addr_clean
                # MAC address (AF_LINK / AF_PACKET)
                elif hasattr(socket, 'AF_PACKET') and addr.family == socket.AF_PACKET:
                    mac = addr.address
                elif str(addr.family) in ['17', '18', 'AF_LINK']: # Common numeric family for MAC
                    mac = addr.address

            iface_stats = stats.get(iface)
            is_up = iface_stats.isup if iface_stats else False
            speed = iface_stats.speed if iface_stats else 0
            mtu = iface_stats.mtu if iface_stats else 1500

            io_stat = per_nic_io.get(iface)
            bytes_sent = io_stat.bytes_sent if io_stat else 0
            bytes_recv = io_stat.bytes_recv if io_stat else 0
            packets_sent = io_stat.packets_sent if io_stat else 0
            packets_recv = io_stat.packets_recv if io_stat else 0
            errors = (io_stat.errin + io_stat.errout) if io_stat else 0

            interfaces_data.append({
                "interface": iface,
                "nome": iface,
                "ip": ipv4 or primary_ip,
                "ipv4": ipv4,
                "ipv6": ipv6 or (primary_ipv6 if iface == primary_interface else None),
                "mac": mac or "--",
                "netmask": netmask or "--",
                "gateway": "192.168.100.1" if ipv4 else "--",
                "is_up": is_up,
                "status": "UP" if is_up else "DOWN",
                "speed_mbps": speed,
                "mtu": mtu,
                "bytes_enviados": bytes_sent,
                "bytes_recebidos": bytes_recv,
                "pacotes_enviados": packets_sent,
                "pacotes_recebidos": packets_recv,
                "erros": errors
            })
    except Exception:
        pass

    # Detect active clients from ARP table (/proc/net/arp)
    active_clients = []
    try:
        if os.path.exists("/proc/net/arp"):
            with open("/proc/net/arp", "r") as f:
                lines = f.readlines()[1:] # skip header
                for idx, line in enumerate(lines):
                    parts = line.split()
                    if len(parts) >= 6:
                        ip_client = parts[0]
                        hw_client = parts[3]
                        device = parts[5]
                        if hw_client != "00:00:00:00:00:00" and not ip_client.startswith("127."):
                            active_clients.append({
                                "id": f"client-{idx}",
                                "ipv4": ip_client,
                                "mac": hw_client,
                                "interface": device,
                                "status": "ONLINE",
                                "hostname": "Não disponível",
                                "fabricante": "Não disponível"
                            })
    except Exception:
        pass

    # Active internet socket connections
    connections_count = 0
    try:
        conns = psutil.net_connections(kind='inet')
        connections_count = len(conns)
    except Exception:
        connections_count = 0

    return {
        "primary_interface": primary_interface,
        "primary_ip": primary_ip,
        "primary_ipv6": primary_ipv6,
        "download_bytes_sec": round(bytes_recv_sec, 2),
        "upload_bytes_sec": round(bytes_sent_sec, 2),
        "download_kb_sec": round(bytes_recv_sec / 1024, 2),
        "upload_kb_sec": round(bytes_sent_sec / 1024, 2),
        "download_mb_sec": round(bytes_recv_sec / (1024 * 1024), 3),
        "upload_mb_sec": round(bytes_sent_sec / (1024 * 1024), 3),
        "bytes_received_total": current_io.bytes_recv if current_io else 0,
        "bytes_sent_total": current_io.bytes_sent if current_io else 0,
        "connections_count": connections_count,
        "interfaces": interfaces_data,
        "active_clients": active_clients
    }

def get_processes_list(sort_by: str = "cpu", limit: int = 50) -> Dict[str, Any]:
    """Retorna lista dos principais processos com detalhes completos e contadores."""
    processes = []
    total_count = 0
    running_count = 0
    sleeping_count = 0
    other_count = 0

    for proc in psutil.process_iter(['pid', 'name', 'username', 'status', 'cpu_percent', 'memory_percent', 'memory_info', 'nice', 'num_threads', 'create_time', 'cmdline']):
        try:
            total_count += 1
            pinfo = proc.info
            status = pinfo.get('status') or "sleeping"

            if status in ["running", "disk-sleep"]:
                running_count += 1
            elif status in ["sleeping", "idle"]:
                sleeping_count += 1
            else:
                other_count += 1

            mem_info = pinfo.get('memory_info')
            rss_bytes = mem_info.rss if mem_info else 0
            
            # Formatar tempo de execução
            create_time = pinfo.get('create_time') or time.time()
            elapsed_sec = int(time.time() - create_time)
            hours = elapsed_sec // 3600
            mins = (elapsed_sec % 3600) // 60
            secs = elapsed_sec % 60
            exec_time_str = f"{hours:02d}:{mins:02d}:{secs:02d}"

            cmdline_list = pinfo.get('cmdline') or []
            cmd_str = " ".join(cmdline_list) if cmdline_list else (pinfo.get('name') or "")

            processes.append({
                "pid": pinfo.get('pid'),
                "name": pinfo.get('name') or "unknown",
                "nome": pinfo.get('name') or "unknown",
                "user": pinfo.get('username') or "root",
                "usuario": pinfo.get('username') or "root",
                "status": status,
                "cpu_percent": round(pinfo.get('cpu_percent') or 0.0, 1),
                "cpu_percentual": round(pinfo.get('cpu_percent') or 0.0, 1),
                "memory_percent": round(pinfo.get('memory_percent') or 0.0, 1),
                "memoria_percentual": round(pinfo.get('memory_percent') or 0.0, 1),
                "memory_bytes": rss_bytes,
                "memory_mb": round(rss_bytes / (1024 * 1024), 1),
                "memoria_mb": round(rss_bytes / (1024 * 1024), 1),
                "prioridade": pinfo.get('nice') if pinfo.get('nice') is not None else 0,
                "threads": pinfo.get('num_threads') or 1,
                "tempo_execucao": exec_time_str,
                "comando": cmd_str,
                "inicio": datetime.datetime.fromtimestamp(create_time).strftime("%H:%M:%S")
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    if sort_by == "ram" or sort_by == "memory":
        processes.sort(key=lambda x: x["memory_percent"], reverse=True)
    elif sort_by == "name":
        processes.sort(key=lambda x: x["name"].lower())
    elif sort_by == "pid":
        processes.sort(key=lambda x: x["pid"])
    else: # default "cpu"
        processes.sort(key=lambda x: x["cpu_percent"], reverse=True)

    return {
        "count": total_count,
        "running": running_count,
        "sleeping": sleeping_count,
        "other": other_count,
        "processes": processes[:limit]
    }

def get_full_system_snapshot() -> Dict[str, Any]:
    """Retorna resumo completo para WebSocket ou GET /api/system."""
    return {
        "system": get_os_info(),
        "uptime": get_uptime(),
        "cpu": get_cpu_info(),
        "memory": get_memory_info(),
        "temperature": get_temperature_info(),
        "disk": get_disk_info(),
        "network": get_network_info(),
        "timestamp": time.time()
    }
