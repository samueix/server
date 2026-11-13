import { execSync } from 'child_process';
import fs from 'fs';

function safeExec(cmd: string, timeout = 2500): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function freqToChannel(freq: number): number | null {
  if (!Number.isFinite(freq)) return null;
  if (freq === 2484) return 14;
  if (freq >= 2412 && freq <= 2472) return Math.round((freq - 2407) / 5);
  if (freq >= 5000 && freq <= 5900) return Math.round((freq - 5000) / 5);
  if (freq >= 5950 && freq <= 7115) return Math.round((freq - 5950) / 5);
  return null;
}

function bandFromFreq(freq: number): string {
  if (freq >= 2400 && freq < 2500) return '2.4 GHz';
  if (freq >= 5000 && freq < 5900) return '5 GHz';
  if (freq >= 5925) return '6 GHz';
  return 'desconhecida';
}

function signalQuality(percent: number): string {
  if (percent >= 75) return 'EXCELENTE';
  if (percent >= 50) return 'BOA';
  if (percent >= 30) return 'REGULAR';
  if (percent > 0) return 'FRACA';
  return 'SEM SINAL';
}

function parseWpaStatus(out: string): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return obj;
}

export function getWifiInfo() {
  const iface = 'wlo1';
  const eth = 'enp1s0';
  let linkQuality: number | null = null;
  let signalDbm: number | null = null;
  let noiseDbm: number | null = null;
  try {
    const w = fs.readFileSync('/proc/net/wireless', 'utf-8');
    const line = w.split('\n').find(l => l.includes(iface + ':'));
    if (line) {
      // format: iface: status link level noise ...
      const after = line.split(':').slice(1).join(':').trim();
      const parts = after.split(/\s+/).map(p => p.replace(/\.$/, ''));
      const link = Number(parts[1]);
      const level = Number(parts[2]);
      const noise = Number(parts[3]);
      if (Number.isFinite(link)) linkQuality = link;
      if (Number.isFinite(level)) signalDbm = level;
      if (Number.isFinite(noise)) noiseDbm = noise;
    }
  } catch {}

  const statusOut = safeExec(`wpa_cli -i ${iface} status 2>/dev/null`);
  const st = parseWpaStatus(statusOut);
  const freq = Number(st.freq || 0) || null;
  const channel = freq ? freqToChannel(freq) : null;
  const connected = (st.wpa_state || '').toUpperCase() === 'COMPLETED';
  const ssid = st.ssid || null;
  const bssid = st.bssid || null;

  // neighbors from scan_results (may be cached)
  const scanOut = safeExec(`wpa_cli -i ${iface} scan_results 2>/dev/null`, 3500);
  const neighbors: any[] = [];
  const lines = scanOut.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    const [nbssid, nfreqStr, nsignalStr, flags, ...ssidParts] = parts;
    const nssid = ssidParts.join('\t') || '(oculta)';
    const nf = Number(nfreqStr) || 0;
    const nsig = Number(nsignalStr);
    const nch = nf ? freqToChannel(nf) : null;
    const security = flags?.includes('WPA3') ? 'WPA3' : flags?.includes('WPA2') ? 'WPA2' : flags?.includes('WPA') ? 'WPA' : flags?.includes('WEP') ? 'WEP' : (flags?.includes('ESS') && !flags?.includes('WPA') ? 'Aberta/sem WPA' : (flags || 'desconhecido'));
    neighbors.push({
      bssid: nbssid,
      ssid: nssid,
      frequency_mhz: nf || null,
      channel: nch,
      band: nf ? bandFromFreq(nf) : 'desconhecida',
      signal_dbm: Number.isFinite(nsig) ? nsig : null,
      signal_percent: Number.isFinite(nsig) ? Math.max(0, Math.min(100, 2 * (nsig + 100))) : null,
      security,
      flags: flags || '',
      connected: Boolean(bssid && nbssid && bssid.toLowerCase() === nbssid.toLowerCase())
    });
  }
  // sort by signal desc
  neighbors.sort((a, b) => (b.signal_dbm ?? -999) - (a.signal_dbm ?? -999));

  // if current network missing in scan but connected, ensure signal from proc
  if (connected && bssid && !neighbors.some(n => n.connected)) {
    // keep as is
  }

  let ethOper = 'unknown';
  let ethCarrier = '0';
  try { ethOper = fs.readFileSync(`/sys/class/net/${eth}/operstate`, 'utf-8').trim(); } catch {}
  try { ethCarrier = fs.readFileSync(`/sys/class/net/${eth}/carrier`, 'utf-8').trim(); } catch {}
  const ethernet = {
    interface: eth,
    operstate: ethOper,
    carrier: ethCarrier === '1',
    connected: ethOper === 'up' && ethCarrier === '1',
    dhcp_configured: true // netplan adjusted to dhcp4 optional
  };

  // reconnection info
  const netplanPath = '/etc/netplan/00-installer-config.yaml';
  let netplanConfigured = false;
  try { netplanConfigured = fs.readFileSync(netplanPath, 'utf-8').includes('wlo1'); } catch {}

  const qualityPercent = linkQuality != null ? Math.max(0, Math.min(100, Math.round(linkQuality))) : (signalDbm != null ? Math.max(0, Math.min(100, 2 * (signalDbm + 100))) : null);

  return {
    success: true,
    interface: iface,
    connected,
    state: st.wpa_state || (connected ? 'COMPLETED' : 'DESCONHECIDO'),
    ssid,
    bssid,
    ip_address: st.ip_address || null,
    frequency_mhz: freq,
    channel,
    band: freq ? bandFromFreq(freq) : null,
    wifi_generation: st.wifi_generation || null,
    key_mgmt: st.key_mgmt || null,
    pairwise_cipher: st.pairwise_cipher || null,
    signal_dbm: signalDbm ?? (neighbors.find(n => n.connected)?.signal_dbm ?? null),
    noise_dbm: noiseDbm,
    link_quality: linkQuality,
    signal_percent: qualityPercent,
    signal_quality: qualityPercent != null ? signalQuality(qualityPercent) : null,
    neighbors,
    neighbor_count: neighbors.length,
    ethernet,
    reconnection: {
      auto_reconnect_expected: true,
      manager: 'wpa_supplicant + systemd-networkd (netplan)',
      netplan_persistent: netplanConfigured,
      ethernet_fallback_ready: ethernet.dhcp_configured,
      note: 'Com Wi-Fi configurado no netplan, o wpa_supplicant tenta reconectar automaticamente. O cabo Ethernet (enp1s0) está configurado com DHCP opcional no netplan: ao plugar, a rede cabeada deve subir e permitir acesso ao painel para ajustar/reconectar o Wi-Fi.'
    },
    timestamp: new Date().toISOString()
  };
}

