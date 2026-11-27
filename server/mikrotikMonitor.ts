import { execFile } from 'child_process';
import { promisify } from 'util';
import { mikrotikGetStatus } from './mikrotik.js';
import { upsertMikrotikDevices, addMikrotikEvent, saveMikrotikSnapshot, listMikrotikDevices, listMikrotikEvents } from './db.js';
const execFileAsync = promisify(execFile);

const OUI: Record<string,string> = { 'D0:39:57':'Liteon/PC', '2C:C8:1B':'MikroTik', 'C4:3C:B0':'Yoosee/IPC', '5C:CD:5B':'Intel', '1C:EF:03':'ISP/Router' };
function vendor(mac=''){ const p=mac.toUpperCase().split(':').slice(0,3).join(':'); return OUI[p] || 'Desconhecido'; }
function typeGuess(host='', vendorName='', mac='', ip=''){ const h=host.toLowerCase(), v=vendorName.toLowerCase(), m=String(mac||'').toUpperCase(); if(/iphone|android|samsung|xiaomi|moto|galaxy/.test(h)) return 'mobile'; if(/tv|roku|chromecast|firetv/.test(h)) return 'tv'; if(/cam|ipc|yoosee/.test(h+v) || ['C4:3C:B0'].includes(m.slice(0,8))) return 'camera'; if(/printer|hp|epson/.test(h)) return 'printer'; if(/mikrotik/.test(v)) return 'router'; if(/pc|desktop|laptop|notebook|samuel/.test(h) || /liteon|intel/.test(v)) return 'computer'; if(ip==='192.168.100.1' || /isp|gateway|modem/.test(h+v)) return 'gateway'; return h? 'host':'unknown'; }
function parseLeaseLastSeen(s: string): number { const m=String(s||'').match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/); if(!m) return Number.MAX_SAFE_INTEGER; const [_,w,d,h,min,sec]=m; return (((Number(w||0)*7+Number(d||0))*24+Number(h||0))*60+Number(min||0))*60+Number(sec||0); }

let last: any = null;
let timer: NodeJS.Timeout | null = null;
const pingState = new Map<string,{ok:boolean;ts:number}>();
let pingSweepRunning = false;
async function pingHost(ip:string){ try{ await execFileAsync('ping',['-c','1','-W','1','-n',ip],{timeout:2500}); return true; }catch{ return false; } }
async function pingSweep(devices:any[]){ if(pingSweepRunning) return; pingSweepRunning=true; try{ const now=Date.now(); const targets=devices.map(d=>String(d.ip||d.last_ip||'')).filter(ip=>ip && !ip.startsWith('127.') && !ip.startsWith('169.254.')); for(let i=0;i<targets.length;i+=8){ await Promise.all(targets.slice(i,i+8).map(async ip=>{ const ok=await pingHost(ip); pingState.set(ip,{ok,ts:now}); })); } } finally { pingSweepRunning=false; } }

export async function pollMikrotikOnce() {
  const status = await mikrotikGetStatus();
  const now = new Date().toISOString();
  const leases = status.leases || [];
  const wifi = status.wifi || [];
  const arp = status.arp || [];
  const byMac = new Map<string, any>();
  for (const l of leases as any[]) {
    const mac = String(l['mac-address']||'').toUpperCase(); if (!mac) continue;
    const lastSeenSec = parseLeaseLastSeen(String(l['last-seen']||''));
    const recentBound = l.status==='bound' && lastSeenSec <= 20*60; // bound sozinho não basta; precisa ter sido visto recentemente
    byMac.set(mac, { mac, ip:l['active-address']||l.address, hostname:l['host-name']||'', connection:'dhcp', blocked: l.blocked==='true', online: recentBound, last_seen_sec: lastSeenSec });
  }
  for (const w of wifi as any[]) {
    const mac = String(w['mac-address']||'').toUpperCase(); if (!mac) continue;
    const prev: any = byMac.get(mac) || ({} as any); prev.mac=mac;
    byMac.set(mac, { ...prev, ip: prev.ip || w['last-ip'], connection:'wifi', ssid:w.interface, signal_dbm: parseFloat(String(w['signal-strength']||'').replace('@.*','')) || null, tx_rate:w['tx-rate'], rx_rate:w['rx-rate'], online:true });
  }
  for (const a of arp as any[]) {
    const mac = String(a['mac-address']||'').toUpperCase(); if (!mac) continue;
    const prev: any = byMac.get(mac) || ({} as any); prev.mac=mac;
    const arpStatus = String(a.status||'').toLowerCase();
    const arpOnline = ['reachable','delay','probe','permanent'].includes(arpStatus);
    byMac.set(mac, { ...prev, ip: prev.ip || a.address, interface: prev.interface || (prev.connection ? undefined : a.interface), online: Boolean((prev as any).online) || arpOnline });
  }
  for (const d of byMac.values()) { const ip=String(d.ip||''); const p=pingState.get(ip); if (p && Date.now()-p.ts < 10*60*1000 && p.ok) d.online = true; }
  const devices = [...byMac.values()].map(d => { const v=vendor(d.mac); const { last_seen_sec, ...rest } = d as any; return { ...rest, online: d.online?1:0, vendor:v, device_type:typeGuess(d.hostname, v, d.mac, d.ip), nickname:null, trusted:false, notes:null, icon:null, first_seen: now, last_ip:d.ip }; });
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
  const run = async () => { try { await pollMikrotikOnce(); const devs=listMikrotikDevices(); if (Date.now() - (Math.max(0,...[...pingState.values()].map(v=>v.ts))||0) >= 5*60*1000) pingSweep(devs).catch(()=>{}); } catch (e) { console.warn('[MikroTik] poll failed', (e as any)?.message || e); } };
  run(); timer = setInterval(run, intervalMs);
}
