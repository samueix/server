import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Router, Wifi, Shield, Network, Cable, Users, AlertTriangle, Activity, History, Server, Globe, ShieldCheck, ArrowRight, Lock, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';
import type { MikrotikStatus } from '../../types';

const fmtBytes = (n: any) => { const v=Number(n||0); if(v>1e9) return (v/1e9).toFixed(2)+' GB'; if(v>1e6) return (v/1e6).toFixed(1)+' MB'; if(v>1e3) return (v/1e3).toFixed(1)+' KB'; return v+' B'; };
const fmtRate = (bps: any) => { const v=Number(bps||0); if(v>=1e9) return (v/1e9).toFixed(2)+' Gbps'; if(v>=1e6) return (v/1e6).toFixed(2)+' Mbps'; if(v>=1e3) return (v/1e3).toFixed(1)+' Kbps'; return Math.round(v)+' bps'; };
function LineChart({ series, labels, yMax, unit = '', height = 160 }: { series: { name: string; color: string; values: number[] }[]; labels?: string[]; yMax?: number; unit?: string; height?: number }) {
  const n = Math.max(0, ...series.map(s => s.values.length));
  if (n < 2) return <div style={{ height }} className="flex items-center justify-center text-xs font-mono text-[#4A4A68]">Sem dados suficientes para o gráfico.</div>;
  const W = 640, padL = 46, padR = 12, padT = 10, padB = 20;
  const max = Math.max(yMax ?? 0, ...series.flatMap(s => s.values), 0.0001);
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - Math.max(0, Math.min(v, max)) / max) * (height - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);
  const fmtVal = (v: number) => unit === 'Mbps' ? fmtRate(v * 1e6) : `${Math.round(v)}${unit}`;
  const labelAt = (i: number) => { const l = labels?.[i] || ''; if (!l) return ''; const d = new Date(l); return isNaN(d.getTime()) ? l : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  return <div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold mb-1">
      {series.map(s => <span key={s.name} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />{s.name}: <span className="font-mono">{fmtVal(s.values[n - 1] || 0)}</span></span>)}
    </div>
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full">
      {ticks.map((t, i) => { const yy = y(t); return <g key={i}><line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="#1A1A2E" strokeOpacity="0.12" /><text x={padL - 5} y={yy + 3} textAnchor="end" fontSize="9" fill="#4A4A68">{unit === 'Mbps' ? fmtRate(t * 1e6).replace(' Gbps','G').replace(' Mbps','M').replace(' Kbps','K').replace(' bps','') : `${Math.round(t)}${unit}`}</text></g>; })}
      <text x={padL} y={height - 5} fontSize="9" fill="#4A4A68">{labelAt(0)}</text>
      <text x={W - padR} y={height - 5} textAnchor="end" fontSize="9" fill="#4A4A68">{labelAt(n - 1)}</text>
      {series.map(s => { const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '); return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />; })}
      {series.map(s => { const i = Math.min(n - 1, s.values.length - 1); if (i < 0) return null; return <circle key={s.name} cx={x(i)} cy={y(s.values[i])} r="2.4" fill={s.color} />; })}
    </svg>
  </div>;
}
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E]"><div className="text-[11px] font-bold uppercase tracking-wider text-[#4A4A68]">{label}</div><div className="text-lg font-black font-title text-[#1A1A2E] mt-1 break-all">{value}</div>{sub && <div className="text-[11px] font-mono text-[#4A4A68] mt-1">{sub}</div>}</div>;
}
function Table({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return <div className="overflow-auto border-2 border-[#1A1A2E] rounded-xl bg-white shadow-[2px_2px_0px_#1A1A2E]"><table className="w-full text-xs font-mono"><thead className="bg-[#FFF7E8]"><tr>{cols.map(c=><th key={c} className="text-left p-2 border-b-2 border-[#1A1A2E]">{c}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i} className="border-b border-[#1A1A2E]/10 last:border-b-0">{r.map((c,j)=><td key={j} className="p-2 align-top">{c}</td>)}</tr>):<tr><td className="p-3 text-[#4A4A68]" colSpan={cols.length}>Sem dados</td></tr>}</tbody></table></div>;
}

type TopoKind = 'router' | 'wan' | 'lan' | 'port' | 'device' | 'gateway';
interface TopoNode { label: string; sub?: string; kind: TopoKind; online?: boolean; children?: TopoNode[]; }

function buildTopology(data: MikrotikStatus | null): TopoNode | null {
  if (!data?.ok) return null;
  const addresses = (data.addresses || []) as any[];
  const routes = (data.routes || []) as any[];
  const arp = (data.arp || []) as any[];
  const devices = (data.devices || []) as any[];
  const bridgePorts = (data.bridgePorts || []) as any[];
  const bridgeHosts = (data.bridgeHosts || []) as any[];
  const interfaces = (data.interfaces || []) as any[];
  const ethernet = (data.ethernet || []) as any[];
  const wanAddr = addresses.find(a => a.interface === 'ether1')?.address || 'WAN';
  const lanAddr = addresses.find(a => String(a.interface || '').startsWith('bridge'))?.address || 'LAN';
  const gw = routes.find(r => r['dst-address'] === '0.0.0.0/0')?.gateway || 'gateway';
  const onIface = new Map<string, string>();
  for (const h of bridgeHosts) if (h['mac-address']) onIface.set(String(h['mac-address']).toUpperCase(), h['on-interface'] || h.interface || '');
  const ifaceOf = (d: any) => {
    const m = String(d.mac || '').toUpperCase();
    const viaBridge = onIface.get(m);
    if (viaBridge) return viaBridge;
    const a = arp.find(x => String(x['mac-address'] || '').toUpperCase() === m);
    return a?.interface || d.interface || '';
  };
  const devNode = (d: any): TopoNode => ({
    label: d.nickname || d.hostname || d.mac,
    sub: `${d.ip || d.last_ip || 'sem IP'} · ${d.mac}${d.signal_dbm ? ` · ${d.signal_dbm} dBm` : ''}`,
    kind: 'device', online: Boolean(Number(d.online)),
  });
  const lanPrefix = String(lanAddr).split('/')[0].split('.').slice(0, 3).join('.') + '.';
  const wanPrefix = String(wanAddr).split('/')[0].split('.').slice(0, 3).join('.') + '.';
  const ipOf = (d: any) => String(d.ip || d.last_ip || '');
  const isVpnIp = (ip:string)=> ip.startsWith('100.') || ip.startsWith('fd7a:115c:a1e0:');
  const wanDevices = devices.filter(d => {
    const ip = ipOf(d);
    if (isVpnIp(ip)) return false;
    if (ip && ip === String(gw)) return false;
    if (ip.startsWith(lanPrefix)) return false;
    if (ip.startsWith(wanPrefix)) return true;
    return ifaceOf(d) === 'ether1';
  });
  const vpnDevices = devices.filter(d => isVpnIp(ipOf(d)));
  const lanDevices = devices.filter(d => !wanDevices.includes(d) && !vpnDevices.includes(d) && ipOf(d) !== String(gw));
  const ifaceMap = new Map<string, any>(interfaces.map((i: any) => [String(i.name), i]));
  const ethMap = new Map<string, any>(ethernet.map((e: any) => [String(e.name), e]));
  const portInfo = (name: string) => {
    const ifc = ifaceMap.get(name);
    const eth = ethMap.get(name);
    return { running: ifc ? ifc.running === 'true' : undefined, speed: String(eth?.speed || '') };
  };
  const portOf = (d: any) => { const p = ifaceOf(d); return p === 'ether1' ? '' : p; };
  const portNames = Array.from(new Set([
    ...bridgePorts.filter(p => p.disabled !== 'true').map(p => p.interface).filter(Boolean),
    'wlan1',
  ]));
  const lanChildren: TopoNode[] = portNames.map(port => {
    const onPort = lanDevices.filter(d => portOf(d) === port);
    const info = portInfo(port);
    const state = info.running === false ? 'link down' : 'link up';
    return { label: port, sub: `${state}${info.speed ? ` · ${info.speed}` : ''} · ${onPort.length} dispositivo(s)`, kind: 'port', online: info.running, children: onPort.map(devNode) };
  });
  const mapped = new Set(portNames.flatMap(p => lanDevices.filter(d => portOf(d) === p).map(d => d.mac)));
  const otherLan = lanDevices.filter(d => !mapped.has(d.mac));
  if (otherLan.length) lanChildren.push({ label: 'DHCP / ARP (sem porta física)', sub: `${otherLan.length} dispositivo(s)`, kind: 'port', children: otherLan.map(devNode) });
  return {
    label: data.identity?.name || 'MikroTik',
    sub: `${data.resource?.['board-name'] || ''} · ${data.resource?.version || ''}`,
    kind: 'router',
    children: [
      { label: 'WAN · ether1', sub: wanAddr, kind: 'wan', children: [
        { label: `Upstream ${gw}`, sub: 'gateway padrão', kind: 'gateway', online: true },
        ...wanDevices.map(devNode),
      ] },
      { label: 'LAN · bridge-LAN', sub: lanAddr, kind: 'lan', children: lanChildren },
      { label: 'VPN / Tailscale', sub: 'externo à LAN (acesso remoto)', kind: 'wan', children: vpnDevices.length ? vpnDevices.map(devNode) : [{ label:'Nenhum dispositivo VPN inventariado', sub:'Rotas/peers podem existir fora do inventário MikroTik', kind:'gateway', online:false }] },
    ],
  };
}

function Tree({ node, depth = 0 }: { node: TopoNode; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const Icon = node.kind === 'router' ? Router : node.kind === 'wan' ? Globe : node.kind === 'lan' ? Network : node.kind === 'port' ? Cable : node.kind === 'gateway' ? ArrowRight : Server;
  const hasChildren = Boolean(node.children?.length);
  return (
    <div className={depth ? 'ml-3 border-l-2 border-[#1A1A2E]/20 pl-3' : ''}>
      <div className="flex items-center gap-1.5 py-0.5 flex-wrap">
        {hasChildren ? <button onClick={()=>setCollapsed(v=>!v)} className="inline-flex w-5 h-5 items-center justify-center rounded border border-[#1A1A2E] bg-white hover:bg-[#FFF7E8]">{collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</button> : <span className="w-5" />}
        <span className={`inline-flex w-5 h-5 items-center justify-center rounded border border-[#1A1A2E] ${node.kind === 'router' ? 'bg-[#FF5A36] text-white' : node.kind === 'wan' ? 'bg-[#E0F4FE]' : node.kind === 'lan' ? 'bg-[#ECFDF3]' : 'bg-[#FFF7E8]'}`}><Icon className="w-3 h-3" /></span>
        <span className="font-bold text-xs">{node.label}</span>
        {node.sub && <span className="text-[10px] font-mono text-[#4A4A68]">{node.sub}</span>}
        {node.online !== undefined && <span className={`text-[10px] font-bold ${node.online ? 'text-[#027A48]' : 'text-[#B42318]'}`}>{node.online ? 'online' : 'offline'}</span>}
        {hasChildren && <span className="text-[10px] font-mono text-[#4A4A68]">({node.children!.length})</span>}
      </div>
      {!collapsed && node.children?.map((c, i) => <Tree key={`${c.label}-${i}`} node={c} depth={depth + 1} />)}
    </div>
  );
}

function flattenTopo(node: TopoNode, parentId?: string, out: any[] = [], depth=0) {
  const id = `${parentId||'root'}>${node.label}:${node.sub||''}:${depth}:${out.length}`;
  out.push({ id, node, parentId, depth });
  node.children?.forEach(c=>flattenTopo(c,id,out,depth+1));
  return out;
}
function TopologyMap({ root, pos, onMove }: { root: TopoNode; pos: Record<string,{x:number;y:number}>; onMove:(id:string,x:number,y:number)=>void }) {
  const flat = useMemo(()=>flattenTopo(root),[root]);
  const byId = new Map(flat.map(f=>[f.id,f]));
  const defaultPos = (f:any) => ({ x: 20 + f.depth*240, y: 20 + (flat.filter(x=>x.depth===f.depth).indexOf(f))*92 });
  const getPos = (f:any) => pos[f.id] || defaultPos(f);
  const [drag, setDrag] = useState<{id:string;ox:number;oy:number;sx:number;sy:number}|null>(null);
  const [pan, setPan] = useState({x:0,y:0});
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState<{sx:number;sy:number;ox:number;oy:number}|null>(null);
  return (
    <div className="relative border-2 border-[#1A1A2E] rounded-xl bg-[#fffdf7] overflow-hidden" style={{height:460}}
      onWheel={(e)=>{ e.preventDefault(); const d=e.deltaY>0?-0.08:0.08; setZoom(z=>Math.min(2,Math.max(0.4, +(z+d).toFixed(2)))); }}
      onMouseMove={(e)=>{ if(drag){ onMove(drag.id, Math.max(0, drag.ox + (e.clientX-drag.sx)/zoom), Math.max(0, drag.oy + (e.clientY-drag.sy)/zoom)); } else if(panning){ setPan({x:panning.ox+(e.clientX-panning.sx), y:panning.oy+(e.clientY-panning.sy)}); } }}
      onMouseUp={()=>{setDrag(null); setPanning(null);}} onMouseLeave={()=>{setDrag(null); setPanning(null);}}
      onMouseDown={(e)=>{ if((e.target as HTMLElement).closest('[data-node]')) return; setPanning({sx:e.clientX,sy:e.clientY,ox:pan.x,oy:pan.y}); }}>
      <div className="absolute top-2 right-2 z-10 flex gap-1"><button className="px-2 py-1 border-2 border-[#1A1A2E] bg-white text-xs font-bold rounded" onClick={()=>setZoom(z=>Math.min(2,z+0.1))}>+</button><button className="px-2 py-1 border-2 border-[#1A1A2E] bg-white text-xs font-bold rounded" onClick={()=>setZoom(z=>Math.max(0.4,z-0.1))}>-</button><button className="px-2 py-1 border-2 border-[#1A1A2E] bg-white text-xs font-bold rounded" onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>Reset</button></div>
      <div style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin:'0 0', minWidth:1400, minHeight:900, position:'relative'}}>
        <svg className="absolute top-0 left-0 pointer-events-none" width={1400} height={900}>
          {flat.filter(f=>f.parentId).map(f=>{ const a=getPos(byId.get(f.parentId!)); const b=getPos(f); if(!a||!b) return null; return <line key={f.id} x1={a.x+210} y1={a.y+28} x2={b.x} y2={b.y+28} stroke="#1A1A2E" strokeOpacity="0.35" strokeWidth="2" />; })}
        </svg>
        {flat.map(f=>{ const p=getPos(f); const Icon = f.node.kind==='router'?Router:f.node.kind==='wan'?Globe:f.node.kind==='lan'?Network:f.node.kind==='port'?Cable:f.node.kind==='gateway'?ArrowRight:Server;
          return <div key={f.id} data-node onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation(); setDrag({id:f.id,ox:p.x,oy:p.y,sx:e.clientX,sy:e.clientY}); }}
            className="absolute cursor-grab active:cursor-grabbing select-none bg-white border-2 border-[#1A1A2E] rounded-lg shadow-[2px_2px_0px_#1A1A2E] px-2 py-1.5" style={{left:p.x,top:p.y,width:210}}>
            <div className="flex items-center gap-1 text-xs font-bold"><Icon className="w-3.5 h-3.5" /><span className="truncate">{f.node.label}</span></div>
            {f.node.sub && <div className="text-[10px] font-mono text-[#4A4A68] truncate">{f.node.sub}</div>}
            {f.node.online!==undefined && <div className={`text-[10px] font-bold ${f.node.online?'text-[#027A48]':'text-[#B42318]'}`}>{f.node.online?'online':'offline'}</div>}
          </div>; })}
      </div>
    </div>
  );
}

