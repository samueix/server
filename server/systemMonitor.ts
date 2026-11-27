import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let lastCpuTimes: { idle: number; total: number }[] = [];
let lastNetSample = { time: Date.now(), bytesRecv: 0, bytesSent: 0 };

function getCpuSnapshots() {
  const cpus = os.cpus();
  return cpus.map(cpu => {
    const times = cpu.times;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;
    return { idle: times.idle, total };
  });
}

// Inicializa amostra de CPU
try {
  lastCpuTimes = getCpuSnapshots();
} catch {}

export function getOsInfo() {
  let distro = os.type() === 'Linux' ? 'Linux' : os.type();
  let version = '';

  try {
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('PRETTY_NAME=')) {
          distro = line.replace('PRETTY_NAME=', '').replace(/"/g, '').trim();
        } else if (line.startsWith('VERSION_ID=')) {
          version = line.replace('VERSION_ID=', '').replace(/"/g, '').trim();
        }
      }
    }
  } catch {}

  if (!version) {
    version = os.release();
  }

  let firmware: string | null = null;
  try {
    firmware = fs.existsSync('/sys/firmware/efi') ? `UEFI (${os.arch()})` : `Legacy BIOS (${os.arch()})`;
  } catch {}

  const readDmi = (name: string): string | null => {
    try {
      const p = `/sys/class/dmi/id/${name}`;
      if (fs.existsSync(p)) {
        const val = fs.readFileSync(p, 'utf-8').trim();
        if (val && !/^to be filled|default string|not specified|none$/i.test(val)) return val;
      }
    } catch {}
    return null;
  };

  let ntpActive: boolean | null = null;
  try {
    const timedate = execSync('timedatectl show -p NTPSynchronized --value 2>/dev/null || true', { encoding: 'utf-8', timeout: 600 }).trim().toLowerCase();
    if (timedate === 'yes') ntpActive = true;
    else if (timedate === 'no') ntpActive = false;
  } catch {}

  return {
    hostname: os.hostname() || 'localhost',
    os: distro,
    os_version: version,
    kernel: os.release(),
    arch: os.arch(),
    node_version: process.version,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    firmware,
    hardware_vendor: readDmi('sys_vendor') || readDmi('board_vendor'),
    hardware_model: readDmi('board_name') || readDmi('product_name'),
    ntp_synced: ntpActive
  };
}

export function getUptime() {
  const uptimeSeconds = Math.floor(os.uptime());
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return {
    boot_time: Date.now() - (uptimeSeconds * 1000),
    uptime_seconds: uptimeSeconds,
    uptime_human: parts.join(' '),
    dias: days,
    horas: hours,
    minutos: minutes,
    segundos: seconds,
    current_time: new Date().toISOString()
  };
}

export function getCpuInfo() {
  const cpus = os.cpus();
  const currentSnapshots = getCpuSnapshots();
  const perCorePercent: number[] = [];
  let totalDeltaIdle = 0;
  let totalDelta = 0;

  for (let i = 0; i < currentSnapshots.length; i++) {
    const cur = currentSnapshots[i];
    const prev = lastCpuTimes[i] || cur;
    const deltaTotal = Math.max(1, cur.total - prev.total);
    const deltaIdle = Math.max(0, cur.idle - prev.idle);
    const percent = Math.min(100, Math.max(0, ((deltaTotal - deltaIdle) / deltaTotal) * 100));

    perCorePercent.push(Math.round(percent * 10) / 10);
    totalDeltaIdle += deltaIdle;
    totalDelta += deltaTotal;
  }

  lastCpuTimes = currentSnapshots;

  const usagePercent = totalDelta > 0
    ? Math.round(Math.min(100, Math.max(0, ((totalDelta - totalDeltaIdle) / totalDelta) * 100)) * 10) / 10
    : 0;

  const loadAvg = os.loadavg();
  const readFreqKhz = (file: string): number | null => {
    try {
      const p = `/sys/devices/system/cpu/cpu0/cpufreq/${file}`;
      if (fs.existsSync(p)) {
        const khz = parseInt(fs.readFileSync(p, 'utf-8').trim(), 10);
        if (Number.isFinite(khz) && khz > 0) return Math.round(khz / 1000);
      }
    } catch {}
    return null;
  };
  const freqMhz = readFreqKhz('scaling_cur_freq') ?? (cpus[0]?.speed || 0);
  const minFreqMhz = readFreqKhz('cpuinfo_min_freq') ?? freqMhz;
  const maxFreqMhz = readFreqKhz('cpuinfo_max_freq') ?? freqMhz;

  return {
    usage_percent: usagePercent,
    uso_percentual: usagePercent,
    cores_logical: cpus.length,
    nucleos_logicos: cpus.length,
    cores_physical: Math.max(1, Math.floor(cpus.length / 2)),
    nucleos_fisicos: Math.max(1, Math.floor(cpus.length / 2)),
    per_core_percent: perCorePercent,
    nucleos_uso: perCorePercent,
    frequency_mhz: {
      current: freqMhz,
      min: minFreqMhz,
      max: maxFreqMhz
    },
    frequencia_mhz: freqMhz,
    load_average: {
      "1m": Math.round(loadAvg[0] * 100) / 100,
      "5m": Math.round(loadAvg[1] * 100) / 100,
      "15m": Math.round(loadAvg[2] * 100) / 100
    }
  };
}

