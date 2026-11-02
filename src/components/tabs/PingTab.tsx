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

      if (res.average_ms !== null) {
        setHistory(prev => {
          const point: PingHistoryItem = {
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            avgMs: res.average_ms!
          };
          const next = [...prev, point];
          return next.slice(-25); // Mantém os últimos 25 registros
        });
      }
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
      loadPing(false);
    }, 4000);

    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

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
            <span className="text-xs font-mono font-bold text-[#4A4A68] bg-[#FFF7E8] px-2 py-0.5 rounded border border-[#1A1A2E]">3 alvos</span>
          </div>

          <div className="divide-y-2 divide-[#1A1A2E]/10 my-auto">
            {/* Cloudflare */}
            {(() => {
              const cf = data?.targets?.find(t => t.id === 'cloudflare');
              const badge = getQualityBadge(cf?.quality || 'FALHA');
              return (
                <div className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#1A1A2E] font-sans">Cloudflare DNS</div>
                    <div className="text-[11px] font-mono font-semibold text-[#4A4A68]">1.1.1.1 (Anycast)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-[#1A1A2E] tabular-nums">
                      {cf?.pingMs !== null && cf?.pingMs !== undefined ? `${cf.pingMs} ms` : '--'}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold shadow-[1.5px_1.5px_0px_#1A1A2E] ${badge.bg}`}>
                      <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${badge.dot}`} />
                      {cf?.quality || 'AGUARDANDO'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Google */}
            {(() => {
              const gg = data?.targets?.find(t => t.id === 'google');
              const badge = getQualityBadge(gg?.quality || 'FALHA');
              return (
                <div className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#1A1A2E] font-sans">Google DNS</div>
                    <div className="text-[11px] font-mono font-semibold text-[#4A4A68]">8.8.8.8 (Anycast)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-[#1A1A2E] tabular-nums">
                      {gg?.pingMs !== null && gg?.pingMs !== undefined ? `${gg.pingMs} ms` : '--'}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold shadow-[1.5px_1.5px_0px_#1A1A2E] ${badge.bg}`}>
                      <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${badge.dot}`} />
                      {gg?.quality || 'AGUARDANDO'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Gateway */}
            {(() => {
              const gw = data?.targets?.find(t => t.id === 'gateway');
              const badge = getQualityBadge(gw?.quality || 'FALHA');
              return (
                <div className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#1A1A2E] font-sans">Roteador local (Gateway)</div>
                    <div className="text-[11px] font-mono font-semibold text-[#4A4A68]">192.168.100.1 (LAN)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-[#1A1A2E] tabular-nums">
                      {gw?.pingMs !== null && gw?.pingMs !== undefined ? `${gw.pingMs} ms` : '--'}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold shadow-[1.5px_1.5px_0px_#1A1A2E] ${badge.bg}`}>
                      <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${badge.dot}`} />
                      {gw?.quality || 'AGUARDANDO'}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Histórico Temporal de Ping */}
      {history.length > 1 && (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[#1A1A2E]/10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-[#00A6FB]" />
              </div>
              <h3 className="text-xs font-bold font-title text-[#1A1A2E]">Oscilação de latência em tempo real</h3>
            </div>
            <span className="text-xs font-mono font-bold text-[#4A4A68] bg-[#FFF7E8] px-3 py-1 rounded-lg border-2 border-[#1A1A2E]">
              Mín: <strong className="text-[#12B76A] tabular-nums">{Math.min(...history.map(h => h.avgMs))}ms</strong> | Máx: <strong className="text-[#FF5A36] ml-1 tabular-nums">{Math.max(...history.map(h => h.avgMs))}ms</strong>
            </span>
          </div>

          {/* Gráfico de barras simples */}
          <div className="h-28 flex items-end gap-1.5 pt-4 border-b-2 border-[#1A1A2E] bg-[#FFF7E8]/50 p-2 rounded-t-lg">
            {history.map((h, i) => {
              const maxH = Math.max(...history.map(x => x.avgMs), 50);
              const heightPct = Math.max(10, Math.min(100, (h.avgMs / maxH) * 100));
              const isLatest = i === history.length - 1;
              return (
                <div 
                  key={i} 
                  className="flex-1 flex flex-col items-center group relative h-full justify-end"
                >
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-sm border border-[#1A1A2E] transition-all duration-300 ${
                      isLatest ? 'bg-[#FF5A36]' : 'bg-[#00A6FB] group-hover:bg-[#FF5A36]'
                    }`}
                  />
                  {/* Tooltip on hover */}
                  <div className="absolute -top-8 hidden group-hover:flex px-2 py-1 rounded-md bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-[11px] font-mono font-bold text-[#1A1A2E] whitespace-nowrap z-10 pointer-events-none tabular-nums">
                    {h.avgMs}ms ({h.time})
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs font-mono font-medium text-[#4A4A68] pt-1">
            <span>{history[0]?.time}</span>
            <span className="font-bold text-[#1A1A2E]">Agora ({history[history.length - 1]?.time})</span>
          </div>
        </div>
      )}

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
