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
  ChevronDown, 
  ChevronUp, 
  Lock, 
  Unlock, 
  Key 
} from 'lucide-react';
import { SERVER_IPV6 } from '../config';
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

  const adguardUrl = `http://${serverIp}:8081/#`;
  const ipv4SshCmd = `ssh samuel@${serverIp}`;
  const ipv6SshCmd = `ssh samuel@[${SERVER_IPV6}]`;
  const currentSshCmd = selectedSshVersion === 'ipv6' ? ipv6SshCmd : ipv4SshCmd;

  return (
    <div className="space-y-4 font-sans">
      {/* Security Vault Banner */}
      <div className={`p-3.5 px-4 rounded-xl border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-wrap items-center justify-between gap-3 transition-colors ${
        isUnlocked 
          ? 'bg-[#12B76A]/10 text-[#1A1A2E]' 
          : 'bg-white text-[#1A1A2E]'
      }`}>
        <div className="flex items-center gap-2.5">
          {isUnlocked ? <Unlock className="w-5 h-5 text-[#12B76A] shrink-0" /> : <Lock className="w-5 h-5 text-[#FF5A36] shrink-0" />}
          <div>
            <span className="text-xs font-bold font-title block">
              {isUnlocked ? 'Cofre de segurança desbloqueado' : 'Credenciais e senhas protegidas'}
            </span>
            <span className="text-xs text-[#4A4A68] font-mono">
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
              className="px-3.5 py-1.5 rounded-md bg-[#FFF7E8] hover:bg-[#FFC857] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-bold transition flex items-center gap-1.5 shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Bloquear agora</span>
            </button>
          ) : (
            <button
              onClick={() => requestUnlock('Acesso às senhas do servidor')}
              className="px-3.5 py-1.5 rounded-md bg-[#FF5A36] hover:bg-[#ff441b] text-white text-xs font-bold transition flex items-center gap-1.5 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Desbloquear senhas</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: AdGuard Home */}
        <div className="rounded-xl p-4 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-[#00A6FB] shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-title text-[#1A1A2E]">AdGuard Home</h3>
                    {isAdguardOnline && adguardStats ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#12B76A]/10 text-[#12B76A] border-2 border-[#12B76A]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A]" />
                        {adguardStats.blocked_percentage}% bloqueado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#F04438]/10 text-[#F04438] border-2 border-[#F04438]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F04438]" />
                        Offline
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4A4A68] mt-0.5">
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
                className="p-1.5 rounded-md bg-[#FFF7E8] hover:bg-[#FFC857] border-2 border-[#1A1A2E] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                title="Abrir AdGuard Home em nova aba"
              >
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 mb-3 p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] font-mono text-center shadow-[2px_2px_0px_#1A1A2E]">
              <div>
                <span className="text-[11px] text-[#4A4A68] block font-sans font-semibold">Bloqueio</span>
                <span className={`text-sm font-bold tabular-nums ${isAdguardOnline && adguardStats ? 'text-[#12B76A]' : 'text-[#4A4A68]'}`}>
                  {isAdguardOnline && adguardStats ? `${adguardStats.blocked_percentage}%` : 'N/D'}
                </span>
              </div>
              <div className="border-x-2 border-[#1A1A2E]">
                <span className="text-[11px] text-[#4A4A68] block font-sans font-semibold">Consultas</span>
                <span className={`text-sm font-bold tabular-nums ${isAdguardOnline && adguardStats ? 'text-[#1A1A2E]' : 'text-[#4A4A68]'}`}>
                  {isAdguardOnline && adguardStats ? adguardStats.num_dns_queries.toLocaleString('pt-BR') : 'N/D'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#4A4A68] block font-sans font-semibold">Barrados</span>
                <span className={`text-sm font-bold tabular-nums ${isAdguardOnline && adguardStats ? 'text-[#F04438]' : 'text-[#4A4A68]'}`}>
                  {isAdguardOnline && adguardStats ? adguardStats.num_blocked_filtering.toLocaleString('pt-BR') : 'N/D'}
                </span>
              </div>
            </div>

            {/* Credentials Grid */}
            <div className="space-y-2 font-mono text-xs">
              {/* URL */}
              <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-between gap-2 shadow-[2px_2px_0px_#1A1A2E]">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Globe className="w-4 h-4 text-[#00A6FB] shrink-0" />
                  <span className="text-[#4A4A68] font-sans font-semibold">URL:</span>
                  <a
                    href={adguardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00A6FB] font-bold hover:underline truncate"
                  >
                    {adguardUrl}
                  </a>
                </div>
                <button
                  onClick={() => copyToClipboard(adguardUrl, 'adguard-url')}
                  className="p-1.5 rounded-md bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] shadow-[1px_1px_0px_#1A1A2E] transition"
                  title="Copiar link"
                >
                  {copiedKey === 'adguard-url' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Autenticação Segura no Servidor */}
              <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-between gap-2 shadow-[2px_2px_0px_#1A1A2E]">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-[#4A4A68] font-sans font-semibold">Autenticação:</span>
                  <span className="text-[#12B76A] font-bold text-xs font-mono truncate">
                    Injetada pelo Nginx
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-[#1A1A2E] border-2 border-[#1A1A2E] font-bold">
                  Nível servidor
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowDetailedAdGuardStats(!showDetailedAdGuardStats)}
              className="py-2 px-3 rounded-lg bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <span>{showDetailedAdGuardStats ? 'Recolher estatísticas' : 'Ver domínios e DNS'}</span>
              {showDetailedAdGuardStats ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <a
              href={adguardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 rounded-lg bg-[#FF5A36] hover:bg-[#ff441b] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <span>Abrir AdGuard</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Card 2: SSH do Ubuntu Server */}
        <div className="rounded-xl p-4 bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-[#FF5A36] shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-title text-[#1A1A2E]">SSH do Ubuntu Server</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#FFF7E8] text-[#1A1A2E] border-2 border-[#1A1A2E]">
                      Porta 22
                    </span>
                  </div>
                  <p className="text-xs text-[#4A4A68] mt-0.5">
                    Terminal remoto seguro (OpenSSH) do samuelserver
                  </p>
                </div>
              </div>

              {/* Seletor IPv6 / IPv4 */}
              <div className="flex items-center p-1 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs font-mono shadow-[2px_2px_0px_#1A1A2E]">
                <button
                  onClick={() => setSelectedSshVersion('ipv6')}
                  className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                    selectedSshVersion === 'ipv6'
                      ? 'bg-[#FF5A36] text-white'
                      : 'text-[#1A1A2E] hover:bg-white'
                  }`}
                  title="Acesso SSH via IPv6"
                >
                  IPv6
                </button>
                <button
                  onClick={() => setSelectedSshVersion('ipv4')}
                  className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                    selectedSshVersion === 'ipv4'
                      ? 'bg-[#FF5A36] text-white'
                      : 'text-[#1A1A2E] hover:bg-white'
                  }`}
                  title="Acesso SSH via IPv4"
                >
                  IPv4
                </button>
              </div>
            </div>

            {/* Credentials Grid */}
            <div className="space-y-2 font-mono text-xs">
              {/* IPv6 SSH Command */}
              <div className={`p-2.5 rounded-lg border-2 transition-colors ${
                selectedSshVersion === 'ipv6' 
                  ? 'bg-[#FFF7E8] border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]' 
                  : 'bg-white border-[#1A1A2E]/30 opacity-60'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-sans text-[#4A4A68] font-semibold">
                    <span className="px-1.5 py-0.5 rounded bg-white text-[#1A1A2E] border border-[#1A1A2E] font-bold">IPv6</span>
                    <span>ssh samuel@[{SERVER_IPV6}]</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(ipv6SshCmd, 'ssh-ipv6')}
                    className="p-1 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] transition shrink-0"
                    title="Copiar comando SSH IPv6"
                  >
                    {copiedKey === 'ssh-ipv6' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <code className="text-[#1A1A2E] font-bold text-xs block truncate select-all">
                  {ipv6SshCmd}
                </code>
              </div>

              {/* IPv4 SSH Command */}
              <div className={`p-2.5 rounded-lg border-2 transition-colors ${
                selectedSshVersion === 'ipv4' 
                  ? 'bg-[#FFF7E8] border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]' 
                  : 'bg-white border-[#1A1A2E]/30 opacity-60'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-sans text-[#4A4A68] font-semibold">
                    <span className="px-1.5 py-0.5 rounded bg-white text-[#1A1A2E] border border-[#1A1A2E] font-bold">IPv4</span>
                    <span>ssh samuel@{serverIp}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(ipv4SshCmd, 'ssh-ipv4')}
                    className="p-1 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] transition shrink-0"
                    title="Copiar comando SSH IPv4"
                  >
                    {copiedKey === 'ssh-ipv4' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <code className="text-[#1A1A2E] font-bold text-xs block truncate select-all">
                  {ipv4SshCmd}
                </code>
              </div>

              {/* User & Password Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                {/* User */}
                <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-between gap-2 shadow-[2px_2px_0px_#1A1A2E]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#4A4A68] font-sans font-semibold">Login:</span>
                    <span className="text-[#1A1A2E] font-bold">samuel</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard('samuel', 'ssh-user')}
                    className="p-1 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] transition"
                    title="Copiar login"
                  >
                    {copiedKey === 'ssh-user' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Password */}
                <div className="p-2.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-between gap-2 shadow-[2px_2px_0px_#1A1A2E]">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[#4A4A68] font-sans font-semibold">Senha:</span>
                    <span className="text-[#1A1A2E] font-bold font-mono text-xs">
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
                      className="p-1 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] transition"
                      title={!isUnlocked ? 'Desbloquear com senha mestre' : (showSshPass ? 'Ocultar senha' : 'Ver senha')}
                    >
                      {!isUnlocked ? (
                        <Lock className="w-3.5 h-3.5 text-[#F79009]" />
                      ) : showSshPass ? (
                        <EyeOff className="w-3.5 h-3.5 text-[#12B76A]" />
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
                      className="p-1 rounded bg-white border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFC857] transition"
                      title="Copiar senha"
                    >
                      {copiedKey === 'ssh-pass' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(currentSshCmd, 'ssh-btn-main')}
              className="w-full py-2.5 px-3 rounded-lg bg-[#00A6FB] hover:bg-[#0092dd] border-2 border-[#1A1A2E] text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              {copiedKey === 'ssh-btn-main' ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span className="text-white font-bold">
                    {selectedSshVersion === 'ipv6' ? 'Comando SSH IPv6 copiado' : 'Comando SSH IPv4 copiado'}
                  </span>
                </>
              ) : (
                <>
                  <Terminal className="w-4 h-4 text-white" />
                  <span>
                    Copiar comando SSH ({selectedSshVersion.toUpperCase()})
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