export function getMemoryInfo() {
  let totalBytes = os.totalmem();
  let freeBytes = os.freemem();
  let availableBytes = freeBytes;
  let buffersBytes = 0;
  let cachedBytes = 0;
  let sreclaimableBytes = 0;
  let swapTotalBytes = 0;
  let swapFreeBytes = 0;

  try {
    if (fs.existsSync('/proc/meminfo')) {
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');
      const getKb = (key: string) => {
        const m = meminfo.match(new RegExp(`${key}:\\s+(\\d+)\\s+kB`));
        return m ? parseInt(m[1], 10) * 1024 : 0;
      };

      const mTotal = getKb('MemTotal');
      if (mTotal > 0) totalBytes = mTotal;
      const mFree = getKb('MemFree');
      if (mFree > 0) freeBytes = mFree;
      const mAvail = getKb('MemAvailable');
      if (mAvail > 0) availableBytes = mAvail;
      buffersBytes = getKb('Buffers');
      cachedBytes = getKb('Cached');
      sreclaimableBytes = getKb('SReclaimable');
      swapTotalBytes = getKb('SwapTotal');
      swapFreeBytes = getKb('SwapFree');
    }
  } catch {}

  const buffersCacheBytes = buffersBytes + cachedBytes + sreclaimableBytes;
  const usedBytes = Math.max(0, totalBytes - availableBytes);

  const totalGb = Math.round((totalBytes / (1024 ** 3)) * 100) / 100;
  const usedGb = Math.round((usedBytes / (1024 ** 3)) * 100) / 100;
  const availableGb = Math.round((availableBytes / (1024 ** 3)) * 100) / 100;
  const freeGb = Math.round((freeBytes / (1024 ** 3)) * 100) / 100;
  const buffersCacheGb = buffersCacheBytes > 0
    ? Math.round((buffersCacheBytes / (1024 ** 3)) * 100) / 100
    : Math.max(0, Math.round((availableGb - freeGb) * 100) / 100);
  const usagePercent = Math.round((usedBytes / totalBytes) * 1000) / 10;

  const swapTotalGb = Math.round((swapTotalBytes / (1024 ** 3)) * 100) / 100;
  const swapFreeGb = Math.round((swapFreeBytes / (1024 ** 3)) * 100) / 100;
  const swapUsedGb = Math.max(0, Math.round((swapTotalGb - swapFreeGb) * 100) / 100);
  const swapPercent = swapTotalGb > 0 ? Math.round((swapUsedGb / swapTotalGb) * 1000) / 10 : 0;

  return {
    ram: {
      total_bytes: totalBytes,
      used_bytes: usedBytes,
      free_bytes: freeBytes,
      available_bytes: availableBytes,
      buffers_cache_bytes: buffersCacheBytes,
      total_gb: totalGb,
      used_gb: usedGb,
      free_gb: freeGb,
      available_gb: availableGb,
      buffers_cache_gb: buffersCacheGb,
      usage_percent: usagePercent,
      uso_percentual: usagePercent
    },
    swap: {
      total_gb: swapTotalGb,
      used_gb: swapUsedGb,
      free_gb: swapFreeGb,
      usage_percent: swapPercent
    },
    total_gb: totalGb,
    usada_gb: usedGb,
    livre_gb: freeGb,
    disponivel_gb: availableGb,
    buffers_cache_gb: buffersCacheGb,
    swap_total_gb: swapTotalGb,
    swap_usada_gb: swapUsedGb,
    uso_percentual: usagePercent
  };
}

