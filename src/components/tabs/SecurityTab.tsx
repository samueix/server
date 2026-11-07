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
  Filter
} from 'lucide-react';
import { getAuthHeaders } from '../../services/authService';

interface AttackSource {
  ip: string;
  count: number;
  lastAttempt: string;
  targetUser: string;
  service: string;
  status: 'detectado' | 'bloqueado' | 'investigando';
  country?: string;
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
  lastChecked: string;
}

export const SecurityTab: React.FC = () => {
  const [data, setData] = useState<SecurityStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchSecurityStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/security/attack-monitor', {
        headers: {
          'Accept': 'application/json',
          ...getAuthHeaders()
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) {
        throw new Error(`Falha ao obter status de segurança: HTTP ${res.status}`);
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

  const isUnderAttack = data?.isUnderAttack || data?.threatLevel === 'SOB ATAQUE';
  const isModerate = data?.threatLevel === 'MODERADO';

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Banner Principal de Status de Ameaça */}
      <div className={`p-6 rounded-xl border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] transition-all ${
        isUnderAttack 
          ? 'bg-[#FEE4E2]' 
          : isModerate 
          ? 'bg-[#FEF0C7]' 
          : 'bg-[#D1FADF]'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] flex items-center justify-center shrink-0 ${
              isUnderAttack 
                ? 'bg-[#F04438] text-white' 
                : isModerate 
                ? 'bg-[#F79009] text-white' 
                : 'bg-[#12B76A] text-white'
            }`}>
              {isUnderAttack ? (
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              ) : isModerate ? (
                <AlertTriangle className="w-8 h-8" />
              ) : (
                <ShieldCheck className="w-8 h-8" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] ${
                  isUnderAttack 
                    ? 'bg-[#F04438] text-white' 
                    : isModerate 
                    ? 'bg-[#F79009] text-white' 
                    : 'bg-[#12B76A] text-white'
                }`}>
                  {isUnderAttack ? 'SOB ATAQUE DETECTADO' : isModerate ? 'NÍVEL DE ATENÇÃO' : 'SERVIDOR SEGURO (NORMAL)'}
                </span>
                <span className="text-xs font-mono text-[#4A4A68] font-bold">
                  Última auditoria: {data?.lastChecked || '--:--:--'}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black font-title text-[#1A1A2E] mt-1.5">
                {isUnderAttack
                  ? 'Múltiplas tentativas de invasão e força bruta em andamento!'
                  : isModerate
                  ? 'Atividades suspeitas ou varreduras de bots detectadas'
                  : 'Nenhum ataque de invasão ativo no momento'}
              </h1>
              <p className="text-xs text-[#4A4A68] font-medium mt-1 leading-relaxed max-w-2xl">
                Auditor contínuo de registros SSH (<code className="bg-white/60 px-1 py-0.5 rounded font-mono font-bold text-[#1A1A2E]">/var/log/auth.log</code>), varreduras de portas maliciosas no Nginx e tentativas de login no painel.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition ${
                autoRefresh ? 'bg-white text-[#1A1A2E]' : 'bg-[#FFF7E8] text-[#717188]'
              }`}
            >
              {autoRefresh ? 'Varredura Contínua: ON' : 'Pausada'}
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
        <div className="p-3 bg-[#FEE4E2] border-2 border-[#F04438] rounded-xl text-[#F04438] text-xs font-bold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchSecurityStatus(true)} className="underline text-xs">Tentar de novo</button>
        </div>
      )}

      {/* Métricas Rápidas de Segurança */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-xs font-bold text-[#717188] block">Tentativas de SSH (24h)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black font-title text-[#1A1A2E]">
              {data?.totalFailedAttempts24h ?? 0}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717188]">falhas</span>
          </div>
          <span className="text-[10px] text-[#717188] mt-1 block">Última hora: {data?.failedAttemptsLastHour ?? 0}</span>
        </div>

        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-xs font-bold text-[#717188] block">Scans de Bots Web (Nginx)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black font-title text-[#00A6FB]">
              {data?.totalScansDetected ?? 0}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717188]">probes</span>
          </div>
          <span className="text-[10px] text-[#717188] mt-1 block">Varreduras (.env, phpmyadmin, etc)</span>
        </div>

        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-xs font-bold text-[#717188] block">IPs Hostis Rastreados</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black font-title text-[#FF5A36]">
              {data?.attackSources?.length ?? 0}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717188]">origens</span>
          </div>
          <span className="text-[10px] text-[#717188] mt-1 block">Monitorados em tempo real</span>
        </div>

        <div className="p-4 bg-white border-2 border-[#1A1A2E] rounded-xl shadow-[3px_3px_0px_#1A1A2E]">
          <span className="text-xs font-bold text-[#717188] block">Status do Daemon SSH</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-[#12B76A] border border-[#1A1A2E]" />
            <span className="text-sm font-black font-title text-[#1A1A2E]">Porta 22 Protegida</span>
          </div>
          <span className="text-[10px] text-[#717188] mt-1 block">Fail2ban / Rate limit ativo</span>
        </div>
      </div>

      {/* Grid: Tabela de IPs Atacantes + Alvos Mais Buscados */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Tabela de IPs de Origem de Ataque */}
        <div className="lg:col-span-8 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
          <div className="p-4 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-[#FF5A36]" />
              <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                IPs Atacantes e Origem de Tentativas de Invasão
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#717188] font-bold">
              Total listado: {data?.attackSources?.length || 0}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8]/60 border-b-2 border-[#1A1A2E] font-black text-xs">
                <tr>
                  <th className="py-2.5 px-3.5">Endereço IP</th>
                  <th className="py-2.5 px-3.5">Tentativas</th>
                  <th className="py-2.5 px-3.5">Usuário Tentado</th>
                  <th className="py-2.5 px-3.5">Serviço Alvo</th>
                  <th className="py-2.5 px-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {(!data?.attackSources || data.attackSources.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#717188]">
                      <ShieldCheck className="w-8 h-8 text-[#12B76A] mx-auto mb-2" />
                      <span className="font-bold block text-sm text-[#1A1A2E]">Nenhum IP hostil detectado!</span>
                      <span className="text-xs">Seu servidor não está recebendo tentativas de invasão no momento.</span>
                    </td>
                  </tr>
                ) : (
                  data.attackSources.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#FFF7E8]/60 transition">
                      <td className="py-2.5 px-3.5 flex items-center gap-2 font-bold">
                        <Globe className="w-3.5 h-3.5 text-[#00A6FB] shrink-0" />
                        <span className="tabular-nums">{item.ip}</span>
                        <button
                          onClick={() => copyIp(item.ip)}
                          className="p-1 hover:bg-[#FFEECB] rounded border border-transparent hover:border-[#1A1A2E] transition"
                          title="Copiar IP"
                        >
                          {copiedIp === item.ip ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3 text-[#717188]" />}
                        </button>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[11px] border ${
                          item.count >= 10 
                            ? 'bg-[#FEE4E2] text-[#F04438] border-[#F04438]' 
                            : 'bg-[#FEF0C7] text-[#B54708] border-[#F79009]'
                        }`}>
                          {item.count} tentativas
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-bold text-[#FF5A36]">
                        {item.targetUser || 'root'}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#717188]">
                        {item.service}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <span className="text-[10px] font-mono font-bold bg-[#FEE4E2] text-[#F04438] px-2 py-0.5 rounded border border-[#F04438]">
                          {item.status.toUpperCase()}
                        </span>
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
                Usuários Mais Visados por Hackers
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
              <span>Como Bloquear IPs Manualmente:</span>
            </div>
            <p className="text-[#4A4A68] text-xs leading-relaxed">
              Para banir um IP agressor imediatamente no firewall UFW do Ubuntu, execute no Terminal:
            </p>
            <code className="block p-2 rounded bg-white border-2 border-[#1A1A2E] font-mono text-[11px] font-bold text-[#1A1A2E] select-all">
              sudo ufw insert 1 deny from [IP_ATACANTE]
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};