export const MikroTikTab: React.FC = () => {
  const [data, setData] = useState<MikrotikStatus|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [busyMac, setBusyMac] = useState<string|null>(null);
  const [pingTarget, setPingTarget] = useState('1.1.1.1');
  const [pingResult, setPingResult] = useState<any>(null);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [dnsName, setDnsName] = useState('google.com');
  const [dnsResult, setDnsResult] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [bandwidth, setBandwidth] = useState<any>(null);
  const [dnsSettings, setDnsSettings] = useState<any>(null);
  const [dnsServersInput, setDnsServersInput] = useState('192.168.100.23');
  const [dhcpDnsInput, setDhcpDnsInput] = useState('192.168.88.1');
  const [busyDns, setBusyDns] = useState(false);
  const [busyExport, setBusyExport] = useState<string|null>(null);
  const [dnsMsg, setDnsMsg] = useState<string|null>(null);
  const [topoView, setTopoView] = useState<'tree'|'map'>(() => (localStorage.getItem('mikrotik_topo_view') as any) || 'tree');
  const [topoPos, setTopoPos] = useState<Record<string,{x:number;y:number}>>(()=>{ try { return JSON.parse(localStorage.getItem('mikrotik_topo_pos')||'{}'); } catch { return {}; } });
  const loadDnsSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/mikrotik/dns-settings', { headers: getAuthHeaders() });
      const j = await res.json();
      if (res.ok && j?.ok !== false) {
        setDnsSettings(j);
        const current = String(j?.dns?.servers || '').trim();
        if (current) setDnsServersInput(current);
      }
    } catch {}
  }, []);
  const applyDns = async (servers: string[]) => {
    if (!confirm(`Aplicar DNS do roteador: ${servers.join(', ')}?\nDHCP LAN: ${dhcpDnsInput || 'sem alteração'}`)) return;
    setBusyDns(true); setDnsMsg(null);
    try {
      const res = await fetch('/api/mikrotik/dns-settings', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers, dhcpDns: dhcpDnsInput, applyDhcp: Boolean(dhcpDnsInput) }),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`);
      setDnsSettings(j);
      setDnsMsg(`Aplicado: ${servers.join(', ')}${dhcpDnsInput ? ` · DHCP ${dhcpDnsInput}` : ''}`);
      await refresh();
      await loadDnsSettings();
    } catch (e: any) { setDnsMsg(`Erro: ${e?.message || 'falha ao aplicar DNS'}`); }
    finally { setBusyDns(false); }
  };
  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [res, sres] = await Promise.all([
        fetch('/api/mikrotik/status', { headers: getAuthHeaders() }),
        fetch('/api/mikrotik/snapshots?limit=180', { headers: getAuthHeaders() })
      ]);
      const j = await res.json(); if (!res.ok || j?.ok===false) throw new Error(j?.error||`HTTP ${res.status}`); setData(j);
      const sj = await sres.json().catch(()=>({snapshots:[]})); if (Array.isArray(sj?.snapshots)) setSnapshots(sj.snapshots);
    }
    catch (e:any) { setError(e?.message||'Falha ao consultar MikroTik'); }
    finally { setLoading(false); }
  }, []);
  const act = async (mac:string, action:'block'|'unblock') => {
    if (!confirm(`${action==='block'?'Bloquear':'Desbloquear'} ${mac}?`)) return;
    setBusyMac(mac+action);
    try { const res = await fetch(`/api/mikrotik/devices/${encodeURIComponent(mac)}/${action}`, { method:'POST', headers: getAuthHeaders() }); const j=await res.json(); if(!res.ok||j?.ok===false) throw new Error(j?.error||`HTTP ${res.status}`); await refresh(); }
    catch(e:any){ alert(e?.message||'Falha'); } finally { setBusyMac(null); }
  };
  const runPing = async () => {
    setBusyMac('ping');
    try { const res = await fetch('/api/mikrotik/ping', { method:'POST', headers:{...getAuthHeaders(),'Content-Type':'application/json'}, body: JSON.stringify({ target: pingTarget, count:4 }) }); const j=await res.json(); if(!res.ok||j?.ok===false) throw new Error(j?.error||`HTTP ${res.status}`); setPingResult(j); }
    catch(e:any){ setPingResult({ ok:false, error:e?.message||'Falha' }); } finally { setBusyMac(null); }
  };
  const runTrace = async () => {
    setBusyMac('trace');
    try { const res = await fetch('/api/mikrotik/traceroute', { method:'POST', headers:{...getAuthHeaders(),'Content-Type':'application/json'}, body: JSON.stringify({ target: pingTarget }) }); const j=await res.json(); if(!res.ok||j?.ok===false) throw new Error(j?.error||`HTTP ${res.status}`); setTraceResult(j); }
    catch(e:any){ setTraceResult({ ok:false, error:e?.message||'Falha' }); } finally { setBusyMac(null); }
  };
  const runDns = async () => {
    setBusyMac('dns');
    try { const res = await fetch('/api/mikrotik/dns', { method:'POST', headers:{...getAuthHeaders(),'Content-Type':'application/json'}, body: JSON.stringify({ name: dnsName }) }); const j=await res.json(); if(!res.ok||j?.ok===false) throw new Error(j?.error||`HTTP ${res.status}`); setDnsResult(j); }
    catch(e:any){ setDnsResult({ ok:false, error:e?.message||'Falha' }); } finally { setBusyMac(null); }
  };
  const makeStatic = async (mac:string, ip?:string) => {
    if (!confirm(`Tornar DHCP estático para ${mac}?`)) return;
    setBusyMac(mac+'static');
    try { const res = await fetch(`/api/mikrotik/devices/${encodeURIComponent(mac)}/make-static`, { method:'POST', headers:{...getAuthHeaders(),'Content-Type':'application/json'}, body: JSON.stringify({ address: ip||'', comment: 'server-panel static' }) }); const j=await res.json(); if(!res.ok||j?.ok===false) throw new Error(j?.error||`HTTP ${res.status}`); await refresh(); }
    catch(e:any){ alert(e?.message||'Falha'); } finally { setBusyMac(null); }
  };
  const exportData = async (format:'json'|'csv', scope='devices') => {
    setBusyExport(format+scope);
    try {
      const res = await fetch(`/api/mikrotik/export?format=${format}&scope=${scope}`, { headers: getAuthHeaders() });
      if (!res.ok) { const j = await res.json().catch(()=>({})); throw new Error(j?.error || `HTTP ${res.status}`); }
      const blob = await res.blob();
      const disp = res.headers.get('content-disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(disp);
      const name = m?.[1] || `mikrotik-report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(e:any){ alert(e?.message||'Falha ao exportar'); } finally { setBusyExport(null); }
  };
  const loadBandwidth = useCallback(async () => {
    try { const res = await fetch('/api/mikrotik/bandwidth', { headers: getAuthHeaders() }); const j = await res.json().catch(()=>null); if (res.ok && j?.ok !== false) setBandwidth(j); }
    catch {}
  }, []);
  useEffect(()=>{ refresh(); const id=setInterval(refresh,3000); return ()=>clearInterval(id); },[refresh]);
  useEffect(()=>{ loadDnsSettings(); },[loadDnsSettings]);
  useEffect(()=>{ loadBandwidth(); const id=setInterval(loadBandwidth,5000); return ()=>clearInterval(id); },[loadBandwidth]);

  const r=data?.resource||{}; const devices=data?.devices||[]; const events=data?.events||[]; const wifi=data?.wifi||[]; const leases=data?.leases||[]; const interfaces=data?.interfaces||[]; const firewall=data?.firewall||[]; const routes=data?.routes||[]; const nat=data?.nat||[];
  const memUsed=(Number(r['total-memory']||0)-Number(r['free-memory']||0)); const memPct=r['total-memory']?Math.round((memUsed/Number(r['total-memory']))*100):0;
  const online=devices.filter((d:any)=>Number(d.online)).length; const blocked=devices.filter((d:any)=>Number(d.blocked)).length;
  const topology = useMemo(()=>buildTopology(data),[data]);
  const saveTopoPos = (id:string,x:number,y:number)=>{ setTopoPos(p=>{ const n={...p,[id]:{x:Math.max(0,Math.round(x)),y:Math.max(0,Math.round(y))}}; localStorage.setItem('mikrotik_topo_pos',JSON.stringify(n)); return n; }); };
  const ipv6 = (data as any)?.ipv6 || {};
  const routerDns = String(dnsSettings?.dns?.servers || data?.dns?.servers || '');
  const dhcpDns = (dnsSettings?.dhcpNetworks || []).map((n:any)=>n['dns-server']).filter(Boolean).join(', ');

  return <div className="space-y-4 font-sans text-[#1A1A2E]">
    <div className="p-4 sm:p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center"><Router className="w-5 h-5 text-[#FF5A36]"/></div><div><h2 className="text-lg sm:text-xl font-black font-title tracking-tight">Network Center / MikroTik</h2><p className="text-xs sm:text-sm text-[#4A4A68] font-medium mt-0.5">RouterOS 8728 • inventário/histórico local • auto 3s. {data?.identity?.name||''}</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={()=>exportData('json')} disabled={busyExport==='jsondevices'} className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-[#1A1A2E] font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"><Download className="w-4 h-4"/>{busyExport==='jsondevices'?'Gerando...':'Relatório JSON'}</button>
        <button type="button" onClick={()=>exportData('csv','devices')} disabled={busyExport==='csvdevices'} className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-[#1A1A2E] font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"><Download className="w-4 h-4"/>{busyExport==='csvdevices'?'Gerando...':'Inventário CSV'}</button>
        <button type="button" onClick={refresh} className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#E04522] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer"><RefreshCw className="w-4 h-4"/>Atualizar</button>
      </div>
    </div>
    {error && <div className="bg-[#FEE4E2] border-2 border-[#1A1A2E] text-[#B42318] rounded-xl p-4 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5"/><div><div className="font-bold">Erro MikroTik</div><div className="font-mono text-xs mt-1">{error}</div></div></div>}
    {loading && <div className="p-8 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-center font-semibold text-[#4A4A68]">Consultando MikroTik...</div>}
    {data?.ok && <>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Roteador" value={data.ok?'Online':'Offline'} sub={data.host}/>
        <Stat label="Uptime" value={r.uptime||'—'} sub={r.version||''}/>
        <Stat label="CPU" value={`${r['cpu-load']||0}%`} sub={r['board-name']||''}/>
        <Stat label="RAM" value={`${memPct}%`} sub={`${fmtBytes(memUsed)} / ${fmtBytes(r['total-memory'])}`}/>
        <Stat label="Dispositivos" value={devices.length} sub={`${online} online / ${blocked} bloqueados`}/>
        <Stat label="Wi-Fi" value={wifi.length} sub={`${leases.length} leases DHCP`}/>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Network className="w-4 h-4 text-[#FF5A36]"/>Topologia da rede</div>
        <div className="border-2 border-[#1A1A2E] rounded-xl bg-white p-3 shadow-[2px_2px_0px_#1A1A2E] overflow-auto">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="text-[10px] font-mono text-[#4A4A68]">Montada a partir de bridge ports/hosts, ARP, DHCP e Wi‑Fi.</div>
            <div className="flex gap-2">
              <button onClick={()=>{setTopoView('tree'); localStorage.setItem('mikrotik_topo_view','tree');}} className={`px-2 py-1 text-xs font-bold border-2 border-[#1A1A2E] rounded ${topoView==='tree'?'bg-[#FFC857]':'bg-white'}`}>Árvore</button>
              <button onClick={()=>{setTopoView('map'); localStorage.setItem('mikrotik_topo_view','map');}} className={`px-2 py-1 text-xs font-bold border-2 border-[#1A1A2E] rounded ${topoView==='map'?'bg-[#FFC857]':'bg-white'}`}>Mapa/Organizar</button>
              {topoView==='map' && <button onClick={()=>{setTopoPos({}); localStorage.removeItem('mikrotik_topo_pos');}} className="px-2 py-1 text-xs font-bold border-2 border-[#1A1A2E] rounded bg-white">Reset layout</button>}
            </div>
          </div>
          {topology ? (topoView==='map' ? <TopologyMap root={topology} pos={topoPos} onMove={saveTopoPos} /> : <Tree node={topology} />) : <div className="text-xs text-[#4A4A68]">Sem dados de topologia.</div>}
        </div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Cable className="w-4 h-4 text-[#FF5A36]"/>Portas físicas / topologia</div>
        <Table cols={['Porta','Link','Velocidade','Papel','Dispositivos']} rows={(() => {
          const eth = (data?.ethernet || []) as any[];
          const ifs = (data?.interfaces || []) as any[];
          const bPorts = (data?.bridgePorts || []) as any[];
          const bHosts = (data?.bridgeHosts || []) as any[];
          const macOn = (port:string) => bHosts.filter((h:any)=>h['on-interface']===port && h['local']!=='true').map((h:any)=>String(h['mac-address']).toUpperCase());
          const namesFor = (port:string) => macOn(port).map(m => { const d = devices.find((x:any)=>String(x.mac).toUpperCase()===m); return d ? (d.nickname||d.hostname||d.mac) : m; });
          const rows = eth.map((e:any) => {
            const ifc = ifs.find((i:any)=>i.name===e.name);
            const bp = bPorts.find((p:any)=>p.interface===e.name);
            const role = e.name==='ether1' ? 'WAN' : (bp?.role || (ifc?.slave==='true'?'bridge':'—'));
            const on = namesFor(e.name);
            const speed = e.speed ? `${e.speed}${e['full-duplex']==='true'?' FD':''}` : '—';
            return [e.name, ifc?.running==='true'?<span className="text-[#027A48] font-bold">up</span>:<span className="text-[#B42318] font-bold">down</span>, speed, role, on.length ? on.join(', ') : '—'];
          });
          const wlan = ifs.find((i:any)=>i.name==='wlan1');
          rows.push(['wlan1', wlan?.running==='true'?<span className="text-[#027A48] font-bold">up</span>:<span className="text-[#B42318] font-bold">down</span>, 'wireless', 'bridge', namesFor('wlan1').join(', ') || '—']);
          return rows;
        })()} />
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Users className="w-4 h-4 text-[#FF5A36]"/>Inventário de dispositivos</div>
        <Table cols={['Nome/Host','IP','MAC','Tipo/Fabricante','Conexão','Sinal','Último visto','Status','Ações']} rows={devices.map((d:any)=>[
          <div><div className="font-bold">{d.nickname||d.hostname||'—'}</div><div className="text-[#4A4A68]">{d.hostname||''}</div></div>, d.ip||d.last_ip||'—', d.mac, <div><div>{d.device_type||'unknown'}</div><div className="text-[#4A4A68]">{d.vendor||''}</div></div>, `${d.connection||'—'}${d.interface?` (${d.interface})`:''}`, d.signal_dbm?`${d.signal_dbm} dBm`:'—', d.last_seen?new Date(d.last_seen).toLocaleString():'—', <span className={Number(d.online)?'text-[#027A48] font-bold':'text-[#B42318] font-bold'}>{Number(d.online)?'online':'offline'}</span>,
          <div className="flex gap-1 flex-wrap">{Number(d.blocked)?<button disabled={busyMac===d.mac+'unblock'} onClick={()=>act(d.mac,'unblock')} className="px-2 py-1 border border-[#1A1A2E] rounded bg-[#ECFDF3] text-[11px] font-bold">Desbloquear</button>:<button disabled={busyMac===d.mac+'block'} onClick={()=>act(d.mac,'block')} className="px-2 py-1 border border-[#1A1A2E] rounded bg-[#FEE4E2] text-[11px] font-bold">Bloquear</button>}<button disabled={busyMac===d.mac+'static'} onClick={()=>makeStatic(d.mac,d.ip||d.last_ip)} className="px-2 py-1 border border-[#1A1A2E] rounded bg-[#FFF7E8] text-[11px] font-bold">DHCP fixo</button></div>
        ])} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Wifi className="w-4 h-4 text-[#FF5A36]"/>Wi-Fi (rádio MikroTik)</div>
          <Table cols={['IP','MAC','Sinal','TX/RX','Uptime']} rows={wifi.map((w:any)=>[w['last-ip']||'—', w['mac-address'], w['signal-strength']||'—', `${w['tx-rate']||'—'} / ${w['rx-rate']||'—'}`, w.uptime||'—'])} />
        </div>
        <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><History className="w-4 h-4 text-[#FF5A36]"/>Eventos recentes</div>
          <Table cols={['Quando','Evento','Dispositivo','Detalhe']} rows={events.slice(0,20).map((e:any)=>[e.ts?new Date(e.ts).toLocaleString():'—', e.event_type, `${e.hostname||''} ${e.ip||''} ${e.mac||''}`.trim(), e.details||'—'])} />
        </div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Activity className="w-4 h-4 text-[#FF5A36]"/>Banda por dispositivo</div>
        <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E] space-y-2">
          <div className="flex justify-between text-[11px] font-mono text-[#4A4A68]"><span>Base: /ip/firewall/connection (orig-rate/repl-rate)</span><span>{bandwidth?.ts?new Date(bandwidth.ts).toLocaleTimeString():'—'}</span></div>
          {(() => {
            const bw = new Map<string,any>((bandwidth?.devices||[]).map((x:any)=>[String(x.ip),x]));
            const rows = devices.map((d:any)=>{ const ip=String(d.ip||d.last_ip||''); const b=bw.get(ip); return { d, ip, rx:Number(b?.rx_bps||0), tx:Number(b?.tx_bps||0), conns:Number(b?.connections||0), total:Number(b?.rx_bps||0)+Number(b?.tx_bps||0) }; }).filter((r:any)=>r.ip).sort((a:any,b:any)=>b.total-a.total);
            const max = Math.max(1, ...rows.map((r:any)=>Math.max(r.rx,r.tx)));
            if (!rows.length) return <div className="text-xs text-[#4A4A68]">Sem dispositivos com IP conhecido.</div>;
            return <div className="space-y-2">{rows.map((r:any)=><div key={r.d.mac||r.ip} className="space-y-1"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold truncate">{r.d.nickname||r.d.hostname||r.d.mac}<span className="ml-2 font-normal text-[#4A4A68]">{r.ip}</span></span><span className="font-mono text-[11px] shrink-0">{fmtRate(r.rx)} ↓ · {fmtRate(r.tx)} ↑{r.conns?` · ${r.conns} conn`:''}</span></div><div className="flex gap-1"><div className="flex-1 h-2 rounded bg-[#1A1A2E]/10 overflow-hidden"><div className="h-full bg-[#0BA5EC]" style={{width:`${Math.min(100,(r.rx/max)*100)}%`}}/></div><div className="flex-1 h-2 rounded bg-[#1A1A2E]/10 overflow-hidden"><div className="h-full bg-[#FF5A36]" style={{width:`${Math.min(100,(r.tx/max)*100)}%`}}/></div></div></div>)}</div>;
          })()}
          <div className="text-[10px] font-mono text-[#4A4A68]">Azul = download, laranja = upload. Taxas instantâneas; pode variar entre amostras.</div>
        </div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Activity className="w-4 h-4 text-[#FF5A36]"/>Histórico (snapshots locais)</div>
        {(() => {
          const history = snapshots.slice().reverse().map((s:any)=>{ const r=s.resource||{}; const total=Number(r['total-memory']||0); const free=Number(r['free-memory']||0); return { ts:s.ts, cpu:Number(r['cpu-load']||0), ram: total?Math.round(((total-free)/total)*100):0, wifi:(s.wifi||[]).length, leases:(s.leases||[]).length, interfaces:s.interfaces||[] }; });
          const traffic:any[] = []; for(let i=1;i<history.length;i++){ const a=history[i-1], b=history[i]; const dt=(new Date(b.ts).getTime()-new Date(a.ts).getTime())/1000; if(!(dt>0)) continue; const sum=(s:any,k:string)=>(s.interfaces||[]).reduce((acc:number,x:any)=>acc+Number(x[k]||0),0); let drx=sum(b,'rx-byte')-sum(a,'rx-byte'); let dtx=sum(b,'tx-byte')-sum(a,'tx-byte'); if(drx<0) drx=0; if(dtx<0) dtx=0; traffic.push({ ts:b.ts, rx:(drx*8)/dt/1e6, tx:(dtx*8)/dt/1e6 }); }
          const labels = history.map((h:any)=>h.ts); const tLabels = traffic.map((t:any)=>t.ts);
          return <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E]"><div className="text-[11px] font-bold mb-1">CPU e RAM (%)</div><LineChart series={[{name:'CPU',color:'#FF5A36',values:history.map((h:any)=>h.cpu)},{name:'RAM',color:'#1A1A2E',values:history.map((h:any)=>h.ram)}]} labels={labels} yMax={100} unit="%" /></div>
            <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E]"><div className="text-[11px] font-bold mb-1">Clientes Wi‑Fi e leases DHCP</div><LineChart series={[{name:'Wi‑Fi',color:'#0BA5EC',values:history.map((h:any)=>h.wifi)},{name:'Leases',color:'#12B76A',values:history.map((h:any)=>h.leases)}]} labels={labels} unit="" /></div>
            <div className="xl:col-span-2 bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E]"><div className="text-[11px] font-bold mb-1">Tráfego total (Mbps, delta entre snapshots)</div><LineChart series={[{name:'Download',color:'#0BA5EC',values:traffic.map((t:any)=>t.rx)},{name:'Upload',color:'#FF5A36',values:traffic.map((t:any)=>t.tx)}]} labels={tLabels} unit="Mbps" /></div>
            <div className="xl:col-span-2 text-[10px] font-mono text-[#4A4A68]">{history.length} amostras locais (poll 15s, retenção 7 dias). Taxas de tráfego calculadas por delta de bytes das interfaces.</div>
          </div>;
        })()}
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Cable className="w-4 h-4 text-[#FF5A36]"/>Interfaces</div>
        <Table cols={['Nome','Tipo','Estado','MAC','RX','TX']} rows={interfaces.map((i:any)=>[i.name,i.type,<span className={i.running==='true'?'text-[#027A48] font-bold':'text-[#B42318] font-bold'}>{i.running==='true'?'up':'down'}</span>,i['mac-address']||'—',fmtBytes(i['rx-byte']),fmtBytes(i['tx-byte'])])} />
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Globe className="w-4 h-4 text-[#FF5A36]"/>IPv6 (roteador e divulgação)</div>
        <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E] space-y-2 text-xs font-mono">
          {(()=>{ const addrs=(ipv6.addresses||[]).filter((a:any)=>a.disabled!=='true'); const nd=(ipv6.nd||[]).filter((n:any)=>n.disabled!=='true'); const pools=ipv6.pools||[]; const prefixes=ipv6.ndPrefixes||[]; const settings=ipv6.settings||{}; const global=addrs.filter((a:any)=>!String(a.address||'').toLowerCase().startsWith('fe80:')); const linkLocal=addrs.filter((a:any)=>String(a.address||'').toLowerCase().startsWith('fe80:')); const raOn=nd.length>0; const advertising = raOn && (global.length>0 || pools.length>0 || prefixes.length>0 || String(settings['accept-router-advertisements']||'').includes('yes'));
          return <>
            <div><b>IPv6 habilitado:</b> {String(settings['disable-ipv6']||'false')==='true'?'não':'sim'} | <b>Forward:</b> {String(settings.forward||'')} | <b>Accept RA:</b> {String(settings['accept-router-advertisements']||'')}</div>
            <div><b>Endereços globais:</b> {global.length?global.map((a:any)=>`${a.address} (${a.interface})`).join(', '):'nenhum'}</div>
            <div><b>Link-local:</b> {linkLocal.length?linkLocal.map((a:any)=>`${a.address} (${a.interface})`).join(', '):'nenhum'}</div>
            <div><b>ND/RA:</b> {raOn?`ativo em ${nd.map((n:any)=>n.interface).join(', ')}`:'inativo'} {raOn && nd[0]?.['managed-address-configuration']?`| managed=${nd[0]['managed-address-configuration']}`:''} {raOn && nd[0]?.['other-configuration']?`| other=${nd[0]['other-configuration']}`:''}</div>
            <div><b>Prefixos ND/Pool DHCPv6:</b> {prefixes.length||pools.length ? `${prefixes.length} prefixos, ${pools.length} pools` : 'nenhum (sem prefixo global delegado/anunciado)'}</div>
            <div className={`font-bold ${global.length||pools.length||prefixes.length ? 'text-[#027A48]' : 'text-[#B54708]'}`}>{global.length||pools.length||prefixes.length ? 'Divulgação IPv6 global parece configurada.' : 'Sem IPv6 global/prefixo delegado: roteador anuncia RA, mas downstream deve ficar só com link-local/sem internet IPv6.'}</div>
          </>; })()}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Shield className="w-4 h-4 text-[#FF5A36]"/>Firewall</div><Table cols={['#','Chain','Action','In','Comentário']} rows={firewall.map((f:any,i:number)=>[String(i),f.chain,f.action,f['in-interface']||'—',f.comment||'—'])} /></div>
        <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Network className="w-4 h-4 text-[#FF5A36]"/>Rotas / NAT</div><Table cols={['Tipo','Destino','Saída/GW','Ativo']} rows={[...routes.map((r:any)=>['route',r['dst-address'],r.gateway||r['immediate-gw']||'—',r.active==='true'?'sim':'não']), ...nat.map((n:any)=>['nat',n.chain,n['out-interface']||n.action||'—',n.disabled==='true'?'não':'sim'])]} /></div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Activity className="w-4 h-4 text-[#FF5A36]"/>Diagnóstico (executado no roteador)</div>
        <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E] space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <input value={pingTarget} onChange={e=>setPingTarget(e.target.value)} className="px-3 py-2 border-2 border-[#1A1A2E] rounded-lg font-mono text-sm w-full sm:w-64" placeholder="IP ou host" />
            <button disabled={busyMac==='ping'} onClick={runPing} className="px-3 py-2 bg-[#1A1A2E] text-white rounded-lg font-bold text-sm border-2 border-[#1A1A2E] disabled:opacity-50">Ping</button>
            <button disabled={busyMac==='trace'} onClick={runTrace} className="px-3 py-2 bg-[#FFF7E8] text-[#1A1A2E] rounded-lg font-bold text-sm border-2 border-[#1A1A2E] disabled:opacity-50">Traceroute</button>
          </div>

          {pingResult && (pingResult.ok ? (() => {
            const rs = pingResult.results || [];
            const last = rs[rs.length - 1] || {};
            return (
              <div className="rounded-lg border-2 border-[#1A1A2E] overflow-hidden">
                <div className="bg-[#ECFDF3] px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
                  <span><b>Ping {pingResult.target}</b></span>
                  <span>enviados: {last.sent ?? rs.length}</span>
                  <span>recebidos: {last.received ?? rs.filter((r:any)=>r.time).length}</span>
                  <span>perda: {last['packet-loss'] ?? '—'}%</span>
                  <span>médio: {last['avg-rtt'] || '—'}</span>
                  <span>mín/máx: {last['min-rtt'] || '—'} / {last['max-rtt'] || '—'}</span>
                </div>
                <div className="max-h-40 overflow-auto divide-y divide-[#1A1A2E]/10">
                  {rs.map((r:any, i:number) => (
                    <div key={i} className="px-3 py-1 text-[11px] font-mono flex gap-4">
                      <span className="text-[#4A4A68] w-8">#{r.seq ?? i}</span>
                      <span className="font-bold">{r.time || 'timeout'}</span>
                      <span className="text-[#4A4A68]">ttl {r.ttl || '—'}</span>
                      <span className="text-[#4A4A68]">{r.size ? `${r.size} B` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })() : <div className="text-xs font-mono text-[#B42318]">Erro no ping: {pingResult.error}</div>)}

          {traceResult && (traceResult.ok ? (() => {
            const hops = traceResult.results || [];
            return (
              <div className="rounded-lg border-2 border-[#1A1A2E] overflow-hidden">
                <div className="bg-[#FFF7E8] px-3 py-2 text-[11px] font-mono"><b>Traceroute {traceResult.target}</b> · {hops.length} salto(s)</div>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="bg-[#FFF7E8]/60"><tr><th className="text-left p-1.5">#</th><th className="text-left p-1.5">Salto</th><th className="text-left p-1.5">Médio</th><th className="text-left p-1.5">Melhor</th><th className="text-left p-1.5">Pior</th><th className="text-left p-1.5">Perda</th></tr></thead>
                    <tbody>
                      {hops.map((h:any, i:number) => (
                        <tr key={i} className="border-t border-[#1A1A2E]/10">
                          <td className="p-1.5 text-[#4A4A68]">{h.hop ?? (i + 1)}</td>
                          <td className="p-1.5 font-bold">{h.address || '*'}</td>
                          <td className="p-1.5">{h.avg ? `${h.avg} ms` : '—'}</td>
                          <td className="p-1.5">{h.best ? `${h.best} ms` : '—'}</td>
                          <td className="p-1.5">{h.worst ? `${h.worst} ms` : '—'}</td>
                          <td className="p-1.5">{h.loss !== undefined ? `${h.loss}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })() : <div className="text-xs font-mono text-[#B42318]">Erro no traceroute: {traceResult.error}</div>)}

          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <input value={dnsName} onChange={e=>setDnsName(e.target.value)} className="px-3 py-2 border-2 border-[#1A1A2E] rounded-lg font-mono text-sm w-full sm:w-64" placeholder="nome DNS" />
            <button disabled={busyMac==='dns'} onClick={runDns} className="px-3 py-2 bg-[#FFF7E8] text-[#1A1A2E] rounded-lg font-bold text-sm border-2 border-[#1A1A2E] disabled:opacity-50">Consultar DNS</button>
            <span className="text-[11px] font-mono text-[#4A4A68]">usando DNS do roteador: {routerDns || '—'}</span>
          </div>
          {dnsResult && (dnsResult.ok ? (() => {
            const rs = dnsResult.results || [];
            if (!rs.length) return <div className="text-xs font-mono text-[#7A2E0E] bg-[#FEF0C7] border border-[#F79009] rounded p-2">Sem resposta do /resolve para <b>{dnsResult.name}</b>. Verifique se o DNS do roteador está acessível e se o domínio existe.</div>;
            return (
              <div className="rounded-lg border-2 border-[#1A1A2E] overflow-hidden">
                <div className="bg-[#E0F4FE] px-3 py-2 text-[11px] font-mono"><b>DNS {dnsResult.name}</b> · {rs.length} registro(s)</div>
                <div className="divide-y divide-[#1A1A2E]/10 max-h-40 overflow-auto">
                  {rs.map((r:any, i:number) => (
                    <div key={i} className="px-3 py-1 text-[11px] font-mono flex justify-between gap-3">
                      <span className="font-bold">{r.address || r.value || r.name || Object.values(r).filter(Boolean).join(' ')}</span>
                      {r.source && <span className="text-[#4A4A68]">{r.source}</span>}
                    </div>
                  ))}
                </div>
                {dnsResult.note && <div className="px-3 py-1 text-[10px] font-mono text-[#4A4A68] border-t border-[#1A1A2E]/10">{dnsResult.note}</div>}
              </div>
            );
          })() : <div className="text-xs font-mono text-[#B42318]">Erro no DNS: {dnsResult.error}</div>)}
        </div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#FF5A36]"/>DNS do roteador / bloqueador</div>
        <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E] space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono">
            <span>DNS atual: <b>{routerDns || '—'}</b></span>
            <span>DHCP LAN: <b>{dhcpDns || '—'}</b></span>
            <span>allow-remote-requests: <b>{String(dnsSettings?.dns?.['allow-remote-requests'] ?? data?.dns?.['allow-remote-requests'] ?? '—')}</b></span>
          </div>
          {routerDns && !routerDns.split(',').map(s=>s.trim()).includes('192.168.100.23') && (
            <div className="text-[11px] font-mono text-[#7A2E0E] bg-[#FEF0C7] border border-[#F79009] rounded p-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5"/>O roteador não está usando o AdGuard (192.168.100.23) como DNS.</div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <label className="text-[11px] font-bold">DNS servidores
              <input value={dnsServersInput} onChange={e=>setDnsServersInput(e.target.value)} className="mt-0.5 px-2 py-1.5 border-2 border-[#1A1A2E] rounded-lg font-mono text-xs w-full sm:w-56" placeholder="192.168.100.23" />
            </label>
            <label className="text-[11px] font-bold">DNS p/ DHCP LAN
              <input value={dhcpDnsInput} onChange={e=>setDhcpDnsInput(e.target.value)} className="mt-0.5 px-2 py-1.5 border-2 border-[#1A1A2E] rounded-lg font-mono text-xs w-full sm:w-40" placeholder="192.168.88.1" />
            </label>
            <div className="flex gap-1.5 flex-wrap sm:mt-4">
              <button disabled={busyDns} onClick={()=>applyDns(dnsServersInput.split(',').map(s=>s.trim()).filter(Boolean))} className="px-2.5 py-1.5 bg-[#FF5A36] text-white rounded-lg font-bold text-xs border-2 border-[#1A1A2E] disabled:opacity-50">Aplicar</button>
              <button disabled={busyDns} onClick={()=>applyDns(['192.168.100.23'])} className="px-2.5 py-1.5 bg-[#ECFDF3] rounded-lg font-bold text-xs border-2 border-[#1A1A2E] disabled:opacity-50">Usar AdGuard</button>
              <button disabled={busyDns} onClick={()=>applyDns(['1.1.1.1','8.8.8.8'])} className="px-2.5 py-1.5 bg-[#FFF7E8] rounded-lg font-bold text-xs border-2 border-[#1A1A2E] disabled:opacity-50">Públicos</button>
              <button disabled={busyDns} onClick={loadDnsSettings} className="px-2.5 py-1.5 bg-white rounded-lg font-bold text-xs border-2 border-[#1A1A2E] disabled:opacity-50">Recarregar</button>
            </div>
          </div>
          {dnsMsg && <div className={`text-[11px] font-mono rounded p-2 border ${dnsMsg.startsWith('Erro')?'text-[#B42318] bg-[#FEE4E2] border-[#F04438]':'text-[#027A48] bg-[#ECFDF3] border-[#12B76A]'}`}>{dnsMsg}</div>}
          <div className="text-[10px] font-mono text-[#4A4A68]">Aplicar altera /ip/dns (servers + allow-remote-requests) e, se preenchido, o dns-server da rede DHCP LAN. Ação auditada e reversível pelos botões acima.</div>
        </div>
      </div>

      <div className="text-xs text-[#4A4A68] border-2 border-[#1A1A2E] rounded-xl p-3.5 bg-[#FFF7E8] shadow-[2px_2px_0px_#1A1A2E]">
        <span className="font-bold text-[#1A1A2E]">Escopo real:</span> RouterOS 8728. Árvore montada de bridge/ARP/DHCP/Wi‑Fi; DNS do roteador/DHCP configurável para o AdGuard; ping/traceroute/DNS executados no roteador. Bloqueio usa address-list/firewall `NC_BLOCKED` com confirmação. Topologia física completa, banda por app e RSSI de clientes fora do rádio MikroTik exigem probes/SNMP/accounting adicionais. Logs do roteador aparecem na aba Logs (fonte MikroTik).
      </div>
    </>}
  </div>;
};
export default MikroTikTab;