export function getTemperatureInfo() {
  const sensores: any[] = [];
  const cores: any[] = [];
  const added = new Set<string>();

  const toTemp = (raw: string | number) => {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n)) return null;
    // sysfs costuma expor millicelsius
    const c = n > 200 ? n / 1000 : n;
    if (c <= 0 || c >= 130) return null;
    return Math.round(c * 10) / 10;
  };

  const pushSensor = (obj: any) => {
    if (!obj || typeof obj.temperatura_c !== 'number') return;
    const key = `${obj.sensor || ''}|${obj.nome || ''}|${obj.temperatura_c}`;
    if (added.has(key)) return;
    added.add(key);
    sensores.push(obj);
    if (obj.isCore) cores.push(obj);
  };

  // 1) Sensores detalhados via hwmon (ex.: coretemp com Package/Core)
  try {
    if (fs.existsSync('/sys/class/hwmon')) {
      const hwmons = fs.readdirSync('/sys/class/hwmon');
      for (const hw of hwmons) {
        const base = path.join('/sys/class/hwmon', hw);
        let chip = hw;
        try {
          const nameFile = path.join(base, 'name');
          if (fs.existsSync(nameFile)) chip = fs.readFileSync(nameFile, 'utf-8').trim() || hw;
        } catch {}

        const files = fs.readdirSync(base);
        const inputs = files.filter(f => /^temp\d+_input$/.test(f));
        for (const input of inputs) {
          const id = input.replace('_input', '');
          let label = '';
          try {
            const lf = path.join(base, `${id}_label`);
            if (fs.existsSync(lf)) label = fs.readFileSync(lf, 'utf-8').trim();
          } catch {}
          let tempC: number | null = null;
          try {
            tempC = toTemp(fs.readFileSync(path.join(base, input), 'utf-8'));
          } catch {}
          if (tempC === null) continue;

          let maxC: number | undefined;
          let critC: number | undefined;
          try {
            const mf = path.join(base, `${id}_max`);
            if (fs.existsSync(mf)) { const v = toTemp(fs.readFileSync(mf, 'utf-8')); if (v !== null) maxC = v; }
          } catch {}
          try {
            const cf = path.join(base, `${id}_crit`);
            if (fs.existsSync(cf)) { const v = toTemp(fs.readFileSync(cf, 'utf-8')); if (v !== null) critC = v; }
          } catch {}

          const nome = label || `${chip} ${id}`;
          const lower = nome.toLowerCase();
          const isCore = lower.includes('core');
          const coreMatch = lower.match(/core\s*(\d+)/);
          const coreIndex = coreMatch ? parseInt(coreMatch[1], 10) : undefined;

          pushSensor({
            sensor: chip,
            nome,
            temperatura_c: tempC,
            maxima_c: maxC,
            critica_c: critC,
            isCore,
            ...(coreIndex !== undefined ? { coreIndex } : {})
          });
        }
      }
    }
  } catch {}

  // 2) thermal_zone como complemento (caso hwmon indisponível/incompleto)
  try {
    if (fs.existsSync('/sys/class/thermal')) {
      const entries = fs.readdirSync('/sys/class/thermal');
      for (const entry of entries) {
        if (!entry.startsWith('thermal_zone')) continue;
        const base = path.join('/sys/class/thermal', entry);
        let name = entry;
        try { name = fs.readFileSync(path.join(base, 'type'), 'utf-8').trim() || entry; } catch {}
        let tempC: number | null = null;
        try { tempC = toTemp(fs.readFileSync(path.join(base, 'temp'), 'utf-8')); } catch {}
        if (tempC === null) continue;
        // evita duplicar se hwmon já trouxe x86_pkg_temp equivalente
        if (sensores.some(s => s.nome === name && Math.abs(s.temperatura_c - tempC) < 0.2)) continue;
        pushSensor({
          sensor: 'thermal_zone',
          nome: name,
          temperatura_c: tempC,
          isCore: false
        });
      }
    }
  } catch {}

  const available = sensores.length > 0;
  const pickMain = () => {
    if (!available) return null;
    const byName = (re: RegExp) => sensores.find(s => re.test((s.nome || '').toLowerCase()));
    return (
      byName(/package id/) ||
      byName(/x86_pkg_temp/) ||
      byName(/tctl/) ||
      byName(/cpu/) ||
      cores[0] ||
      sensores[0]
    );
  };
  const main = pickMain();
  const cpuTemp = main ? main.temperatura_c : null;

  return {
    available,
    disponivel: available,
    temperatura_c: cpuTemp,
    cpu_temp: cpuTemp,
    sensores,
    cores
  };
}

