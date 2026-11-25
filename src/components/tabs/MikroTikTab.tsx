import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Router, Wifi, Network, Shield, Server, AlertTriangle, Cable, Users, Activity } from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';
import type { MikrotikStatus } from '../../types';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl p-3 shadow-[2px_2px_0px_#1A1A2E]">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#4A4A68]">{label}</div>
      <div className="text-lg font-black font-title text-[#1A1A2E] mt-1 break-all">{value}</div>
      {sub && <div className="text-[11px] font-mono text-[#4A4A68] mt-1">{sub}</div>}
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-auto border-2 border-[#1A1A2E] rounded-xl bg-white shadow-[2px_2px_0px_#1A1A2E]">
      <table className="w-full text-xs font-mono">
        <thead className="bg-[#FFF7E8] text-[#1A1A2E]"><tr>{cols.map(c => <th key={c} className="text-left p-2 border-b-2 border-[#1A1A2E]">{c}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((r,i)=><tr key={i} className="border-b border-[#1A1A2E]/10 last:border-b-0">{r.map((c,j)=><td key={j} className="p-2 align-top">{c}</td>)}</tr>) : <tr><td className="p-3 text-[#4A4A68]" colSpan={cols.length}>Sem dados</td></tr>}</tbody>
      </table>
    </div>
  );
}

export const MikroTikTab: React.FC = () => {
  const [data, setData] = useState<MikrotikStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/mikrotik/status', { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e: any) { setError(e?.message || 'Falha ao consultar MikroTik'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, [refresh]);

  const r = data?.resource || {};
  const leases = data?.leases || [];
  const wifi = data?.wifi || [];
  const interfaces = data?.interfaces || [];
  const firewall = data?.firewall || [];
  const nat = data?.nat || [];
  const routes = data?.routes || [];
  const memUsed = (Number(r['total-memory']||0)-Number(r['free-memory']||0));
  const memPct = r['total-memory'] ? Math.round((memUsed/Number(r['total-memory']))*100) : 0;

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      <div className="p-4 sm:p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center"><Router className="w-5 h-5 text-[#FF5A36]" /></div>
          <div>
            <h2 className="text-lg sm:text-xl font-black font-title tracking-tight">Network Center / MikroTik</h2>
            <p className="text-xs sm:text-sm text-[#4A4A68] font-medium mt-0.5">Monitoramento read-only via RouterOS API 8728. {data?.identity?.name ? `Roteador: ${data.identity.name}` : ''}</p>
          </div>
        </div>
        <button type="button" onClick={refresh} className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#E04522] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer"><RefreshCw className="w-4 h-4" />Atualizar</button>
      </div>

      {error && <div className="bg-[#FEE4E2] border-2 border-[#1A1A2E] text-[#B42318] rounded-xl p-4 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5"/><div><div className="font-bold">Erro MikroTik</div><div className="font-mono text-xs mt-1">{error}</div></div></div>}
      {loading && <div className="p-8 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] text-center font-semibold text-[#4A4A68]">Consultando MikroTik...</div>}

      {data?.ok && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Estado" value={data.ok ? 'Online' : 'Offline'} sub={`${data.host || ''}`} />
          <Stat label="Uptime" value={r.uptime || '—'} sub={r.version || ''} />
          <Stat label="CPU / RAM" value={`${r['cpu-load'] || 0}% / ${memPct}%`} sub={`${r['board-name'] || ''}`} />
          <Stat label="Clientes" value={leases.length} sub={`Wi-Fi regs: ${wifi.length}`} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="font-black font-title flex items-center gap-2"><Wifi className="w-4 h-4 text-[#FF5A36]"/>Clientes Wi-Fi</div>
            <Table cols={['Host/IP','MAC','Sinal','TX/RX','Uptime']} rows={wifi.map(w => [<div><div className="font-bold">{w['last-ip']||'—'}</div><div className="text-[#4A4A68]">{w.comment||''}</div></div>, w['mac-address'], w['signal-strength']||'—', `${w['tx-rate']||'—'} / ${w['rx-rate']||'—'}`, w.uptime||'—'])} />
          </div>
          <div className="space-y-2">
            <div className="font-black font-title flex items-center gap-2"><Users className="w-4 h-4 text-[#FF5A36]"/>DHCP Leases</div>
            <Table cols={['Host','IP','MAC','Status','Visto']} rows={leases.map(l => [l['host-name']||'—', l.address, l['mac-address'], <span className={l.status==='bound'?'text-[#027A48] font-bold':'text-[#B54708] font-bold'}>{l.status}</span>, l['last-seen']||'—'])} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-black font-title flex items-center gap-2"><Cable className="w-4 h-4 text-[#FF5A36]"/>Interfaces</div>
          <Table cols={['Nome','Tipo','Running','MAC','RX/TX bytes']} rows={interfaces.map(i => [i.name, i.type, <span className={i.running==='true'?'text-[#027A48] font-bold':'text-[#B42318] font-bold'}>{i.running==='true'?'up':'down'}</span>, i['mac-address']||'—', `${i['rx-byte']||0} / ${i['tx-byte']||0}`])} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="font-black font-title flex items-center gap-2"><Shield className="w-4 h-4 text-[#FF5A36]"/>Firewall (input/forward)</div>
            <Table cols={['Chain','Action','In','Comentário']} rows={firewall.map(f => [f.chain, f.action, f['in-interface']||'—', f.comment||'—'])} />
          </div>
          <div className="space-y-2">
            <div className="font-black font-title flex items-center gap-2"><Network className="w-4 h-4 text-[#FF5A36]"/>Rotas / NAT</div>
            <Table cols={['Tipo','Destino/Chain','Gateway/Out','Ativo']} rows={[...routes.map(r => ['route', r['dst-address'], r.gateway||r['immediate-gw']||'—', r.active==='true'?'sim':'não']), ...nat.map(n => ['nat', n.chain, n['out-interface']||n.action||'—', n.disabled==='true'?'não':'sim'])]} />
          </div>
        </div>
      </>}
    </div>
  );
};

export default MikroTikTab;
