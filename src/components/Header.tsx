import React from 'react';
import { 
  Menu, 
  RefreshCw, 
  Settings,
  LogOut,
  User
} from 'lucide-react';
import { ConnectionStatus, NavigationTab } from '../types';
import { ServerPanelLogo } from './ServerPanelLogo';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  isStaleData: boolean;
  hostname: string;
  serverIp: string;
  uptimeFormatted: string;
  isRefreshing: boolean;
  onManualRefresh: () => void;
  onOpenSettings: () => void;
  onToggleMobileMenu: () => void;
  currentTab: NavigationTab;
  errorMessage?: string;
  activeAlertsCount?: number;
  currentUser?: string | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connectionStatus,
  isStaleData,
  hostname,
  serverIp,
  uptimeFormatted,
  isRefreshing,
  onManualRefresh,
  onOpenSettings,
  onToggleMobileMenu,
  activeAlertsCount = 0,
  currentUser,
  onLogout
}) => {
  const isOnline = connectionStatus === 'connected';

  return (
    <header className="sticky top-0 z-30 h-16 bg-black/20 backdrop-blur-3xl border-b border-white/10 flex items-center px-4 lg:px-8 select-none transition-all">
      <div className="w-full flex items-center justify-between gap-4">
        {/* Lado esquerdo: [LOGO] Server Panel / samuelserver */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-2xl border border-white/15 bg-white/10 text-white hover:bg-white/20 backdrop-blur-xl transition"
            title="Menu de Navegação"
            aria-label="Abrir menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          <ServerPanelLogo />
        </div>

        {/* Lado direito: Status, IP, Uptime, Alertas, Ações */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* Active Alerts Pill Indicator */}
          {activeAlertsCount > 0 && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 backdrop-blur-xl animate-pulse shadow-sm">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="font-semibold">{activeAlertsCount} {activeAlertsCount === 1 ? 'ALERTA' : 'ALERTAS'}</span>
            </div>
          )}

          {/* Status Indicator Pill */}
          <div className="flex items-center gap-2 font-mono text-[11px] px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-xl shadow-sm">
            {isOnline ? (
              <span className="flex items-center gap-2 text-emerald-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                <span className="hidden sm:inline tracking-wider font-sans font-semibold">SERVIDOR ONLINE</span>
                <span className="sm:hidden font-sans font-semibold">ONLINE</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-rose-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                <span className="hidden sm:inline tracking-wider font-sans font-semibold">SERVIDOR OFFLINE</span>
                <span className="sm:hidden font-sans font-semibold">OFFLINE</span>
              </span>
            )}

            {isStaleData && !isOnline && (
              <span className="hidden xl:inline text-[10px] text-amber-300 bg-amber-500/20 border border-amber-400/30 px-1.5 py-0.5 rounded-full">
                CACHED
              </span>
            )}
          </div>

          {/* IP do Servidor */}
          <div className="hidden sm:flex items-center text-white/80 font-mono text-xs px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-xl">
            <span>{serverIp || '192.168.100.23'}</span>
          </div>

          {/* Uptime */}
          {uptimeFormatted && (
            <div className="hidden lg:flex items-center text-white/70 font-mono text-xs px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-xl">
              <span>Uptime: <strong className="text-white font-medium">{uptimeFormatted}</strong></span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center gap-2">
            <button
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="h-9 px-3.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white font-medium text-xs transition-all duration-200 flex items-center gap-2 backdrop-blur-xl disabled:opacity-50 shadow-sm"
              title="Atualizar telemetria"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Atualizar</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="h-9 px-3.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white font-medium text-xs transition-all duration-200 flex items-center gap-2 backdrop-blur-xl shadow-sm"
              title="Configurar endereço da API e chave de autenticação"
            >
              <Settings className="w-3.5 h-3.5 text-white/70" />
              <span className="hidden md:inline">Configurar API</span>
            </button>

            {/* Usuário e Botão Deslogar */}
            {currentUser && onLogout && (
              <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/15">
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono text-[11px]">
                  <User className="w-3 h-3" />
                  <span>{currentUser}</span>
                </div>

                <button
                  onClick={onLogout}
                  className="h-9 px-3 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/30 font-medium text-xs transition-all duration-200 flex items-center gap-1.5 backdrop-blur-xl shadow-sm"
                  title="Deslogar e encerrar sessão"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Deslogar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