export function getDiskInfo() {
  let totalGb = 0;
  let freeGb = 0;
  let usedGb = 0;
  let usagePercent = 0;
  let rootDevice: string | null = null;
  let rootFsType: string | null = null;
  const partitions: Array<{
    device: string;
    mount_point: string;
    fs_type: string;
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent: number;
  }> = [];

  try {
    const dfOut = execSync(
      'df -B1 -P -T -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs 2>/dev/null || true',
      { encoding: 'utf-8', timeout: 1200 }
    );
    const lines = dfOut.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) continue;
      const [device, fsType, totalStr, usedStr, availStr, _pctStr, ...mountParts] = parts;
      const mountPoint = mountParts.join(' ');
      if (!device || device.startsWith('/dev/loop')) continue;
      const totalBytes = Number(totalStr) || 0;
      const usedBytes = Number(usedStr) || 0;
      const freeBytes = Number(availStr) || 0;
      if (totalBytes <= 0) continue;
      const tGb = Math.round((totalBytes / (1024 ** 3)) * 10) / 10;
      const uGb = Math.round((usedBytes / (1024 ** 3)) * 10) / 10;
      const fGb = Math.round((freeBytes / (1024 ** 3)) * 10) / 10;
      const pct = Math.round((usedBytes / totalBytes) * 1000) / 10;
      partitions.push({
        device,
        mount_point: mountPoint,
        fs_type: fsType,
        total_gb: tGb,
        used_gb: uGb,
        free_gb: fGb,
        percent: pct
      });
      if (mountPoint === '/') {
        rootDevice = device;
        rootFsType = fsType;
        totalGb = tGb;
        usedGb = uGb;
        freeGb = fGb;
        usagePercent = pct;
      }
    }
  } catch {}

  try {
    if (totalGb === 0 && typeof (fs as any).statfsSync === 'function') {
      const stats = (fs as any).statfsSync('/');
      const bsize = stats.bsize;
      const total = stats.blocks * bsize;
      const free = stats.bavail * bsize;
      const used = Math.max(0, total - free);

      if (total > 0) {
        totalGb = Math.round((total / (1024 ** 3)) * 10) / 10;
        freeGb = Math.round((free / (1024 ** 3)) * 10) / 10;
        usedGb = Math.round((used / (1024 ** 3)) * 10) / 10;
        usagePercent = Math.round((used / total) * 1000) / 10;
      }
    }
  } catch {}

  if (partitions.length === 0 && totalGb > 0) {
    partitions.push({
      device: rootDevice || '/',
      mount_point: '/',
      fs_type: rootFsType || '—',
      total_gb: totalGb,
      used_gb: usedGb,
      free_gb: freeGb,
      percent: usagePercent
    });
  }

  return {
    root: {
      device: rootDevice || partitions[0]?.device || null,
      fs_type: rootFsType || partitions[0]?.fs_type || null,
      total_gb: totalGb,
      used_gb: usedGb,
      free_gb: freeGb,
      percent: usagePercent,
      uso_percentual: usagePercent,
      mount_point: '/'
    },
    partitions,
    particoes: partitions,
    total_gb: totalGb,
    usado_gb: usedGb,
    livre_gb: freeGb,
    uso_percentual: usagePercent
  };
}

