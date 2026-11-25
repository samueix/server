import { mikrotikGetStatus } from './mikrotik.js';
import { upsertMikrotikDevices, addMikrotikEvent, saveMikrotikSnapshot, listMikrotikDevices, listMikrotikEvents } from './db.js';

const OUI: Record<string,string> = { 'D0:39:57':'Liteon/PC', '2C:C8:1B':'MikroTik', 'C4:3C:B0':'Yoosee/IPC', '5C:CD:5B':'Intel', '1C:EF:03':'ISP/Router' };
function vendor(mac=''){ const p=mac.toUpperCase().split(':').slice(0,3).join(':'); return OUI[p] || 'Desconhecido'; }
function typeGuess(host='', vendorName=''){ const h=host.toLowerCase(), v=vendorName.toLowerCase(); if(/iphone|android|samsung|xiaomi|moto/.test(h)) return 'mobile'; if(/tv|roku|chromecast/.test(h)) return 'tv'; if(/cam|ipc|yoosee/.test(h+v)) return 'camera'; if(/printer|hp|epson/.test(h)) return 'printer'; if(/mikrotik/.test(v)) return 'router'; return h? 'host':'unknown'; }

let last: any = null;
let timer: NodeJS.Timeout | null = null;

export async function pollMikrotikOnce() {
  const status = await mikrotikGetStatus();
  const now = new Date().toISOString();
  const leases = status.leases || [];
  const wifi = status.wifi || [];
  const arp = status.arp || [];
  const byMac = new Map<string, any>();
  for (const l of leases as any[]) {
    const mac = String(l['mac-address']||'').toUpperCase(); if (!mac) continue;
    byMac.set(mac, { mac, ip:l['active-address']||l.address, hostname:l['host-name']||'', connection:'dhcp', blocked: l.blocked==='true', online: l.status==='bound' });
  }
  for (const w of wifi as any[]) {
    const mac = String(w['mac-address']||'').toUpperCase(); if (!mac) continue;
    const prev: any = byMac.get(mac) || ({} as any); prev.mac=mac;
    byMac.set(mac, { ...prev, ip: prev.ip || w['last-ip'], connection:'wifi', ssid:w.interface, signal_dbm: parseFloat(String(w['signal-strength']||'').replace('@.*','')) || null, tx_rate:w['tx-rate'], rx_rate:w['rx-rate'], online:true });
  }
  for (const a of arp as any[]) {
    const mac = String(a['mac-address']||'').toUpperCase(); if (!mac) continue;
    const prev: any = byMac.get(mac) || ({} as any); prev.mac=mac;
    byMac.set(mac, { ...prev, ip: prev.ip || a.address, interface: a.interface, online: (prev as any).online ?? (a.complete==='true' || a['complete']==='true') });
  }
  const devices = [...byMac.values()].map(d => { const v=vendor(d.mac); return { ...d, vendor:v, device_type:typeGuess(d.hostname, v), nickname:null, trusted:false, notes:null, first_seen: now, last_ip:d.ip }; });
  const prevList = listMikrotikDevices();
  const prevByMac = new Map<string, any>(prevList.map((d:any)=>[String(d.mac).toUpperCase(), d]));
  for (const d of devices) {
    if (!prevByMac.has(d.mac)) addMikrotikEvent({ ts: now, event_type:'new_device', mac:d.mac, ip:d.ip, hostname:d.hostname, details:`Novo dispositivo ${d.hostname||d.mac}` });
    const prev: any = prevByMac.get(d.mac);
    if (prev && Number(prev.online) !== (d.online?1:0)) addMikrotikEvent({ ts: now, event_type: d.online?'online':'offline', mac:d.mac, ip:d.ip, hostname:d.hostname, details:`${d.hostname||d.mac} ${d.online?'online':'offline'}` });
  }
  upsertMikrotikDevices(devices);
  const res=status.resource||{};
  const cpu=Number(res['cpu-load']||0); const memTotal=Number(res['total-memory']||0); const memFree=Number(res['free-memory']||0);
  const memPct=memTotal?((memTotal-memFree)/memTotal*100):0;
  if (cpu>=85) addMikrotikEvent({ ts: now, event_type:'alert_cpu', details:`CPU alta: ${cpu}%` });
  if (memPct>=90) addMikrotikEvent({ ts: now, event_type:'alert_mem', details:`RAM alta: ${memPct.toFixed(1)}%` });
  saveMikrotikSnapshot({ ts: now, resource: status.resource, interfaces: status.interfaces, leases: status.leases, wifi: status.wifi, arp: status.arp });
  last = { ...status, devices: listMikrotikDevices(), events: listMikrotikEvents(50) };
  return last;
}

export function getMikrotikCached() { return last; }
export function startMikrotikMonitor(intervalMs=15000) {
  if (timer) return;
  const run = async () => { try { await pollMikrotikOnce(); } catch (e) { console.warn('[MikroTik] poll failed', (e as any)?.message || e); } };
  run(); timer = setInterval(run, intervalMs);
}
