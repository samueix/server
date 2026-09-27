import React from 'react';
import { WifiOff, AlertTriangle, RefreshCw, Settings, ExternalLink, Terminal } from 'lucide-react';

interface OfflineBannerProps {
  serverIp: string;
  apiUrl: string;
  errorMessage?: string;
  onRetry: () => void;
  onOpenSettings: () => void;
  onOpenCodeViewer?: () => void;
  isInitialLoad?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  serverIp,
  apiUrl,
  errorMessage,
  onRetry,
  onOpenSettings,
  onOpenCodeViewer,
  isInitialLoad = false
}) => {
  if (isInitialLoad) {
    return (
      <div className="p-6 my-4 rounded bg-[#0f172a] border border-slate-800 text-center max-w-2xl mx-auto font-sans">
        <div className="w-10 h-10 rounded bg-[#090e17] border border-slate-800 text-rose-400 flex items-center justify-center mx-auto mb-3">
          <WifiOff className="w-5 h-5" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-800/50 mb-2 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          SERVIDOR OFFLINE
        </div>

        <h2 className="text-base font-semibold text-white">
          Não foi possível conectar ao servidor de telemetria
        </h2>

        <p className="text-xs text-slate-400 mt-1 font-mono">
          Endpoint do Proxy Nginx: <span className="text-slate-200 font-semibold">{apiUrl || '/api/system'}</span> (Servidor {serverIp})
        </p>

        {errorMessage && (
          <div className="p-2.5 my-3 rounded bg-[#090e17] border border-rose-900/40 text-rose-300 text-xs font-mono text-left">
            <span className="font-semibold text-rose-400 block mb-0.5">Diagnóstico:</span>
            {errorMessage}
          </div>
        )}

        <div className="text-xs text-slate-400 max-w-xl mx-auto mt-3 space-y-2.5 leading-relaxed text-left bg-[#090e17] p-4 rounded border border-slate-800">
          <div className="p-2.5 rounded bg-amber-950/30 border border-amber-800/40 text-amber-200 text-xs">
            <span className="font-semibold block mb-1 text-amber-400">
              Política de Segurança de Navegador (Private Network Access):
            </span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              O navegador bloqueia páginas externas em HTTPS de acessar endereços IP privados locais (<code>192.168.100.23</code>) dentro de iframes.
            </p>
          </div>

          <div className="space-y-1 text-xs text-slate-300">
            <p className="font-semibold text-white text-xs">Ações recomendadas:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
              <li>Abra o painel em uma nova aba fora do iframe do AI Studio.</li>
              <li>Certifique-se de que a API no servidor Ubuntu está em execução na porta <code>8000</code>.</li>
              <li>Confira no seu script FastAPI o cabeçalho <code>Access-Control-Allow-Private-Network: true</code>.</li>
            </ol>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir em Nova Aba</span>
          </a>

          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition border border-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Tentar Novamente</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition border border-slate-700 flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Configurar API</span>
          </button>

          {onOpenCodeViewer && (
            <button
              onClick={onOpenCodeViewer}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition border border-slate-700 flex items-center gap-1.5 font-mono"
            >
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
              <span>Scripts Python</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Notificação no topo caso a telemetria caia durante o uso
  return (
    <div className="p-3 rounded bg-[#0f172a] border border-rose-900/50 text-xs font-mono text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
        <div>
          <span className="font-semibold text-rose-400 font-sans">
            Comunicação interrompida com o servidor ({apiUrl})
          </span>
          <span className="text-[11px] text-slate-400 block">
            {errorMessage || 'A API não respondeu. Exibindo os últimos valores telemetrados.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
        <button
          onClick={onRetry}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3 text-blue-400" />
          <span>Reconectar</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition border border-slate-700"
        >
          Ajustar
        </button>
      </div>
    </div>
  );
};