function getActiveNetworkClients() {
  const clients = new Map<string, any>();
  const parseIpNeigh = (output: string) => {
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const ip = parts[0];
      const devIdx = parts.indexOf('dev');
      const iface = devIdx >= 0 ? parts[devIdx + 1] : undefined;
      const macIdx = parts.indexOf('lladdr');
      const mac = macIdx >= 0 ? (parts[macIdx + 1] || '').toUpperCase() : '';
      const state = parts[parts.length - 1] || '';
      if (!ip || !mac || mac === '00:00:00:00:00:00') continue;
      if (ip.startsWith('fe80:') || ip.startsWith('169.254.')) continue;
      if (state === 'FAILED') continue;
      const isIpv6 = ip.includes(':');
      const key = `${iface || 'net'}:${mac}`;
      const existing = clients.get(key) || {
        id: `neigh-${iface || 'net'}-${mac.replace(/:/g, '')}`,
        nome: undefined,
        hostname: undefined,
        ipv4: undefined,
        ipv6: undefined,
        mac,
        fabricante: undefined,
        status: ['REACHABLE', 'DELAY', 'PROBE'].includes(state) ? 'ONLINE' : 'OFFLINE',
        ultimaAtividade: state,
        interface: iface,
        consultas: 0
      };
      if (isIpv6) {
        if (!existing.ipv6) existing.ipv6 = ip;
      } else {
        if (!existing.ipv4) existing.ipv4 = ip;
      }
      if (['REACHABLE', 'DELAY', 'PROBE'].includes(state)) existing.status = 'ONLINE';
      existing.ultimaAtividade = state || existing.ultimaAtividade;
      clients.set(key, existing);
    }
  };

  try {
    const out = execSync('ip neigh show 2>/dev/null || true', { encoding: 'utf-8', timeout: 1200 });
    parseIpNeigh(out);
  } catch {}

  // Fallback: /proc/net/arp (IPv4)
  if (clients.size === 0) {
    try {
      const arp = fs.readFileSync('/proc/net/arp', 'utf-8');
      const lines = arp.trim().split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        const [ip, , flags, macRaw, , iface] = parts;
        const mac = (macRaw || '').toUpperCase();
        if (!mac || mac === '00:00:00:00:00:00') continue;
        if (flags === '0x0') continue;
        const key = `${iface}:${mac}`;
        clients.set(key, {
          id: `arp-${iface}-${mac.replace(/:/g, '')}`,
          nome: undefined,
          hostname: undefined,
          ipv4: ip,
          ipv6: undefined,
          mac,
          fabricante: undefined,
          status: flags !== '0x0' ? 'ONLINE' : 'OFFLINE',
          ultimaAtividade: 'ARP',
          interface: iface,
          consultas: 0
        });
      }
    } catch {}
  }

  // Anota gateway se detectável
  let gatewayIp: string | null = null;
  try {
    const route = execSync("ip route show default 2>/dev/null | awk '/default/ {print $3; exit}'", { encoding: 'utf-8', timeout: 800 }).trim();
    if (route) gatewayIp = route;
  } catch {}

  for (const c of clients.values()) {
    if (gatewayIp && c.ipv4 === gatewayIp) {
      c.nome = c.nome || 'Gateway/Roteador';
      c.hostname = c.hostname || 'gateway';
      c.tipo = 'roteador';
      c.status = 'ONLINE';
    }
  }

  return Array.from(clients.values()).sort((a, b) => (a.ipv4 || a.ipv6 || '').localeCompare(b.ipv4 || b.ipv6 || '', undefined, { numeric: true }));
}


function readInterfaceCounters() {
  const counters: Record<string, { rxBytes: number; rxPackets: number; rxErrors: number; txBytes: number; txPackets: number; txErrors: number }> = {};
  try {
    const text = fs.readFileSync('/proc/net/dev', 'utf-8');
    const lines = text.split('\n').slice(2);
    for (const line of lines) {
      if (!line || !line.includes(':')) continue;
      const [namePart, restPart] = line.split(':');
      const name = namePart.trim();
      if (!name) continue;
      const cols = restPart.trim().split(/\s+/).map(n => Number(n) || 0);
      // rx: bytes packets errs drop fifo frame compressed multicast
      // tx: bytes packets errs drop fifo colls carrier compressed
      counters[name] = {
        rxBytes: cols[0] || 0,
        rxPackets: cols[1] || 0,
        rxErrors: cols[2] || 0,
        txBytes: cols[8] || 0,
        txPackets: cols[9] || 0,
        txErrors: cols[10] || 0,
      };
    }
  } catch {}
  return counters;
}

function readInterfaceMtu(name: string) {
  try {
    return Number(fs.readFileSync(`/sys/class/net/${name}/mtu`, 'utf-8').trim()) || 1500;
  } catch { return 1500; }
}

