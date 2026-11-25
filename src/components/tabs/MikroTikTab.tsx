import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Router, Wifi, Shield, Network, Cable, Users, AlertTriangle, Activity, History, Server, Globe, ShieldCheck, ArrowRight, Lock } from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';
import type { MikrotikStatus } from '../../types';

const fmtBytes = (n: any) => { const v=Number(n||0); if(v>1e9) return (v/1e9).toFixed(2)+' GB'; if(v>1e6) return (v/1e6).toFixed(1)+' MB'; if(v>1e3) return (v/1e3).toFixed(1)+' KB'; return v+' B'; };
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
  const wanDevices = devices.filter(d => {
    const ip = ipOf(d);
    if (ip && ip === String(gw)) return false;
    if (ip.startsWith(lanPrefix)) return false;
    if (ip.startsWith(wanPrefix)) return true;
    return ifaceOf(d) === 'ether1';
  });
  const lanDevices = devices.filter(d => !wanDevices.includes(d) && ipOf(d) !== String(gw));
  const portOf = (d: any) => { const p = ifaceOf(d); return p === 'ether1' ? '' : p; };
  const portNames = Array.from(new Set([
    ...bridgePorts.filter(p => p.disabled !== 'true').map(p => p.interface).filter(Boolean),
    'wlan1',
  ]));
  const lanChildren: TopoNode[] = portNames.map(port => {
    const onPort = lanDevices.filter(d => portOf(d) === port);
    return { label: port, sub: `${onPort.length} dispositivo(s)`, kind: 'port', children: onPort.map(devNode) };
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
    ],
  };
}

