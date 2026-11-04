import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  User, 
  Key, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  ShieldCheck,
  Server,
  Zap,
  Globe
} from 'lucide-react';
import { verifyCredentialsWithServer } from '../services/authService';
import { SERVER_IPV4, SERVER_IPV6 } from '../config';

interface LoginScreenProps {
  onLoginSuccess: (user: string, role?: 'admin' | 'user') => void;
  logoutNotice?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ 
  onLoginSuccess,
  logoutNotice
}) => {
  const [authMode, setAuthMode] = useState<'basic' | 'apikey'>('basic');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health', {
          method: 'GET',
          signal: AbortSignal.timeout(3500)
        });
        if (isMounted) {
          if (res.ok) {
            setApiHealth('online');
          } else {
            setApiHealth('offline');
          }
        }
      } catch {
        if (isMounted) {
          setApiHealth('offline');
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await verifyCredentialsWithServer(
        authMode === 'basic'
          ? { username: username.trim(), password }
          : { apiKey: apiKey.trim() }
      );

      if (result.success && result.user) {
        onLoginSuccess(result.user, result.role);
      } else {
        setErrorMsg(result.error || 'Credenciais inválidas. Verifique os dados digitados.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao validar credenciais com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF7E8] text-[#1A1A2E] flex flex-col justify-center items-center p-4 sm:p-6 font-sans select-none relative overflow-hidden">
      {/* Decorative Geometric Neo-Brutalist Background Elements */}
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#FFC857] border-4 border-[#1A1A2E] -z-0 opacity-40 pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-3xl bg-[#00A6FB] border-4 border-[#1A1A2E] rotate-12 -z-0 opacity-20 pointer-events-none" />

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10 items-stretch">
        {/* Left Side: Bold Server Identity & Telemetry Highlights (Non-generic hero) */}
        <div className="md:col-span-5 bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 bg-white text-[#1A1A2E] px-3 py-1 rounded-full border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] font-bold text-xs mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#12B76A] border border-[#1A1A2E]" />
              <span>samuelserver</span>
            </div>

            <div className="w-14 h-14 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] flex items-center justify-center text-[#FF5A36] mb-4 p-2.5">
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                <path fill="currentColor" d="M2.273 9.53a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.547Zm9.467-4.984a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546M7.4 13.108a5.54 5.54 0 0 1-3.775-2.88 3.27 3.27 0 0 1-1.944.24 7.4 7.4 0 0 0 5.328 4.465c.53.113 1.072.169 1.614.166a3.25 3.25 0 0 1-.666-1.9 6 6 0 0 1-.557-.091m3.828 2.285a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546m3.163-3.108a7.44 7.44 0 0 0 .373-8.726 3.3 3.3 0 0 1-1.278 1.498 5.57 5.57 0 0 1-.183 5.535 3.26 3.26 0 0 1 1.088 1.693M2.098 3.998a3.3 3.3 0 0 1 1.897.486 5.54 5.54 0 0 1 4.464-2.388c.037-.67.277-1.313.69-1.843a7.47 7.47 0 0 0-7.051 3.745"/>
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold font-title leading-tight tracking-tight text-white mb-2">
              Ubuntu Server Panel
            </h1>
            <p className="text-xs text-white/90 font-medium leading-relaxed mb-6">
              Telemetria operacional em tempo real de hardware, serviços systemd, AdGuard Home e métricas de rede local.
            </p>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/30">
                <span className="text-white/80">API FastAPI</span>
                <span className="font-bold flex items-center gap-1.5 text-white">
                  {apiHealth === 'online' && <span className="w-2 h-2 rounded-full bg-[#12B76A]" />}
                  {apiHealth === 'offline' && <span className="w-2 h-2 rounded-full bg-[#FFC857]" />}
                  {apiHealth === 'checking' && <RefreshCw className="w-3 h-3 animate-spin text-white" />}
                  <span>{apiHealth === 'online' ? 'Conectada' : apiHealth === 'offline' ? 'Aguardando' : 'Verificando'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-white/20 text-[11px] font-mono text-white/80 space-y-1">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#FFC857]" />
              <span className="truncate">IPv4: {SERVER_IPV4}</span>
            </div>
            <div className="truncate text-[10px] text-white/70">IPv6: {SERVER_IPV6}</div>
          </div>
        </div>

        {/* Right Side: Bold Neo-Brutalist Authentication Form Card */}
        <div className="md:col-span-7 bg-white border-2 border-[#1A1A2E] shadow-[5px_5px_0px_#1A1A2E] rounded-xl p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b-2 border-[#1A1A2E]">
              <div>
                <h2 className="text-lg font-bold font-title text-[#1A1A2E]">Acesso ao Sistema</h2>
                <span className="text-xs text-[#4A4A68]">Autentique-se para gerenciar o servidor</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-[#FFC857] border-2 border-[#1A1A2E]">
                <span>Porta 8000</span>
              </div>
            </div>

            {/* Aviso de Logout */}
            {logoutNotice && (
              <div className="mb-4 p-3 rounded-lg bg-[#D1FADF] border-2 border-[#12B76A] text-[#1A1A2E] flex items-start gap-2.5 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-[#12B76A] shrink-0 mt-0.5" />
                <span>{logoutNotice}</span>
              </div>
            )}

            {/* Erro de Autenticação */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-[#F04438] flex items-start gap-2.5 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Seletor de Modo: Basic Auth vs API Key */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg mb-4 text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('basic');
                  setErrorMsg(null);
                }}
                className={`py-1.5 rounded-md font-bold transition-all text-center ${
                  authMode === 'basic'
                    ? 'bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]'
                    : 'text-[#1A1A2E] hover:bg-white/60'
                }`}
              >
                Usuário e senha
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('apikey');
                  setErrorMsg(null);
                }}
                className={`py-1.5 rounded-md font-bold transition-all text-center ${
                  authMode === 'apikey'
                    ? 'bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]'
                    : 'text-[#1A1A2E] hover:bg-white/60'
                }`}
              >
                Chave de API
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {authMode === 'basic' ? (
                <>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-[#1A1A2E]">
                      Usuário
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#4A4A68] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="admin ou user"
                        required
                        autoComplete="username"
                        className="w-full pl-9 pr-3 py-2 rounded-md bg-[#FFF7E8]/40 border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#4A4A68]/60 text-xs font-mono focus:outline-none focus:bg-white focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-[#1A1A2E]">
                      Senha
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#4A4A68] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        className="w-full pl-9 pr-10 py-2 rounded-md bg-[#FFF7E8]/40 border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#4A4A68]/60 text-xs font-mono focus:outline-none focus:bg-white focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A4A68] hover:text-[#1A1A2E] transition"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-[#1A1A2E]">
                    Chave de API
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-[#4A4A68] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Chave secreta configurada no .env"
                      required
                      className="w-full pl-9 pr-3 py-2 rounded-md bg-[#FFF7E8]/40 border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#4A4A68]/60 text-xs font-mono focus:outline-none focus:bg-white focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] transition-all"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-md bg-[#FF5A36] hover:bg-[#E04522] text-white font-bold text-xs border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Validando com o servidor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Entrar</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
