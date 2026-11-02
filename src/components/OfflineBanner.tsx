import React from 'react';
import { WifiOff, RefreshCw, Settings, ExternalLink, Terminal } from 'lucide-react';

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
      <div className="p-6 my-4 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] text-center max-w-2xl mx-auto font-sans text-[#1A1A2E]">
        <div className="w-12 h-12 rounded-xl bg-[#FEE4E2] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center mx-auto mb-3 text-[#F04438]">
          <WifiOff className="w-6 h-6" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#FEE4E2] text-[#F04438] border-2 border-[#F04438] mb-2 shadow-[1px_1px_0px_#F04438]">
          <span className="w-2 h-2 rounded-full bg-[#F04438]" />
          Servidor offline
        </div>

        <h2 className="text-xl font-bold font-title text-[#1A1A2E] mt-1">
          Não foi possível conectar ao servidor de telemetria
        </h2>

        <p className="text-xs text-[#4A4A68] mt-1 font-mono font-medium">
          Endpoint: <span className="text-[#1A1A2E] font-bold bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E]/20">{apiUrl || '/api/system'}</span> (Servidor {serverIp})
        </p>

        {errorMessage && (
          <div className="p-3 my-3 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-[#F04438] text-xs font-mono text-left font-semibold">
            <span className="font-bold text-[#F04438] block mb-0.5 font-sans">Diagnóstico:</span>
            {errorMessage}
          </div>
        )}

        <div className="text-xs text-[#1A1A2E] max-w-xl mx-auto mt-4 space-y-3 leading-relaxed text-left bg-[#FFF7E8] p-4 rounded-lg border-2 border-[#1A1A2E]">
          <div className="p-3 rounded-md bg-[#FEF0C7] border border-[#F79009] text-[#1A1A2E] text-xs">
            <span className="font-bold block mb-0.5 text-[#F79009] font-sans">
              Política de segurança do navegador (Private Network Access):
            </span>
            <p className="text-[#4A4A68] text-[11px] leading-relaxed">
              O navegador pode bloquear páginas externas em HTTPS de acessar endereços IP privados locais (<code>192.168.100.23</code>) dentro de iframes.
            </p>
          </div>

          <div className="space-y-1 text-xs text-[#1A1A2E]">
            <p className="font-bold text-xs font-sans">Ações recomendadas:</p>
            <ol className="list-decimal list-inside space-y-1 text-[#4A4A68] text-xs font-medium">
              <li>Abra o painel em uma nova aba fora do iframe.</li>
              <li>Certifique-se de que a API no servidor Ubuntu está em execução na porta <code>8000</code>.</li>
              <li>Confira no seu script FastAPI o cabeçalho <code>Access-Control-Allow-Private-Network: true</code>.</li>
            </ol>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-md bg-[#FF5A36] hover:bg-[#E04522] text-white font-bold text-xs transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir em nova aba</span>
          </a>

          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-md bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] text-xs font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#FF5A36]" />
            <span>Tentar novamente</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="px-4 py-2 rounded-md bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] text-xs font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <Settings className="w-3.5 h-3.5 text-[#00A6FB]" />
            <span>Configurar API</span>
          </button>

          {onOpenCodeViewer && (
            <button
              onClick={onOpenCodeViewer}
              className="px-4 py-2 rounded-md bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] text-xs font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 font-mono active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <Terminal className="w-3.5 h-3.5 text-[#1A1A2E]" />
              <span>Scripts Python</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Notificação no topo caso a telemetria caia durante o uso
  return (
    <div className="p-3.5 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-xs font-mono text-[#1A1A2E] shadow-[3px_3px_0px_#F04438] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#F04438] border border-[#1A1A2E] shrink-0" />
        <div>
          <span className="font-bold text-[#F04438] font-sans">
            Comunicação interrompida com o servidor ({apiUrl})
          </span>
          <span className="text-xs text-[#4A4A68] block font-medium">
            {errorMessage || 'A API não respondeu. Exibindo os últimos valores telemetrados.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-md bg-white hover:bg-[#FEE4E2] text-[#F04438] border-2 border-[#F04438] shadow-[2px_2px_0px_#F04438] text-xs font-bold transition flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <RefreshCw className="w-3 h-3 text-[#F04438]" />
          <span>Reconectar</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="px-3 py-1.5 rounded-md bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-xs font-bold transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          Ajustar
        </button>
      </div>
    </div>
  );
};
