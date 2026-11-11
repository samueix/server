import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Wifi, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Server, 
  Globe, 
  ShieldCheck, 
  ArrowUpRight,
  Activity,
  Zap
} from 'lucide-react';
import { fetchPingTelemetry } from '../../services/api';
import { PingResponse, PingTarget } from '../../types';

interface PingHistoryItem {
  time: string;
  avgMs: number;
}

export const PingTab: React.FC = () => {
  const [data, setData] = useState<PingResponse | null>(null);
  const [history, setHistory] = useState<PingHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastCheck, setLastCheck] = useState<string>('--:--:--');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isBusyRef = useRef<boolean>(false);

  const loadPing = async (isManual = false) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    if (isManual) setRefreshing(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetchPingTelemetry(abortControllerRef.current.signal);
      setData(res);
      setErrorMsg(null);
      setLastCheck(new Date().toLocaleTimeString('pt-BR'));

      const sampleMs = res.average_ms !== null && res.average_ms !== undefined ? res.average_ms : 0;
      setHistory(prev => {
        const point: PingHistoryItem = {
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          avgMs: sampleMs
        };
        const next = [...prev, point];
        return next.slice(-25); // Mantém os últimos 25 registros
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Falha ao medir latência do servidor.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isBusyRef.current = false;
    }
  };

  useEffect(() => {
    loadPing(false);
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadPing(false);
      }
    }, 4000);

    const handleVisibility = () => {
      if (!document.hidden) {
        loadPing(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const pingStats = React.useMemo(() => {
    if (history.length === 0) return { min: 0, max: 0, avg: 0, packetLoss: 0, samples: 0 };
    const valid = history.map(h => h.avgMs).filter(v => v > 0);
    const min = valid.length > 0 ? Math.min(...valid) : 0;
    const max = valid.length > 0 ? Math.max(...valid) : 0;
    const avg = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
    const failedCount = history.filter(h => h.avgMs <= 0).length;
    const packetLoss = Math.round((failedCount / history.length) * 100);
    return { min, max, avg, packetLoss, samples: history.length };
  }, [history]);

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'EXCELENTE':
        return {
          bg: 'bg-[#D1FADF] border-2 border-[#1A1A2E] text-[#12B76A]',
          dot: 'bg-[#12B76A]'
        };
      case 'BOM':
        return {
          bg: 'bg-[#E0F2FE] border-2 border-[#1A1A2E] text-[#00A6FB]',
          dot: 'bg-[#00A6FB]'
        };
      case 'MEDIO':
        return {
          bg: 'bg-[#FEF0C7] border-2 border-[#1A1A2E] text-[#F79009]',
          dot: 'bg-[#F79009]'
        };
      default:
        return {
          bg: 'bg-[#FEE4E2] border-2 border-[#1A1A2E] text-[#F04438]',
          dot: 'bg-[#F04438]'
        };
    }
  };

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Header do Módulo de Ping */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-[#FF5A36]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold font-title text-[#1A1A2E]">Ping e latência externa</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#D1FADF] border-2 border-[#1A1A2E] text-[#12B76A] shadow-[1.5px_1.5px_0px_#1A1A2E]">
                <span className="w-2 h-2 rounded-full border border-[#1A1A2E] bg-[#12B76A]" />
                Socket nativo TCP/IP
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] mt-0.5 font-medium">
              Medição direta de tempo de ida e volta (RTT) do servidor Ubuntu para os principais backbones da internet
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E]">
            <span className="text-[10px] text-[#4A4A68] block font-mono font-bold uppercase tracking-wider">Última checagem</span>
            <span className="text-xs text-[#1A1A2E] font-mono font-bold tabular-nums">{lastCheck}</span>
          </div>
          <button
            onClick={() => loadPing(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5A36] hover:bg-[#E04522] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-md text-xs font-bold transition disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Executar novo teste de latência agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-white' : 'text-white'}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Notice Banner: Zero Comandos Extras */}
      <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] text-xs text-[#4A4A68] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#12B76A] shrink-0" />
          <span>
            <strong className="text-[#1A1A2E]">Conformidade do sistema:</strong> Esta telemetria utiliza conexão de socket assíncrona nativa da camada de rede. Nenhum comando de terminal, pacote extra ou permissão sudo é necessária.
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] px-2.5 py-1 rounded-full border border-[#1A1A2E] hidden md:inline">Atualização a cada 4s</span>
      </div>

      {/* Estatísticas das últimas amostras (E6) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#4A4A68] uppercase tracking-wider block">Média das Amostras</span>
          <div className="text-xl font-mono font-black text-[#1A1A2E] mt-0.5 tabular-nums">
            {pingStats.avg ? `${pingStats.avg} ms` : '--'}
          </div>
          <span className="text-[10px] text-[#717188] font-mono">{pingStats.samples} medições</span>
        </div>

        <div className="p-3.5 bg-[#ECFDF3] border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#12B76A] uppercase tracking-wider block">Menor Latência (Mín)</span>
          <div className="text-xl font-mono font-black text-[#12B76A] mt-0.5 tabular-nums">
            {pingStats.min ? `${pingStats.min} ms` : '--'}
          </div>
          <span className="text-[10px] text-[#12B76A]/80 font-mono">Melhor rota</span>
        </div>

        <div className="p-3.5 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#F79009] uppercase tracking-wider block">Maior Pico (Máx)</span>
          <div className="text-xl font-mono font-black text-[#F79009] mt-0.5 tabular-nums">
            {pingStats.max ? `${pingStats.max} ms` : '--'}
          </div>
          <span className="text-[10px] text-[#717188] font-mono">Pico registrado</span>
        </div>

        <div className="p-3.5 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-[10px] font-sans font-bold text-[#4A4A68] uppercase tracking-wider block">Perda de Pacotes</span>
          <div className={`text-xl font-mono font-black mt-0.5 tabular-nums ${pingStats.packetLoss === 0 ? 'text-[#12B76A]' : 'text-[#F04438]'}`}>
            {pingStats.packetLoss}%
          </div>
          <span className="text-[10px] text-[#717188] font-mono">Taxa de descarte</span>
        </div>
      </div>

      {/* Varied Hierarchy: Latência Principal à esquerda, alvos detalhados à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Latência Média Externa (Destaque à esquerda) */}
        <div className="lg:col-span-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs pb-2 border-b-2 border-[#1A1A2E]/10">
              <span className="font-title font-bold text-sm text-[#1A1A2E]">Latência média geral</span>
              <span className="text-xs font-mono font-bold text-[#4A4A68] bg-[#FFF7E8] px-2 py-0.5 rounded border border-[#1A1A2E]">Internet / Backbones</span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-[#FF5A36] font-mono tabular-nums tracking-tight">
                {data?.average_ms !== null && data?.average_ms !== undefined ? data.average_ms : '--'}
              </span>
              <span className="text-lg font-bold text-[#4A4A68] font-mono">ms</span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-2">
              Tempo de resposta médio ponderado entre os pontos monitorados da rede.
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t-2 border-[#1A1A2E]/10 flex items-center justify-between text-xs font-mono">
            <span className="text-[#4A4A68] font-sans font-bold">Condição do link:</span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] ${
              data?.average_ms && data.average_ms <= 30
                ? 'bg-[#D1FADF] text-[#12B76A]'
                : 'bg-[#FEF0C7] text-[#F79009]'
            }`}>
              <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${data?.average_ms && data.average_ms <= 30 ? 'bg-[#12B76A]' : 'bg-[#F79009]'}`} />
              <span>{data?.overall_status || 'ANALISANDO'}</span>
            </span>
          </div>
        </div>

        {/* Backbones monitorados (Linhas compactas à direita) */}
        <div className="lg:col-span-7 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10">
            <span className="text-sm font-bold font-title text-[#1A1A2E]">Pontos de verificação</span>
            <span className="text-xs font-mono font-bold text-[#4A4A68] bg-[#FFF7E8] px-2 py-0.5 rounded border border-[#1A1A2E] tabular-nums">
              {data?.targets?.length || 5} alvos
            </span>
          </div>

          <div className="divide-y-2 divide-[#1A1A2E]/10 my-auto">
            {(data?.targets && data.targets.length > 0 ? data.targets : [
              { id: 'cloudflare', name: 'Cloudflare DNS', host: '1.1.1.1', port: 53, type: 'external' as const, pingMs: null, status: 'OFFLINE' as const, quality: 'FALHA' },
              { id: 'google', name: 'Google Public DNS', host: '8.8.8.8', port: 53, type: 'external' as const, pingMs: null, status: 'OFFLINE' as const, quality: 'FALHA' },
              { id: 'quad9', name: 'Quad9 DNS Seguro', host: '9.9.9.9', port: 53, type: 'external' as const, pingMs: null, status: 'OFFLINE' as const, quality: 'FALHA' },
              { id: 'nicbr', name: 'NIC.br / PTT Brasil', host: '200.160.2.3', port: 53, type: 'external' as const, pingMs: null, status: 'OFFLINE' as const, quality: 'FALHA' },
              { id: 'gateway', name: 'Gateway Local (Roteador)', host: '192.168.100.1', port: 80, type: 'local' as const, pingMs: null, status: 'OFFLINE' as const, quality: 'FALHA' }
            ]).map((t) => {
              const badge = getQualityBadge(t.quality || 'FALHA');
              return (
                <div key={t.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#1A1A2E] font-sans flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {t.type === 'local' && (
                        <span className="text-[10px] bg-[#D1FADF] text-[#12B76A] px-1.5 py-0.2 rounded border border-[#1A1A2E] font-mono font-bold">LAN</span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono font-semibold text-[#4A4A68]">{t.host}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-[#1A1A2E] tabular-nums">
                      {t.pingMs !== null && t.pingMs !== undefined ? `${t.pingMs} ms` : (t.status === 'OFFLINE' ? 'Inacessível' : '--')}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold shadow-[1.5px_1.5px_0px_#1A1A2E] ${badge.bg}`}>
                      <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${badge.dot}`} />
                      {t.quality || (t.status === 'OFFLINE' ? 'FALHA' : 'AGUARDANDO')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Histórico Temporal de Ping com Gráfico SVG */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b-2 border-[#1A1A2E]/10 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-[#00A6FB]" />
            </div>
            <div>
              <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Oscilação de latência em tempo real</h3>
              <span className="text-[10px] text-[#4A4A68] font-mono">Últimas {history.length} amostras contínuas</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="bg-[#FFF7E8] px-2.5 py-1 rounded-lg border-2 border-[#1A1A2E]">
              Mín: <strong className="text-[#12B76A] tabular-nums">{pingStats.min} ms</strong>
            </span>
            <span className="bg-[#FFF7E8] px-2.5 py-1 rounded-lg border-2 border-[#1A1A2E]">
              Média: <strong className="text-[#00A6FB] tabular-nums">{pingStats.avg} ms</strong>
            </span>
            <span className="bg-[#FFF7E8] px-2.5 py-1 rounded-lg border-2 border-[#1A1A2E]">
              Máx: <strong className="text-[#FF5A36] tabular-nums">{pingStats.max} ms</strong>
            </span>
          </div>
        </div>

        {/* Gráfico SVG de Linha e Área */}
        <div className="relative w-full h-32 rounded-lg bg-[#FFF7E8]/60 border-2 border-[#1A1A2E] overflow-hidden p-2">
          {history.length < 2 ? (
            <div className="w-full h-full flex items-center justify-center text-xs font-mono text-[#4A4A68]">
              Coletando telemetria inicial... ({history.length}/2 amostras)
            </div>
          ) : (
            (() => {
              const svgW = 600;
              const svgH = 100;
              const padY = 12;
              const effH = svgH - padY * 2;
              const maxVal = Math.max(50, ...history.map(h => h.avgMs), 1);
              const minVal = 0;
              const range = maxVal - minVal;

              const points = history.map((h, i) => {
                const x = (i / (history.length - 1)) * svgW;
                const normalized = Math.max(0, Math.min(1, (h.avgMs - minVal) / range));
                const y = svgH - padY - normalized * effH;
                return { x, y, ms: h.avgMs, time: h.time };
              });

              const lineD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
              const areaD = `${lineD} L ${svgW} ${svgH} L 0 ${svgH} Z`;

              return (
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                  <line x1="0" y1={svgH * 0.25} x2={svgW} y2={svgH * 0.25} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" />
                  <line x1="0" y1={svgH * 0.50} x2={svgW} y2={svgH * 0.50} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" />
                  <line x1="0" y1={svgH * 0.75} x2={svgW} y2={svgH * 0.75} stroke="#1A1A2E" strokeOpacity="0.1" strokeDasharray="3 3" />

                  <path d={areaD} fill="#00A6FB" fillOpacity="0.18" />
                  <path d={lineD} fill="none" stroke="#00A6FB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                  {points.map((p, idx) => {
                    const isLatest = idx === points.length - 1;
                    const isFailed = p.ms <= 0;
                    return (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isLatest ? 4.5 : 3}
                          fill={isFailed ? '#F04438' : isLatest ? '#FF5A36' : '#00A6FB'}
                          stroke="#1A1A2E"
                          strokeWidth="1.5"
                        />
                      </g>
                    );
                  })}
                </svg>
              );
            })()
          )}
        </div>

        <div className="flex items-center justify-between text-xs font-mono font-medium text-[#4A4A68] pt-1">
          <span>{history[0]?.time || '--:--'}</span>
          <span className="font-bold text-[#1A1A2E]">Tempo real ({history[history.length - 1]?.time || '--:--'})</span>
        </div>
      </div>

      {/* Tabela Detalhada de Destinos de Ping */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]/10 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
              <Server className="w-3.5 h-3.5 text-[#FF5A36]" />
            </div>
            <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Destinos monitorados do servidor</h3>
          </div>
          <span className="text-xs font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] px-2.5 py-0.5 rounded-full border border-[#1A1A2E] tabular-nums">{data?.targets?.length || 0} destinos</span>
        </div>

        <div className="overflow-x-auto border-2 border-[#1A1A2E] rounded-lg">
          <table className="w-full text-left text-xs text-[#1A1A2E]">
            <thead className="bg-[#FFF7E8] text-[#1A1A2E] text-xs border-b-2 border-[#1A1A2E] font-sans font-bold">
              <tr>
                <th className="py-2.5 px-3">Serviço / alvo</th>
                <th className="py-2.5 px-3">Endereço IP</th>
                <th className="py-2.5 px-3">Porta</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Latência (RTT)</th>
                <th className="py-2.5 px-3 text-right">Qualidade</th>
              </tr>
            </thead>
            <tbody className="divide-y border-[#1A1A2E]/20 font-mono bg-white">
              {!data?.targets || data.targets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#4A4A68] font-sans font-semibold">
                    {loading ? 'Medindo latência dos destinos...' : 'Nenhum alvo de ping disponível.'}
                  </td>
                </tr>
              ) : (
                data.targets.map((t) => {
                  const badge = getQualityBadge(t.quality);
                  return (
                    <tr key={t.id} className="hover:bg-[#FFF7E8]/50 transition">
                      <td className="py-2.5 px-3 font-bold text-[#1A1A2E] font-sans">{t.name}</td>
                      <td className="py-2.5 px-3 text-[#4A4A68] font-semibold tabular-nums">{t.host}</td>
                      <td className="py-2.5 px-3 text-[#4A4A68] tabular-nums">{t.port}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border border-[#1A1A2E] ${t.type === 'local' ? 'bg-[#D1FADF] text-[#12B76A]' : 'bg-[#FFF7E8] text-[#1A1A2E]'}`}>
                          {t.type === 'local' ? 'Rede local' : 'Internet'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {t.status === 'ONLINE' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#12B76A] font-bold text-xs">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Online</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[#F04438] font-bold text-xs">
                            <AlertTriangle className="w-4 h-4" />
                            <span>Inacessível</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#1A1A2E] tabular-nums">
                        {t.pingMs !== null ? `${t.pingMs} ms` : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold shadow-[1px_1px_0px_#1A1A2E] ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full border border-[#1A1A2E] ${badge.dot}`} />
                          {t.quality}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
