import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Terminal, 
  ExternalLink, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Globe, 
  ArrowUpRight, 
  ShieldCheck, 
  Ban, 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  Unlock, 
  Key 
} from 'lucide-react';
import { SERVER_IPV6, SSH_IPV4_COMMAND, SSH_IPV6_COMMAND } from '../config';
import { AdGuardStatsCard } from './AdGuardStatsCard';
import { useSecurityVault } from '../context/SecurityVaultContext';
import { getAdGuardStats, getAdGuardStatus, AdGuardStats, AdGuardStatus } from '../services/adguardService';

interface QuickAccessCardProps {
  serverIp?: string;
  showAdGuardStatsDefault?: boolean;
}

export const QuickAccessCard: React.FC<QuickAccessCardProps> = ({
  serverIp = '192.168.100.23',
  showAdGuardStatsDefault = true
}) => {
  const { isUnlocked, lock, requestUnlock } = useSecurityVault();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSshPass, setShowSshPass] = useState<boolean>(false);
  const [selectedSshVersion, setSelectedSshVersion] = useState<'ipv6' | 'ipv4'>('ipv6');
  const [showDetailedAdGuardStats, setShowDetailedAdGuardStats] = useState<boolean>(showAdGuardStatsDefault);

  const [adguardStats, setAdguardStats] = useState<AdGuardStats | null>(null);
  const [adguardStatus, setAdguardStatus] = useState<AdGuardStatus | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const [statsData, statusData] = await Promise.all([
          getAdGuardStats(),
          getAdGuardStatus()
        ]);
        if (isMounted) {
          setAdguardStats(statsData);
          setAdguardStatus(statusData);
        }
      } catch {
        if (isMounted) {
          setAdguardStats(null);
          setAdguardStatus(null);
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const isAdguardOnline = Boolean(adguardStatus?.online || adguardStats?.online);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const adguardUrl = '/adguard-api/';
  const ipv4SshCmd = `ssh samuel@${serverIp}`;
  const ipv6SshCmd = `ssh samuel@[${SERVER_IPV6}]`;
  const currentSshCmd = selectedSshVersion === 'ipv6' ? ipv6SshCmd : ipv4SshCmd;

  return (
    <div className="space-y-4 font-sans">
      {/* Security Vault Banner */}
      <div className={`p-3 px-4 rounded-2xl border backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 transition-all ${
        isUnlocked 
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
          : 'bg-blue-500/10 border-blue-500/20 text-blue-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
            isUnlocked ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
          }`}>
            {isUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </div>
          <div>
            <span className="text-xs font-semibold block">
              {isUnlocked ? 'Cofre de Segurança Desbloqueado' : 'Credenciais & Senhas Protegidas'}
            </span>
            <span className="text-[11px] opacity-75">
              {isUnlocked 
                ? 'Acesso de administrador ativo. As senhas estão visíveis.' 
                : 'As senhas de infraestrutura estão ocultas. Digite a senha mestre para revelar.'}
            </span>
          </div>
        </div>

        <div>
          {isUnlocked ? (
            <button
              onClick={lock}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition active:scale-95 flex items-center gap-1.5"
            >
              <Lock className="w-3 h-3" />
              <span>Bloquear Agora</span>
            </button>
          ) : (
            <button
              onClick={() => requestUnlock('Acesso às senhas do servidor')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition active:scale-95 flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Desbloquear Senhas</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: AdGuard Home */}
        <div className="relative overflow-hidden rounded-3xl p-5 apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl transition-all duration-300 hover:border-white/25 group flex flex-col justify-between">
          {/* Glow ambient highlight */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />

          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl flex items-center justify-center text-emerald-400 shadow-inner">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white tracking-tight">AdGuard Home</h3>
                    {isAdguardOnline && adguardStats ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {adguardStats.blocked_percentage}% Bloqueado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        AdGuard Home offline
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">
                    {isAdguardOnline 
                      ? 'Painel de bloqueio de anúncios e proteção DNS (/adguard-api/)' 
                      : 'Serviço offline ou aguardando proxy Nginx'}
                  </p>
                </div>
              </div>

              <a
                href={adguardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 hover:text-white transition-all duration-200 group-hover:scale-105"
                title="Abrir AdGuard Home em nova aba"
              >
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 mb-3 p-2.5 rounded-2xl bg-black/30 border border-white/10 font-mono text-center">
              <div>
                <span className="text-[10px] text-white/50 block font-sans uppercase">Bloqueio</span>
                <span className={`text-sm font-bold ${isAdguardOnline && adguardStats ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {isAdguardOnline && adguardStats ? `${adguardStats.blocked_percentage}%` : 'N/D'}
                </span>
              </div>
              <div className="border-x border-white/10">
                <span className="text-[10px] text-white/50 block font-sans uppercase">Consultas</span>
                <span className={`text-sm font-bold ${isAdguardOnline && adguardStats ? 'text-white' : 'text-slate-400'}`}>
                  {isAdguardOnline && adguardStats ? adguardStats.num_dns_queries.toLocaleString('pt-BR') : 'N/D'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-white/50 block font-sans uppercase">Barrados</span>
                <span className={`text-sm font-bold ${isAdguardOnline && adguardStats ? 'text-rose-400' : 'text-slate-400'}`}>
                  {isAdguardOnline && adguardStats ? adguardStats.num_blocked_filtering.toLocaleString('pt-BR') : 'N/D'}
                </span>
              </div>
            </div>

            {/* Credentials Grid */}
            <div className="space-y-2 font-mono text-xs">
              {/* URL */}
              <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Globe className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <span className="text-white/40 text-[11px] font-sans">URL:</span>
                  <a
                    href={adguardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline truncate"
                  >
                    {adguardUrl}
                  </a>
                </div>
                <button
                  onClick={() => copyToClipboard(adguardUrl, 'adguard-url')}
                  className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                  title="Copiar link"
                >
                  {copiedKey === 'adguard-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Autenticação Segura no Servidor */}
              <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-white/40 text-[11px] font-sans">Autenticação:</span>
                  <span className="text-emerald-300 font-semibold text-xs font-mono truncate">
                    Injetada pelo Nginx
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                  Nível Servidor
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowDetailedAdGuardStats(!showDetailedAdGuardStats)}
              className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span>{showDetailedAdGuardStats ? 'Recolher Estatísticas' : 'Ver Domínios & DNS'}</span>
              {showDetailedAdGuardStats ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <a
              href={adguardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 font-medium text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
            >
              <span>Abrir AdGuard</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Card 2: SSH do Ubuntu Server (Com suporte a IPv6 e IPv4) */}
        <div className="relative overflow-hidden rounded-3xl p-5 apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl transition-all duration-300 hover:border-white/25 group flex flex-col justify-between">
          {/* Glow ambient highlight */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />

          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl flex items-center justify-center text-blue-400 shadow-inner">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white tracking-tight">SSH do Ubuntu Server</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      Porta 22
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">
                    Terminal remoto seguro (OpenSSH) do samuelserver
                  </p>
                </div>
              </div>

              {/* Seletor IPv6 / IPv4 */}
              <div className="flex items-center p-1 rounded-xl bg-black/30 border border-white/10 text-[11px] font-mono">
                <button
                  onClick={() => setSelectedSshVersion('ipv6')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    selectedSshVersion === 'ipv6'
                      ? 'bg-blue-500/30 text-blue-200 border border-blue-400/30 shadow-sm'
                      : 'text-white/50 hover:text-white'
                  }`}
                  title="Acesso SSH via IPv6"
                >
                  IPv6
                </button>
                <button
                  onClick={() => setSelectedSshVersion('ipv4')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    selectedSshVersion === 'ipv4'
                      ? 'bg-blue-500/30 text-blue-200 border border-blue-400/30 shadow-sm'
                      : 'text-white/50 hover:text-white'
                  }`}
                  title="Acesso SSH via IPv4"
                >
                  IPv4
                </button>
              </div>
            </div>

            {/* Credentials Grid */}
            <div className="space-y-2 font-mono text-xs">
              {/* IPv6 SSH Command (Destaque Solicitado pelo Usuário) */}
              <div className={`p-2.5 rounded-2xl border transition-all ${
                selectedSshVersion === 'ipv6' 
                  ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20' 
                  : 'bg-black/20 border-white/10 opacity-80'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-sans font-semibold text-blue-300">
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 border border-blue-500/30">IPv6</span>
                    <span>ssh samuel@[2804:2d5c:a1:897e:5ecd:5bff:fe5a:7445]</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(ipv6SshCmd, 'ssh-ipv6')}
                    className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition shrink-0"
                    title="Copiar comando SSH IPv6"
                  >
                    {copiedKey === 'ssh-ipv6' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <code className="text-blue-200 text-[11px] block truncate select-all font-mono">
                  {ipv6SshCmd}
                </code>
              </div>

              {/* IPv4 SSH Command */}
              <div className={`p-2.5 rounded-2xl border transition-all ${
                selectedSshVersion === 'ipv4' 
                  ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20' 
                  : 'bg-black/20 border-white/10 opacity-80'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-sans font-semibold text-white/60">
                    <span className="px-1.5 py-0.2 rounded bg-white/10 border border-white/15">IPv4</span>
                    <span>ssh samuel@{serverIp}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(ipv4SshCmd, 'ssh-ipv4')}
                    className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition shrink-0"
                    title="Copiar comando SSH IPv4"
                  >
                    {copiedKey === 'ssh-ipv4' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <code className="text-slate-300 text-[11px] block truncate select-all font-mono">
                  {ipv4SshCmd}
                </code>
              </div>

              {/* User & Password Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                {/* User */}
                <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-[11px] font-sans">Login:</span>
                    <span className="text-white font-semibold">samuel</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard('samuel', 'ssh-user')}
                    className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                    title="Copiar login"
                  >
                    {copiedKey === 'ssh-user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Password */}
                <div className="p-2.5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-white/40 text-[11px] font-sans">Senha:</span>
                    <span className="text-white font-semibold font-mono text-xs">
                      {isUnlocked && showSshPass ? '12345678' : '••••••••••••'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        if (!isUnlocked) {
                          requestUnlock('Visualizar senha SSH do servidor', () => setShowSshPass(true));
                        } else {
                          setShowSshPass(!showSshPass);
                        }
                      }}
                      className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                      title={!isUnlocked ? 'Desbloquear com senha mestre' : (showSshPass ? 'Ocultar senha' : 'Ver senha')}
                    >
                      {!isUnlocked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                      ) : showSshPass ? (
                        <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (!isUnlocked) {
                          requestUnlock('Copiar senha SSH do servidor', () => copyToClipboard('12345678', 'ssh-pass'));
                        } else {
                          copyToClipboard('12345678', 'ssh-pass');
                        }
                      }}
                      className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                      title="Copiar senha"
                    >
                      {copiedKey === 'ssh-pass' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(currentSshCmd, 'ssh-btn-main')}
              className="w-full py-2 px-4 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-200 font-medium text-xs transition-all duration-200 flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
            >
              {copiedKey === 'ssh-btn-main' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">
                    {selectedSshVersion === 'ipv6' ? 'Comando SSH IPv6 Copiado!' : 'Comando SSH IPv4 Copiado!'}
                  </span>
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    Copiar Comando SSH ({selectedSshVersion.toUpperCase()})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Estatísticas Detalhadas do AdGuard Home (Expansível / Padrão Aberto) */}
      {showDetailedAdGuardStats && (
        <AdGuardStatsCard />
      )}
    </div>
  );
};
