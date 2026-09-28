import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Lock, 
  User, 
  Key, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { verifyCredentialsWithServer } from '../services/authService';
import { SERVER_IPV4, SERVER_IPV6 } from '../config';

interface LoginScreenProps {
  onLoginSuccess: (user: string) => void;
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

  // Verifica a integridade da API FastAPI (/api/health)
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
        onLoginSuccess(result.user);
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
    <div className="min-h-screen bg-[#070c14] text-slate-100 flex flex-col justify-center items-center p-4 font-sans select-none relative">
      {/* Background ambient lighting */}
      <div className="fixed top-1/4 left-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-1/3 w-96 h-96 bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="w-full max-w-md">
        {/* Header / Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0b1324] border border-slate-800 text-blue-400 mb-3 shadow-lg">
            <Server className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>Server Panel</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/80 text-blue-300">
              NOC
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Ubuntu Server • Telemetria em Tempo Real
          </p>
        </div>

        {/* Card Principal */}
        <div className="rounded-2xl bg-[#0b1324] border border-slate-800 shadow-2xl p-6 sm:p-7 relative overflow-hidden">
          {/* Status da API */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80 text-[11px] font-mono">
            <span className="text-slate-400">Endpoint /api/health:</span>
            <div className="flex items-center gap-2">
              {apiHealth === 'checking' && (
                <span className="text-slate-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                  Verificando...
                </span>
              )}
              {apiHealth === 'online' && (
                <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  API Online
                </span>
              )}
              {apiHealth === 'offline' && (
                <span className="text-amber-400 flex items-center gap-1.5 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Aguardando Conexão
                </span>
              )}
            </div>
          </div>

          {/* Aviso de Logout efetuado */}
          {logoutNotice && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-2.5 text-xs font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{logoutNotice}</span>
            </div>
          )}

          {/* Erro de Autenticação */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-start gap-2.5 text-xs font-mono">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Seletor de Modo: Basic Auth vs API Key */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg mb-4 text-xs">
            <button
              type="button"
              onClick={() => {
                setAuthMode('basic');
                setErrorMsg(null);
              }}
              className={`py-1.5 rounded-md font-medium transition text-center ${
                authMode === 'basic'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Usuário & Senha
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('apikey');
                setErrorMsg(null);
              }}
              className={`py-1.5 rounded-md font-medium transition text-center ${
                authMode === 'apikey'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Chave de API / Token
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'basic' ? (
              <>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Usuário do Servidor
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Usuário"
                      required
                      autoComplete="username"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">
                      Senha
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full pl-9 pr-10 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-blue-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Chave de API (X-API-Key / Bearer)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Chave secreta configurada no .env"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  Validação direta no endpoint <code>/api/auth/verify</code>
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-md mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validando com o Servidor...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Acessar Painel do Servidor</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Dica de Infraestrutura */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-300 font-sans">
              Segurança do Ubuntu Server:
            </p>
            <p className="font-mono text-[10px] text-slate-400">
              Autenticação protegida via Basic Auth ou API Key validada pelo backend FastAPI. O painel comunica-se diretamente por rotas relativas (<code className="text-slate-300">/api/*</code>).
            </p>
          </div>
        </div>

        {/* Rodapé com Informações de Conectividade IPv4 e IPv6 */}
        <div className="mt-4 text-center text-[11px] font-mono text-slate-500 space-y-1">
          <div>IPv4: <span className="text-slate-400">{SERVER_IPV4}</span></div>
          <div className="truncate">IPv6: <span className="text-slate-400">{SERVER_IPV6}</span></div>
        </div>
      </div>
    </div>
  );
};
