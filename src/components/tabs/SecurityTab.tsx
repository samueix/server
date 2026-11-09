import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  RefreshCw, 
  Terminal, 
  Globe, 
  User, 
  Server, 
  Ban, 
  CheckCircle2, 
  Radio, 
  Copy, 
  Check, 
  Activity,
  Filter,
  Flame,
  Lock,
  Layers,
  Clock,
  ShieldX
} from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';

interface AttackSource {
  ip: string;
  count: number;
  lastAttempt: string;
  targetUser: string;
  service: string;
  status: 'detectado' | 'bloqueado' | 'investigando';
  ipType?: 'local' | 'tailscale' | 'public' | 'docker' | 'loopback';
  ipTypeLabel?: string;
  country?: string;
  flag?: string;
}

interface SecurityStatusResponse {
  threatLevel: 'NORMAL' | 'MODERADO' | 'SOB ATAQUE';
  isUnderAttack: boolean;
  totalFailedAttempts24h: number;
  failedAttemptsLastHour: number;
  totalScansDetected: number;
  sshStatus: 'ativo' | 'alerta' | 'normal';
  nginxStatus: 'normal' | 'scans_detectados';
  attackSources: AttackSource[];
  targetAccounts: { user: string; attempts: number }[];
  recentIncidents: {
    timestamp: string;
    service: string;
    sourceIp: string;
    detail: string;
    severity: 'baixa' | 'media' | 'alta';
  }[];
  hourlyDistribution?: { hour: string; count: number }[];
  blockedIpsInUfw?: string[];
  lastChecked: string;
}