function readInterfaceSpeedMbps(name: string) {
  try {
    const v = fs.readFileSync(`/sys/class/net/${name}/speed`, 'utf-8').trim();
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return undefined;
}

export function getNetworkInfo() {
  const nics = os.networkInterfaces();
  const counters = readInterfaceCounters();
  const interfaces: any[] = [];
  let primaryIp = '127.0.0.1';
  let primaryIpv6: string | undefined = undefined;
  let primaryInterface = '';
  let defaultGateway = '--';

  try {
    const gw = execSync("ip route show default 2>/dev/null | awk '/default/ {print $3; exit}'", { encoding: 'utf-8', timeout: 800 }).trim();
    if (gw) defaultGateway = gw;
  } catch {}
  try {
    const defIf = execSync("ip route show default 2>/dev/null | awk '/default/ {print $5; exit}'", { encoding: 'utf-8', timeout: 800 }).trim();
    if (defIf) primaryInterface = defIf;
  } catch {}

  for (const [name, addrList] of Object.entries(nics)) {
    if (!addrList) continue;
    let ipv4: string | undefined;
    let ipv6: string | undefined;
    let mac = '--';
    let netmask = '--';

    for (const addr of addrList) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ipv4 = addr.address;
        netmask = addr.netmask;
        mac = addr.mac && addr.mac !== '00:00:00:00:00:00' ? addr.mac : mac;
        if (primaryInterface ? name === primaryInterface : primaryIp === '127.0.0.1') {
          primaryIp = addr.address;
          if (!primaryInterface) primaryInterface = name;
        }
      } else if (addr.family === 'IPv6' && !addr.internal && !addr.address.startsWith('fe80:')) {
        ipv6 = addr.address;
        if (!primaryIpv6) {
          primaryIpv6 = addr.address;
        }
      }
    }

    const c = counters[name] || { rxBytes: 0, rxPackets: 0, rxErrors: 0, txBytes: 0, txPackets: 0, txErrors: 0 };
    let isUp = true;
    try {
      const oper = fs.readFileSync(`/sys/class/net/${name}/operstate`, 'utf-8').trim().toLowerCase();
      if (oper && oper !== 'unknown') isUp = oper === 'up';
    } catch {}
    const isWireless = /^wl/i.test(name) || fs.existsSync(`/sys/class/net/${name}/wireless`) || fs.existsSync(`/sys/class/net/${name}/phy80211`);
    const speedMbps = (name === 'lo' || isWireless) ? 0 : (readInterfaceSpeedMbps(name) ?? 0);

    interfaces.push({
      interface: name,
      nome: name,
      ip: ipv4 || (isUp ? primaryIp : '--'),
      ipv4: ipv4 || null,
      ipv6: ipv6 || null,
      mac,
      netmask,
      gateway: (name === 'lo' || !ipv4) ? '--' : defaultGateway,
      is_up: isUp,
      status: isUp ? 'UP' : 'DOWN',
      speed_mbps: speedMbps,
      mtu: readInterfaceMtu(name),
      bytes_enviados: c.txBytes,
      bytes_recebidos: c.rxBytes,
      pacotes_enviados: c.txPackets,
      pacotes_recebidos: c.rxPackets,
      erros: c.rxErrors + c.txErrors
    });
  }

  if (!primaryInterface) {
    const upWithIp = interfaces.find(i => i.status === 'UP' && i.ipv4 && i.nome !== 'lo');
    primaryInterface = upWithIp?.nome || interfaces.find(i => i.nome !== 'lo')?.nome || interfaces[0]?.nome || '';
  }

  // velocidade em bytes/s calculada por delta real de /proc/net/dev
  let download_bytes_sec = 0;
  let upload_bytes_sec = 0;
  let totalRxBytes = 0;
  let totalTxBytes = 0;
  try {
    const now = Date.now();
    const nicNames = new Set(Object.keys(nics || {}));
    for (const [name, c] of Object.entries(counters)) {
      if (name === 'lo') continue;
      if (nicNames.size > 0 && !nicNames.has(name)) continue;
      totalRxBytes += c.rxBytes;
      totalTxBytes += c.txBytes;
    }
    if (lastNetSample.time > 0) {
      const dt = Math.max(0.2, (now - lastNetSample.time) / 1000);
      if (totalRxBytes >= lastNetSample.bytesRecv && totalTxBytes >= lastNetSample.bytesSent) {
        download_bytes_sec = Math.max(0, (totalRxBytes - lastNetSample.bytesRecv) / dt);
        upload_bytes_sec = Math.max(0, (totalTxBytes - lastNetSample.bytesSent) / dt);
      }
    }
    lastNetSample = { time: now, bytesRecv: totalRxBytes, bytesSent: totalTxBytes };
  } catch {}

  const activeClients = getActiveNetworkClients();

  return {
    interfaces,
    primary_interface: primaryInterface || null,
    primary_ip: primaryIp,
    primary_ipv6: primaryIpv6,
    download_bytes_sec: Math.round(download_bytes_sec),
    upload_bytes_sec: Math.round(upload_bytes_sec),
    total: {
      rx_bytes: totalRxBytes,
      tx_bytes: totalTxBytes
    },
    active_clients: activeClients,
    activeClients
  };
}