export function triggerWifiScan(iface = 'wlo1'): { ok: boolean; output: string } {
  const out = safeExec(`wpa_cli -i ${iface} scan 2>/dev/null`, 3000);
  return { ok: out.toLowerCase().includes('ok'), output: out || 'sem resposta' };
}

function yamlSafeSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function connectWifi(ssid: string, password: string, iface = 'wlo1', eth = 'enp1s0'): { success: boolean; message: string } {
  const cleanSsid = String(ssid || '').trim();
  const cleanPass = String(password || '');
  if (!cleanSsid) return { success: false, message: 'SSID é obrigatório.' };
  if (cleanPass.length < 8 && cleanPass.length > 0) return { success: false, message: 'Senha Wi-Fi deve ter ao menos 8 caracteres (ou vazia para rede aberta, se suportado).' };

  const netplanPath = '/etc/netplan/00-installer-config.yaml';
  let mac = 'd0:94:66:c0:aa:6d';
  try {
    const current = fs.readFileSync(netplanPath, 'utf-8');
    const m = current.match(/macaddress:\s*([0-9a-fA-F:]+)/);
    if (m) mac = m[1];
  } catch {}

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  try { fs.copyFileSync(netplanPath, `${netplanPath}.bak.${ts}`); } catch {}

  const apBlock = cleanPass.length === 0
    ? `      access-points:\n        ${yamlSafeSingleQuoted(cleanSsid)}: {}\n`
    : `      access-points:\n        ${yamlSafeSingleQuoted(cleanSsid)}:\n          password: ${yamlSafeSingleQuoted(cleanPass)}\n`;

  const yaml = `# This is the network config written by 'subiquity'\nnetwork:\n  ethernets:\n    ${eth}:\n      match:\n        macaddress: ${mac}\n      set-name: ${eth}\n      dhcp4: true\n      optional: true\n  version: 2\n  wifis:\n    ${iface}:\n${apBlock}      dhcp4: true\n`;

  try {
    fs.writeFileSync(netplanPath, yaml, { encoding: 'utf-8', mode: 0o600 });
  } catch (e: any) {
    return { success: false, message: `Falha ao gravar netplan: ${e?.message || e}` };
  }

  const gen = safeExec('netplan generate 2>&1', 8000);
  if (gen && /error/i.test(gen)) {
    return { success: false, message: `netplan generate falhou: ${gen.slice(0, 300)}` };
  }
  // apply asynchronously to reduce risk of dropping current HTTP response when on wifi
  try {
    execSync('nohup sh -c "sleep 1; netplan apply" >/tmp/netplan-apply.log 2>&1 &', { stdio: 'ignore', timeout: 2000 });
  } catch (e: any) {
    return { success: false, message: `Config salva mas falha ao aplicar: ${e?.message || e}` };
  }

  return { success: true, message: `Configuração salva para "${cleanSsid}". Aplicando netplan (pode haver breve desconexão se estiver no Wi-Fi). Se perder acesso, conecte o cabo Ethernet (DHCP) e acesse o painel para ajustar.` };
}