export const SecurityTab: React.FC = () => {
  const [data, setData] = useState<SecurityStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'all' | 'public' | 'local' | 'blocked'>('all');

  const fetchSecurityStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const candidates = ['/api/security/attack-monitor', '/api/security', '/api/security/status'];
      let res: Response | null = null;
      let lastStatus: number | null = null;

      for (const endpoint of candidates) {
        try {
          const attempt = await fetch(endpoint, {
            headers: {
              'Accept': 'application/json',
              ...getAuthHeaders()
            },
            signal: AbortSignal.timeout(4000)
          });
          if (attempt.ok) {
            res = attempt;
            break;
          }
          lastStatus = attempt.status;
        } catch {
          // Continua tentando os outros endpoints
        }
      }

      if (!res) {
        if (lastStatus === 404) {
          throw new Error('O monitor de segurança (/api/security/attack-monitor) requer que o serviço seja reiniciado no servidor. Execute: sudo systemctl restart server-panel');
        }
        throw new Error(lastStatus ? `Falha ao obter status de segurança: HTTP ${lastStatus}` : 'Servidor de segurança offline ou inacessível.');
      }

      const json: SecurityStatusResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao comunicar com o monitor de segurança.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSecurityStatus();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchSecurityStatus();
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const copyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const copyBlockCommand = (ip: string) => {
    const cmd = `sudo ufw insert 1 deny from ${ip} comment 'Bloqueado via Server Panel'`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(ip);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const isUnderAttack = data?.isUnderAttack || data?.threatLevel === 'SOB ATAQUE';
  const isModerate = data?.threatLevel === 'MODERADO';

  const filteredAttackers = (data?.attackSources || []).filter(item => {
    if (filterType === 'public') return item.ipType === 'public' || !item.ipType;
    if (filterType === 'local') return item.ipType === 'local' || item.ipType === 'tailscale';
    if (filterType === 'blocked') return item.status === 'bloqueado';
    return true;
  });

  const hourlyList = data?.hourlyDistribution || [];
  const maxHourlyCount = Math.max(1, ...hourlyList.map(h => h.count));

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Banner Principal de Status de Ameaça */}
      <div className={`p-6 rounded-xl border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] transition-all ${
        error
          ? 'bg-[#FFF7E8]'
          : isUnderAttack 
          ? 'bg-[#FEE4E2]' 
          : isModerate 
          ? 'bg-[#FEF0C7]' 
          : 'bg-[#D1FADF]'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] flex items-center justify-center shrink-0 ${
              error
                ? 'bg-[#FFF7E8] text-[#1A1A2E]'
                : isUnderAttack 
                ? 'bg-[#F04438] text-white animate-pulse' 
                : isModerate 
                ? 'bg-[#FFC857] text-[#1A1A2E]' 
                : 'bg-[#12B76A] text-white'
            }`}>
              {error ? (
                <AlertTriangle className="w-7 h-7 text-[#F04438]" />
              ) : isUnderAttack ? (
                <Flame className="w-8 h-8 text-white" />
              ) : isModerate ? (
                <ShieldAlert className="w-8 h-8 text-[#1A1A2E]" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-white" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-[#1A1A2E] bg-white">
                  Auditor de Segurança & Ataques
                </span>
                <span className="text-xs font-mono text-[#4A4A68]">
                  Última checagem: {data?.lastChecked || '--'}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black font-title text-[#1A1A2E] mt-1">
                {error
                  ? 'Monitor de Segurança em Diagnóstico'
                  : isUnderAttack
                  ? '⚠️ ALERTA: Host sob Ataque de Força Bruta!'
                  : isModerate
                  ? '⚠️ Nível Moderado de Varreduras Detectado'
                  : '🛡️ Sistema Seguro: Nenhuma Ameaça Crítica'}
              </h1>
              <p className="text-xs text-[#4A4A68] font-medium mt-1">
                Análise em tempo real de logs de autenticação do OpenSSH (Porta 22), varreduras Web Nginx (Porta 80/443) e regras do firewall UFW.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                autoRefresh ? 'bg-[#D1FADF] text-[#12B76A]' : 'bg-white text-[#717188]'
              }`}
              title="Alternar atualização automática a cada 6s"
            >
              <Radio className={`w-3.5 h-3.5 inline mr-1.5 ${autoRefresh ? 'animate-pulse text-[#12B76A]' : ''}`} />
              Auto {autoRefresh ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => fetchSecurityStatus(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#FF5A36] hover:bg-[#E04522] text-white text-xs font-mono font-bold rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Verificar Agora</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#FEE4E2] border-2 border-[#F04438] shadow-[3px_3px_0px_#F04438] rounded-xl text-[#1A1A2E] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2">
            <span className="font-mono font-bold text-[#F04438]">[Aviso]</span>
            <span className="font-medium">{error}</span>
          </div>
          <button 
            onClick={() => fetchSecurityStatus(true)} 
            className="px-2.5 py-1 bg-white border border-[#F04438] text-[#F04438] font-mono font-bold rounded text-xs hover:bg-[#FEE4E2] self-start sm:self-auto shrink-0"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* Métricas Rápidas de Segurança */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#717188]">Tentativas de SSH (24h)</span>
            <Lock className="w-4 h-4 text-[#FF5A36]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black font-title text-[#1A1A2E]">
              {data ? data.totalFailedAttempts24h : '--'}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717188]">{data ? 'falhas' : 'sem dados'}</span>
          </div>
          <span className="text-[11px] text-[#4A4A68] mt-1 font-mono font-bold block">
            Última hora: {data ? data.failedAttemptsLastHour : '--'} tentativas
          </span>
        </div>

        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#717188]">Scans de Bots Web</span>
            <Globe className="w-4 h-4 text-[#00A6FB]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black font-title text-[#00A6FB]">
              {data ? data.totalScansDetected : '--'}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717188]">{data ? 'varreduras' : 'sem dados'}</span>
          </div>
          <span className="text-[11px] text-[#4A4A68] mt-1 font-mono font-bold block">
            Nginx (.env, wp-login, etc)
          </span>
        </div>

        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#717188]">IPs Hostis Catalogados</span>
            <Ban className="w-4 h-4 text-[#FF5A36]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black font-title text-[#FF5A36]">
              {data?.attackSources ? data.attackSources.length : '--'}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717188]">{data ? 'origens' : 'sem dados'}</span>
          </div>
          <span className="text-[11px] text-[#4A4A68] mt-1 font-mono font-bold block">
            {data?.blockedIpsInUfw?.length || 0} bloqueados no UFW
          </span>
        </div>

        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#717188]">Status do Firewall UFW</span>
            <ShieldCheck className="w-4 h-4 text-[#12B76A]" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-[#12B76A] border border-[#1A1A2E]" />
            <span className="text-sm font-black font-title text-[#1A1A2E]">
              UFW & SSH Protegidos
            </span>
          </div>
          <span className="text-[11px] text-[#4A4A68] mt-1 font-mono font-bold block">
            Portas: 22, 80, 53, 5678, 8081
          </span>
        </div>
      </div>

      {/* Gráfico Upgraded de Distribuição Temporal dos Ataques (Últimas 12 Horas) */}
      <div className="p-5 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#1A1A2E] pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              Gráfico Temporal de Tentativas de Invasão & Ataques (Por Hora)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#717188] font-bold">
            Pico no período: {maxHourlyCount} tentativas/hora
          </span>
        </div>

        {/* Bar Chart Container */}
        <div className="pt-4 pb-2">
          <div className="h-44 w-full flex items-end gap-2 sm:gap-3 px-2 border-b-2 border-[#1A1A2E]">
            {hourlyList.map((slot, idx) => {
              const heightPercent = maxHourlyCount > 0 ? Math.max(8, Math.round((slot.count / maxHourlyCount) * 100)) : 8;
              const hasAttacks = slot.count > 0;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                  {/* Tooltip Hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-[#1A1A2E] text-white px-2 py-1 rounded text-[10px] font-mono font-bold pointer-events-none whitespace-nowrap z-20 shadow-md">
                    {slot.hour}: {slot.count} tentativa(s)
                  </div>

                  <span className="text-[10px] font-mono font-bold text-[#1A1A2E] mb-1">
                    {slot.count > 0 ? slot.count : ''}
                  </span>

                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-md border-2 border-[#1A1A2E] transition-all duration-300 ${
                      slot.count >= 10
                        ? 'bg-[#F04438]'
                        : slot.count >= 4
                        ? 'bg-[#FFC857]'
                        : hasAttacks
                        ? 'bg-[#00A6FB]'
                        : 'bg-[#FFF7E8]'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Horários no eixo X */}
          <div className="flex items-center justify-between gap-1 px-2 pt-2 text-[10px] font-mono font-bold text-[#717188]">
            {hourlyList.map((slot, idx) => (
              <span key={idx} className="flex-1 text-center truncate">
                {slot.hour}
              </span>
            ))}
          </div>
        </div>

        {/* Legenda do Gráfico */}
        <div className="flex items-center gap-4 text-[11px] font-mono font-bold text-[#717188] pt-2 flex-wrap border-t border-[#E2DFD8]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#FFF7E8] border border-[#1A1A2E]" />
            <span>0 falhas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#00A6FB] border border-[#1A1A2E]" />
            <span>1-3 tentativas (Baixo)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#FFC857] border border-[#1A1A2E]" />
            <span>4-9 tentativas (Moderado)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#F04438] border border-[#1A1A2E]" />
            <span>10+ tentativas (Ataque Força Bruta)</span>
          </div>
        </div>
      </div>

      {/* Grid: Tabela Detalhada de IPs Atacantes + Alvos Mais Buscados */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Tabela de IPs de Origem de Ataque */}
        <div className="lg:col-span-8 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
          <div className="p-4 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-[#FF5A36]" />
              <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                Detalhamento dos IPs Hostis & Tentativas de Invasão
              </h2>
            </div>

            {/* Filtros de IPs */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border ${
                  filterType === 'all'
                    ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                    : 'bg-white text-[#1A1A2E] border-[#1A1A2E] hover:bg-[#FFEECB]'
                }`}
              >
                Todos ({data?.attackSources?.length || 0})
              </button>
              <button
                onClick={() => setFilterType('public')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border ${
                  filterType === 'public'
                    ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                    : 'bg-white text-[#1A1A2E] border-[#1A1A2E] hover:bg-[#FFEECB]'
                }`}
              >
                Públicos
              </button>
              <button
                onClick={() => setFilterType('blocked')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border ${
                  filterType === 'blocked'
                    ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]'
                    : 'bg-white text-[#1A1A2E] border-[#1A1A2E] hover:bg-[#FFEECB]'
                }`}
              >
                Bloqueados
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8]/60 border-b-2 border-[#1A1A2E] font-black text-xs">
                <tr>
                  <th className="py-2.5 px-3.5">Endereço IP & Tipo</th>
                  <th className="py-2.5 px-3.5">Tentativas</th>
                  <th className="py-2.5 px-3.5">Usuário Alvo</th>
                  <th className="py-2.5 px-3.5">Serviço</th>
                  <th className="py-2.5 px-3.5 text-center">Status UFW</th>
                  <th className="py-2.5 px-3.5 text-right">Ação Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {filteredAttackers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#717188]">
                      <ShieldCheck className="w-8 h-8 text-[#12B76A] mx-auto mb-2" />
                      <span className="font-bold block text-sm text-[#1A1A2E]">Nenhum IP hostil correspondente ao filtro!</span>
                      <span className="text-xs">O firewall e o sistema de autenticação estão estáveis.</span>
                    </td>
                  </tr>
                ) : (
                  filteredAttackers.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#FFF7E8]/60 transition">
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2 font-bold">
                          <span>{item.flag || '🌐'}</span>
                          <span className="tabular-nums font-black text-[#1A1A2E]">{item.ip}</span>
                          <button
                            onClick={() => copyIp(item.ip)}
                            className="p-1 hover:bg-[#FFEECB] rounded border border-transparent hover:border-[#1A1A2E] transition"
                            title="Copiar IP"
                          >
                            {copiedIp === item.ip ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3 text-[#717188]" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-[#717188] font-medium block mt-0.5">
                          {item.ipTypeLabel || item.country || 'Acesso Externo'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[11px] border ${
                          item.count >= 10 
                            ? 'bg-[#FEE4E2] text-[#F04438] border-[#F04438]' 
                            : item.count >= 4
                            ? 'bg-[#FEF0C7] text-[#B54708] border-[#F79009]'
                            : 'bg-[#E0F2FE] text-[#00A6FB] border-[#00A6FB]'
                        }`}>
                          {item.count} tentativa(s)
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 font-bold text-[#FF5A36]">
                        {item.targetUser || 'root'}
                      </td>

                      <td className="py-2.5 px-3.5 text-[#717188]">
                        {item.service}
                      </td>

                      <td className="py-2.5 px-3.5 text-center">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          item.status === 'bloqueado'
                            ? 'bg-[#D1FADF] text-[#12B76A] border-[#12B76A]'
                            : 'bg-[#FEE4E2] text-[#F04438] border-[#F04438]'
                        }`}>
                          {item.status === 'bloqueado' ? 'BLOQUEADO' : 'ATIVO / DETECTADO'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-right">
                        <button
                          onClick={() => copyBlockCommand(item.ip)}
                          className="flex items-center gap-1 ml-auto px-2 py-1 bg-[#1A1A2E] hover:bg-[#FF5A36] text-white rounded text-[10px] font-mono font-bold border border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5"
                          title="Copiar comando UFW para banir este IP"
                        >
                          <ShieldX className="w-3 h-3" />
                          <span>{copiedCmd === item.ip ? 'Comando Copiado!' : 'Banir no UFW'}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna Lateral: Contas Mais Visadas & Recomendações */}
        <div className="lg:col-span-4 space-y-4">
          {/* Usuários Mais Atacados */}
          <div className="p-4 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-[#1A1A2E]">
              <User className="w-4 h-4 text-[#FF5A36]" />
              <h3 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                Usuários Alvo Mais Visados
              </h3>
            </div>

            <div className="space-y-2">
              {(!data?.targetAccounts || data.targetAccounts.length === 0) ? (
                <p className="text-xs text-[#717188] py-2 text-center">Nenhum ataque a usuários registrado.</p>
              ) : (
                data.targetAccounts.map((acc, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[#FFF7E8] border border-[#1A1A2E] text-xs font-mono">
                    <span className="font-bold text-[#1A1A2E]">{acc.user}</span>
                    <span className="text-[#F04438] font-black">{acc.attempts} tentativas</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dicas e Ações de Blindagem */}
          <div className="p-4 bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[#1A1A2E] font-bold">
              <ShieldCheck className="w-4 h-4 text-[#12B76A]" />
              <span>Como Banir IPs no Ubuntu:</span>
            </div>
            <p className="text-[#4A4A68] text-xs leading-relaxed">
              O botão <strong>"Banir no UFW"</strong> copia a regra exata para você colar na aba Terminal:
            </p>
            <code className="block p-2 rounded bg-white border-2 border-[#1A1A2E] font-mono text-[11px] font-bold text-[#1A1A2E] select-all">
              sudo ufw insert 1 deny from [IP_DO_ATACANTE]
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};