export function getProcessesList(sortBy = 'cpu', limit = 30) {
  const processes: any[] = [];
  let running = 0;
  let sleeping = 0;
  let other = 0;

  try {
    // Tenta ler processos reais com 'ps' (inclui RSS em KiB, args/comando completo e lstart/etime)
    const output = execSync('ps -eo pid,user,%cpu,%mem,rss,stat,etime,comm,args --sort=-%cpu', { encoding: 'utf-8', timeout: 2500, maxBuffer: 8 * 1024 * 1024 });
    const lines = output.trim().split('\n').slice(1);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8) {
        const pid = parseInt(parts[0], 10);
        const user = parts[1] || '';
        const cpuPercent = parseFloat(parts[2]) || 0;
        const memPercent = parseFloat(parts[3]) || 0;
        const rssKb = parseInt(parts[4], 10) || 0;
        const statusRaw = parts[5] || '';
        const timeStr = parts[6] || '';
        const comm = parts[7] || '';
        const argsStr = parts.slice(8).join(' ') || comm;

        let status = 'sleeping';
        if (statusRaw.startsWith('R')) { status = 'running'; running++; }
        else if (statusRaw.startsWith('S') || statusRaw.startsWith('I')) { status = 'sleeping'; sleeping++; }
        else if (statusRaw.startsWith('D')) { status = 'disk-sleep'; other++; }
        else if (statusRaw.startsWith('Z')) { status = 'zombie'; other++; }
        else if (statusRaw.startsWith('T') || statusRaw.startsWith('t')) { status = 'stopped'; other++; }
        else { status = statusRaw.toLowerCase() || 'sleeping'; other++; }

        const memMb = Math.round((rssKb / 1024) * 10) / 10;

        processes.push({
          pid,
          name: comm,
          nome: comm,
          user,
          usuario: user,
          status,
          cpu_percent: cpuPercent,
          cpu_percentual: cpuPercent,
          memory_percent: memPercent,
          memoria_percentual: memPercent,
          memory_mb: memMb,
          memoria_mb: memMb,
          prioridade: 0,
          threads: 1,
          tempo_execucao: timeStr,
          comando: argsStr,
          inicio: timeStr || '--'
        });
      }
    }
  } catch {}

  if (sortBy === 'ram' || sortBy === 'memory') {
    processes.sort((a, b) => b.memory_percent - a.memory_percent);
  } else if (sortBy === 'name') {
    processes.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'pid') {
    processes.sort((a, b) => a.pid - b.pid);
  } else {
    processes.sort((a, b) => b.cpu_percent - a.cpu_percent);
  }

  const sliced = limit > 0 ? processes.slice(0, limit) : processes;
  return {
    count: processes.length,
    running,
    sleeping,
    other,
    sort_by: sortBy,
    processes: sliced
  };
}

export function getFullSystemSnapshot() {
  const osInfo = getOsInfo();
  const procInfo = getProcessesList('cpu', 30);
  const memInfo = getMemoryInfo();
  const tempInfo = getTemperatureInfo();
  const diskInfo = getDiskInfo();
  const netInfo = getNetworkInfo();
  return {
    servidor: osInfo.hostname,
    sistema: osInfo,
    system: osInfo,
    uptime: getUptime(),
    cpu: getCpuInfo(),
    memory: memInfo,
    memoria: memInfo,
    temperature: tempInfo,
    temperatura: tempInfo,
    disk: diskInfo,
    disco: diskInfo,
    network: netInfo,
    rede: netInfo,
    processes: procInfo.processes,
    processos: procInfo.processes,
    processes_summary: {
      count: procInfo.count,
      running: procInfo.running,
      sleeping: procInfo.sleeping,
      other: procInfo.other
    },
    timestamp: Date.now() / 1000
  };
}
