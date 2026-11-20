import React, { useEffect, useMemo, useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Cpu,
  Layers,
  Network,
  Globe,
  Thermometer,
  Clock,
  Wifi,
  WifiOff,
  Info
} from 'lucide-react';
import { verifyCredentialsWithServer, getRememberPreference, setRememberPreference } from '../services/authService';

interface LoginScreenProps {
  onLoginSuccess: (user: string, role?: 'admin' | 'user') => void;
  logoutNotice?: string | null;
}

type Telemetry = {
  cpu_percent?: number;
  ram_percent?: number;
  temp_c?: number | null;
  uptime_human?: string;
  uptime_seconds?: number;
  ipv4?: string;
  ipv6?: string;
  primary_interface?: string;
  os?: string;
  os_version?: string;
};

function formatUptime(seconds?: number, _human?: string) {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, logoutNotice }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState<boolean>(() => getRememberPreference());
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(3500)
        });
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          setApiHealth('online');
          if (data.telemetry) setTelemetry(data.telemetry);
          setLastUpdated(new Date());
        } else {
          setApiHealth('offline');
        }
      } catch {
        if (isMounted) setApiHealth('offline');
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // atualiza o rótulo "há Xs" sem recarregar
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return '—';
    const diff = Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    if (diff < 2) return 'agora';
    if (diff < 60) return `há ${diff}s`;
    const m = Math.floor(diff / 60);
    return `há ${m}min`;
  }, [lastUpdated, tick]);

  const systemVersion = useMemo(() => {
    const os = (telemetry?.os || 'Ubuntu Server').trim();
    const ver = (telemetry?.os_version || '').trim();
    if (!ver) return os;
    if (os.includes(ver)) return os;
    return `${os} ${ver}`.trim();
  }, [telemetry]);

  const isExpiredNotice = useMemo(() => {
    const t = (logoutNotice || '').toLowerCase();
    return t.includes('expir') || t.includes('inativ') || t.includes('não autoriz') || t.includes('nao autoriz') || t.includes('alteradas');
  }, [logoutNotice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      setRememberPreference(rememberSession);
      const result = await verifyCredentialsWithServer({
        username: username.trim(),
        password,
        remember: rememberSession
      });

      if (result.success && result.user) {
        setSuccessMsg('Autenticado com sucesso. Entrando no painel...');
        setTimeout(() => onLoginSuccess(result.user as string, result.role), 450);
      } else {
        setErrorMsg(result.error || 'Credenciais inválidas. Verifique os dados digitados.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao validar credenciais com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const cpu = typeof telemetry?.cpu_percent === 'number' ? telemetry.cpu_percent : null;
  const ram = typeof telemetry?.ram_percent === 'number' ? telemetry.ram_percent : null;
  const temp = typeof telemetry?.temp_c === 'number' ? telemetry.temp_c : null;
  const uptime = formatUptime(telemetry?.uptime_seconds, telemetry?.uptime_human);
  const iface = telemetry?.primary_interface || '—';

  return (
    <div className="min-h-screen bg-[#FFF7E8] text-[#1A1A2E] flex flex-col justify-center items-center p-4 sm:p-6 font-sans relative overflow-hidden select-none">
      <div
        className="absolute inset-0 pointer-events-none opacity-20 -z-0"
        style={{ backgroundImage: 'radial-gradient(#1A1A2E 1.2px, transparent 1.2px)', backgroundSize: '24px 24px' }}
      />
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#FFC857] border-4 border-[#1A1A2E] -z-0 opacity-50 pointer-events-none shadow-[4px_4px_0px_#1A1A2E] login-float" />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-3xl bg-[#00A6FB] border-4 border-[#1A1A2E] rotate-12 -z-0 opacity-20 pointer-events-none shadow-[4px_4px_0px_#1A1A2E] login-float-slow" />
      <div className="absolute top-1/4 -left-10 w-24 h-24 rounded-xl bg-[#FF5A36] border-2 border-[#1A1A2E] -rotate-12 -z-0 opacity-20 pointer-events-none" />

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6 relative z-10 items-stretch login-enter">
        {/* Painel Esquerdo */}
        <section className="md:col-span-5 bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] rounded-xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden" aria-label="Status do servidor">
          <div className="absolute -right-5 -bottom-5 w-44 h-44 opacity-20 pointer-events-none select-none login-float-slow">
            <img src="/download.gif" alt="" className="w-full h-full object-contain" />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="inline-flex items-center gap-2 bg-white text-[#1A1A2E] px-3 py-1 rounded-full border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] font-bold text-xs">
                <span className={`w-2.5 h-2.5 rounded-full border border-[#1A1A2E] ${apiHealth === 'online' ? 'bg-[#12B76A]' : apiHealth === 'offline' ? 'bg-[#F04438]' : 'bg-[#FFC857]'}`} />
                <span>samuelserver</span>
              </div>
              <div className="text-[10px] font-mono font-bold bg-black/20 border border-white/30 px-2 py-1 rounded-md max-w-[55%] truncate text-right" title={systemVersion}>
                {systemVersion}
              </div>
            </div>

            <div className="flex items-start gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] flex items-center justify-center text-[#FF5A36] p-2.5 shrink-0">
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
                  <path fill="currentColor" d="M2.273 9.53a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.547Zm9.467-4.984a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546M7.4 13.108a5.54 5.54 0 0 1-3.775-2.88 3.27 3.27 0 0 1-1.944.24 7.4 7.4 0 0 0 5.328 4.465c.53.113 1.072.169 1.614.166a3.25 3.25 0 0 1-.666-1.9 6 6 0 0 1-.557-.091m3.828 2.285a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546m3.163-3.108a7.44 7.44 0 0 0 .373-8.726 3.3 3.3 0 0 1-1.278 1.498 5.57 5.57 0 0 1-.183 5.535 3.26 3.26 0 0 1 1.088 1.693M2.098 3.998a3.3 3.3 0 0 1 1.897.486 5.54 5.54 0 0 1 4.464-2.388c.037-.67.277-1.313.69-1.843a7.47 7.47 0 0 0-7.051 3.745"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold font-title leading-tight tracking-tight text-white">Ubuntu Server Panel</h1>
                <p className="text-xs text-white/90 mt-1">Acesso seguro • telemetria em tempo real</p>
              </div>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/20 border border-white/30">
                <div className="flex items-center gap-1.5 text-white/85">
                  {apiHealth === 'online' ? <Wifi className="w-3.5 h-3.5 text-[#12B76A]" /> : apiHealth === 'offline' ? <WifiOff className="w-3.5 h-3.5 text-[#FFC857]" /> : <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Conectividade API</span>
                </div>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${apiHealth === 'online' ? 'bg-[#12B76A] login-pulse' : apiHealth === 'offline' ? 'bg-[#FFC857]' : 'bg-white/70'}`} />
                  {apiHealth === 'online' ? 'Conectado' : apiHealth === 'offline' ? 'Indisponível' : 'Verificando'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-black/20 border border-white/30 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white/85"><Cpu className="w-3.5 h-3.5 text-[#FFC857]" /><span>CPU</span></div>
                  <span className="font-bold text-white tabular-nums">{cpu !== null ? `${cpu.toFixed(1)}%` : '--%'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/20 border border-white/30 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white/85"><Layers className="w-3.5 h-3.5 text-[#00A6FB]" /><span>RAM</span></div>
                  <span className="font-bold text-white tabular-nums">{ram !== null ? `${ram.toFixed(1)}%` : '--%'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/20 border border-white/30 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white/85"><Thermometer className="w-3.5 h-3.5 text-[#FFC857]" /><span>Temp</span></div>
                  <span className="font-bold text-white tabular-nums">{temp !== null ? `${temp.toFixed(1)}°C` : 'N/D'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/20 border border-white/30 flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 text-white/85 shrink-0"><Clock className="w-3.5 h-3.5 text-white" /><span>Uptime</span></div>
                  <span className="font-bold text-white tabular-nums text-[11px] sm:text-xs text-right leading-tight whitespace-nowrap">{uptime}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/20 border border-white/30 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-white/85"><Network className="w-3.5 h-3.5 text-[#12B76A]" /><span>Interface ativa</span></div>
                <span className="font-bold text-white">{iface}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/20 text-[11px] font-mono text-white/90 space-y-1.5">
            <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#FFC857] shrink-0" /><span className="truncate font-semibold">IPv4: {telemetry?.ipv4 || '—'}</span></div>
            <div className="text-[10px] text-white/80 truncate font-medium pl-5">IPv6: {telemetry?.ipv6 || '—'}</div>
            <div className="h-1" />
          </div>
        </section>

        {/* Painel Direito */}
        <section className="md:col-span-7 bg-white border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] rounded-xl p-5 sm:p-7 flex flex-col justify-center" aria-label="Autenticação">
          <div>
            <div className="pb-3 mb-5 border-b-2 border-[#1A1A2E]">
              <h2 className="text-lg sm:text-xl font-bold font-title text-[#1A1A2E]">Acesso ao Sistema</h2>
              <p className="text-xs text-[#4A4A68] mt-0.5">Autentique-se para gerenciar o servidor Ubuntu</p>
            </div>

            {logoutNotice && (
              <div className={`mb-4 p-3 rounded-lg border-2 flex items-start gap-2.5 text-xs font-medium login-fade ${isExpiredNotice ? 'bg-[#FEF0C7] border-[#F79009] text-[#92400E]' : 'bg-[#D1FADF] border-[#12B76A] text-[#065F46]'}`} role={isExpiredNotice ? 'alert' : 'status'} aria-live="polite">
                {isExpiredNotice ? <AlertCircle className="w-4 h-4 text-[#F79009] shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-[#12B76A] shrink-0 mt-0.5" />}
                <span>{logoutNotice}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-lg bg-[#D1FADF] border-2 border-[#12B76A] text-[#065F46] flex items-start gap-2.5 text-xs font-semibold login-fade" role="status" aria-live="polite">
                <CheckCircle2 className="w-4 h-4 text-[#12B76A] shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-[#B42318] flex items-start gap-2.5 text-xs font-semibold login-shake" role="alert" aria-live="assertive">
                <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="login-username" className="block text-xs font-bold text-[#1A1A2E]">Usuário</label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#4A4A68] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Digite seu usuário"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#4A4A68]/60 text-xs font-mono focus:outline-none focus:bg-white focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-xs font-bold text-[#1A1A2E]">Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#4A4A68] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLockOn(false)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    aria-describedby={capsLockOn ? 'capslock-hint' : undefined}
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#4A4A68]/60 text-xs font-mono focus:outline-none focus:bg-white focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A4A68] hover:text-[#1A1A2E] transition p-1 rounded"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {capsLockOn && (
                  <div id="capslock-hint" className="flex items-center gap-1.5 text-[11px] font-semibold text-[#92400E] bg-[#FEF0C7] border border-[#F79009] rounded-md px-2 py-1 login-fade" role="status">
                    <Info className="w-3.5 h-3.5 text-[#F79009]" />
                    <span>Caps Lock ativado</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-[#1A1A2E] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => { setRememberSession(e.target.checked); setRememberPreference(e.target.checked); }}
                    className="w-4 h-4 rounded border-2 border-[#1A1A2E] accent-[#FF5A36]"
                  />
                  <span>Lembrar sessão neste dispositivo</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-[#FF5A36] hover:bg-[#E04522] text-white font-bold text-xs border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-[#4A4A68] disabled:text-white disabled:cursor-wait mt-2 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Validando com o servidor...</span>
                  </>
                ) : successMsg ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Autenticado</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Entrar no Painel</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
      </div>

      <div className="fixed bottom-3 right-4 text-[10px] font-mono text-[#4A4A68] pointer-events-none select-none z-20">
        Última atualização: <span className="font-semibold text-[#1A1A2E]">{lastUpdatedLabel}</span>
      </div>
    </div>
  );
};