function Tree({ node, depth = 0 }: { node: TopoNode; depth?: number }) {
  const Icon = node.kind === 'router' ? Router : node.kind === 'wan' ? Globe : node.kind === 'lan' ? Network : node.kind === 'port' ? Cable : node.kind === 'gateway' ? ArrowRight : Server;
  return (
    <div className={depth ? 'ml-3 border-l-2 border-[#1A1A2E]/20 pl-3' : ''}>
      <div className="flex items-center gap-1.5 py-0.5 flex-wrap">
        <span className={`inline-flex w-5 h-5 items-center justify-center rounded border border-[#1A1A2E] ${node.kind === 'router' ? 'bg-[#FF5A36] text-white' : node.kind === 'wan' ? 'bg-[#E0F4FE]' : node.kind === 'lan' ? 'bg-[#ECFDF3]' : 'bg-[#FFF7E8]'}`}>
          <Icon className="w-3 h-3" />
        </span>
        <span className="font-bold text-xs">{node.label}</span>
        {node.sub && <span className="text-[10px] font-mono text-[#4A4A68]">{node.sub}</span>}
        {node.online !== undefined && <span className={`text-[10px] font-bold ${node.online ? 'text-[#027A48]' : 'text-[#B42318]'}`}>{node.online ? 'online' : 'offline'}</span>}
      </div>
      {node.children?.map((c, i) => <Tree key={`${c.label}-${i}`} node={c} depth={depth + 1} />)}
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
  const [dnsSettings, setDnsSettings] = useState<any>(null);
  const [dnsServersInput, setDnsServersInput] = useState('192.168.100.23');
  const [dhcpDnsInput, setDhcpDnsInput] = useState('192.168.88.1');
  const [busyDns, setBusyDns] = useState(false);
  const [dnsMsg, setDnsMsg] = useState<string|null>(null);
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
        fetch('/api/mikrotik/snapshots?limit=60', { headers: getAuthHeaders() })
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
  useEffect(()=>{ refresh(); const id=setInterval(refresh,3000); return ()=>clearInterval(id); },[refresh]);
  useEffect(()=>{ loadDnsSettings(); },[loadDnsSettings]);

  const r=data?.resource||{}; const devices=data?.devices||[]; const events=data?.events||[]; const wifi=data?.wifi||[]; const leases=data?.leases||[]; const interfaces=data?.interfaces||[]; const firewall=data?.firewall||[]; const routes=data?.routes||[]; const nat=data?.nat||[];
  const memUsed=(Number(r['total-memory']||0)-Number(r['free-memory']||0)); const memPct=r['total-memory']?Math.round((memUsed/Number(r['total-memory']))*100):0;
  const online=devices.filter((d:any)=>Number(d.online)).length; const blocked=devices.filter((d:any)=>Number(d.blocked)).length;
  const topology = useMemo(()=>buildTopology(data),[data]);
  const routerDns = String(dnsSettings?.dns?.servers || data?.dns?.servers || '');
  const dhcpDns = (dnsSettings?.dhcpNetworks || []).map((n:any)=>n['dns-server']).filter(Boolean).join(', ');

  return <div className="space-y-4 font-sans text-[#1A1A2E]">
    <div className="p-4 sm:p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center"><Router className="w-5 h-5 text-[#FF5A36]"/></div><div><h2 className="text-lg sm:text-xl font-black font-title tracking-tight">Network Center / MikroTik</h2><p className="text-xs sm:text-sm text-[#4A4A68] font-medium mt-0.5">RouterOS 8728 • inventário/histórico local • auto 3s. {data?.identity?.name||''}</p></div></div>
      <button type="button" onClick={refresh} className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#E04522] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer"><RefreshCw className="w-4 h-4"/>Atualizar</button>
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

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Network className="w-4 h-4 text-[#FF5A36]"/>Árvore da rede</div>
        <div className="border-2 border-[#1A1A2E] rounded-xl bg-white p-3 shadow-[2px_2px_0px_#1A1A2E] overflow-auto">
          {topology ? <Tree node={topology} /> : <div className="text-xs text-[#4A4A68]">Sem dados de topologia.</div>}
          <div className="mt-2 text-[10px] font-mono text-[#4A4A68]">Montada a partir de bridge ports/hosts, ARP, DHCP e Wi‑Fi. Portas físicas sem dispositivos ativos aparecem vazias.</div>
        </div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Users className="w-4 h-4 text-[#FF5A36]"/>Inventário de dispositivos</div>
        <Table cols={['Nome/Host','IP','MAC','Tipo/Fabricante','Conexão','Sinal','Último visto','Status','Ações']} rows={devices.map((d:any)=>[
          <div><div className="font-bold">{d.nickname||d.hostname||'—'}</div><div className="text-[#4A4A68]">{d.hostname||''}</div></div>, d.ip||d.last_ip||'—', d.mac, <div><div>{d.device_type||'unknown'}</div><div className="text-[#4A4A68]">{d.vendor||''}</div></div>, `${d.connection||'—'}${d.interface?` (${d.interface})`:''}`, d.signal_dbm?`${d.signal_dbm} dBm`:'—', d.last_seen?new Date(d.last_seen).toLocaleString():'—', <span className={Number(d.online)?'text-[#027A48] font-bold':'text-[#B42318] font-bold'}>{Number(d.online)?'online':'offline'}</span>,
          <div className="flex gap-1 flex-wrap">{Number(d.blocked)?<button disabled={busyMac===d.mac+'unblock'} onClick={()=>act(d.mac,'unblock')} className="px-2 py-1 border border-[#1A1A2E] rounded bg-[#ECFDF3] text-[11px] font-bold">Desbloquear</button>:<button disabled={busyMac===d.mac+'block'} onClick={()=>act(d.mac,'block')} className="px-2 py-1 border border-[#1A1A2E] rounded bg-[#FEE4E2] text-[11px] font-bold">Bloquear</button>}<button disabled={busyMac===d.mac+'static'} onClick={()=>makeStatic(d.mac,d.ip||d.last_ip)} className="px-2 py-1 border border-[#1A1A2E] rounded bg-[#FFF7E8] text-[11px] font-bold">DHCP fixo</button></div>
        ])} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Wifi className="w-4 h-4 text-[#FF5A36]"/>Wi-Fi (radio MikroTik)</div>
          <Table cols={['IP','MAC','Sinal','TX/RX','Uptime']} rows={wifi.map((w:any)=>[w['last-ip']||'—', w['mac-address'], w['signal-strength']||'—', `${w['tx-rate']||'—'} / ${w['rx-rate']||'—'}`, w.uptime||'—'])} />
        </div>
        <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><History className="w-4 h-4 text-[#FF5A36]"/>Eventos recentes</div>
          <Table cols={['Quando','Evento','Dispositivo','Detalhe']} rows={events.slice(0,20).map((e:any)=>[e.ts?new Date(e.ts).toLocaleString():'—', e.event_type, `${e.hostname||''} ${e.ip||''} ${e.mac||''}`.trim(), e.details||'—'])} />
        </div>
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Activity className="w-4 h-4 text-[#FF5A36]"/>Histórico (snapshots locais)</div>
        <Table cols={['Quando','CPU','RAM','Wi-Fi','Leases','RX total','TX total']} rows={snapshots.slice().reverse().slice(0,20).map((s:any)=>{
          const res=s.resource||{}; const memTotal=Number(res['total-memory']||0); const memFree=Number(res['free-memory']||0); const memPct=memTotal?Math.round(((memTotal-memFree)/memTotal)*100):0;
          const ifs=s.interfaces||[]; const rx=ifs.reduce((a:number,i:any)=>a+Number(i['rx-byte']||0),0); const tx=ifs.reduce((a:number,i:any)=>a+Number(i['tx-byte']||0),0);
          return [s.ts?new Date(s.ts).toLocaleTimeString():'—', `${res['cpu-load']||0}%`, `${memPct}%`, String((s.wifi||[]).length), String((s.leases||[]).length), fmtBytes(rx), fmtBytes(tx)];
        })} />
      </div>

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Cable className="w-4 h-4 text-[#FF5A36]"/>Interfaces</div>
        <Table cols={['Nome','Tipo','Estado','MAC','RX','TX']} rows={interfaces.map((i:any)=>[i.name,i.type,<span className={i.running==='true'?'text-[#027A48] font-bold':'text-[#B42318] font-bold'}>{i.running==='true'?'up':'down'}</span>,i['mac-address']||'—',fmtBytes(i['rx-byte']),fmtBytes(i['tx-byte'])])} />
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
                          <td className="p-1.5 text-[#4A4A68]">{i + 1}</td>
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
