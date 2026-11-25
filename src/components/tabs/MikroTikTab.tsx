import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Router, Wifi, Shield, Network, Cable, Users, AlertTriangle, Activity, History, Server } from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';
import type { MikrotikStatus } from '../../types';

const fmtBytes = (n: any) => { const v=Number(n||0); if(v>1e9) return (v/1e9).toFixed(2)+' GB'; if(v>1e6) return (v/1e6).toFixed(1)+' MB'; if(v>1e3) return (v/1e3).toFixed(1)+' KB'; return v+' B'; };
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E]"><div className="text-[11px] font-bold uppercase tracking-wider text-[#4A4A68]">{label}</div><div className="text-lg font-black font-title text-[#1A1A2E] mt-1 break-all">{value}</div>{sub && <div className="text-[11px] font-mono text-[#4A4A68] mt-1">{sub}</div>}</div>;
}
function Table({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return <div className="overflow-auto border-2 border-[#1A1A2E] rounded-xl bg-white shadow-[2px_2px_0px_#1A1A2E]"><table className="w-full text-xs font-mono"><thead className="bg-[#FFF7E8]"><tr>{cols.map(c=><th key={c} className="text-left p-2 border-b-2 border-[#1A1A2E]">{c}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i} className="border-b border-[#1A1A2E]/10 last:border-b-0">{r.map((c,j)=><td key={j} className="p-2 align-top">{c}</td>)}</tr>):<tr><td className="p-3 text-[#4A4A68]" colSpan={cols.length}>Sem dados</td></tr>}</tbody></table></div>;
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

  const r=data?.resource||{}; const devices=data?.devices||[]; const events=data?.events||[]; const wifi=data?.wifi||[]; const leases=data?.leases||[]; const interfaces=data?.interfaces||[]; const firewall=data?.firewall||[]; const routes=data?.routes||[]; const nat=data?.nat||[];
  const memUsed=(Number(r['total-memory']||0)-Number(r['free-memory']||0)); const memPct=r['total-memory']?Math.round((memUsed/Number(r['total-memory']))*100):0;
  const online=devices.filter((d:any)=>Number(d.online)).length; const blocked=devices.filter((d:any)=>Number(d.blocked)).length;

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

      <div className="space-y-2"><div className="font-black font-title flex items-center gap-2"><Activity className="w-4 h-4 text-[#FF5A36]"/>Diagnóstico (via MikroTik)</div>
        <div className="bg-white border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E] space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <input value={pingTarget} onChange={e=>setPingTarget(e.target.value)} className="px-3 py-2 border-2 border-[#1A1A2E] rounded-lg font-mono text-sm w-full sm:w-64" placeholder="IP ou host" />
            <button disabled={busyMac==='ping'} onClick={runPing} className="px-3 py-2 bg-[#1A1A2E] text-white rounded-lg font-bold text-sm border-2 border-[#1A1A2E]">Ping</button>
            <button disabled={busyMac==='trace'} onClick={runTrace} className="px-3 py-2 bg-[#FFF7E8] text-[#1A1A2E] rounded-lg font-bold text-sm border-2 border-[#1A1A2E]">Traceroute</button>
          </div>
          {pingResult && <div className="text-xs font-mono break-all"><b>Ping:</b> {pingResult.ok ? JSON.stringify(pingResult.results?.slice?.(0,4)||pingResult.results) : `erro: ${pingResult.error}`}</div>}
          {traceResult && <div className="text-xs font-mono break-all"><b>Trace:</b> {traceResult.ok ? JSON.stringify(traceResult.results?.slice?.(0,8)||traceResult.results) : `erro: ${traceResult.error}`}</div>}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <input value={dnsName} onChange={e=>setDnsName(e.target.value)} className="px-3 py-2 border-2 border-[#1A1A2E] rounded-lg font-mono text-sm w-full sm:w-64" placeholder="nome DNS" />
            <button disabled={busyMac==='dns'} onClick={runDns} className="px-3 py-2 bg-[#FFF7E8] text-[#1A1A2E] rounded-lg font-bold text-sm border-2 border-[#1A1A2E]">DNS</button>
          </div>
          {dnsResult && <div className="text-xs font-mono break-all"><b>DNS:</b> {dnsResult.ok ? JSON.stringify(dnsResult.results||dnsResult) : `erro: ${dnsResult.error}`}</div>}
        </div>
      </div>

      <div className="text-xs text-[#4A4A68] border-2 border-[#1A1A2E] rounded-xl p-3.5 bg-[#FFF7E8] shadow-[2px_2px_0px_#1A1A2E]">
        <span className="font-bold text-[#1A1A2E]">Escopo real:</span> RouterOS 8728 read-mostly. Bloqueio usa address-list/firewall `NC_BLOCKED` com confirmação; RSSI só no rádio MikroTik; topologia física completa/banda por app exigem sensores/probes adicionais.
      </div>
    </>}
  </div>;
};
export default MikroTikTab;
