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
    <header className="sticky top-0 z-30 h-14 bg-white border-b-2 border-[#1A1A2E] flex items-center px-4 lg:px-6 select-none shadow-[0_2px_0px_#1A1A2E]/5">
      <div className="w-full flex items-center justify-between gap-4">
        {/* Lado esquerdo: [LOGO] Server Panel / samuelserver */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 rounded-md border-2 border-[#1A1A2E] bg-white text-[#1A1A2E] hover:bg-[#FFF7E8] shadow-[2px_2px_0px_#1A1A2E] transition-all duration-150 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Menu de navegação"
            aria-label="Abrir menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          <ServerPanelLogo />
        </div>

        {/* Lado direito: Status, IP, Uptime, Alertas, Ações */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* Active Alerts Indicator */}
          {activeAlertsCount > 0 && (
            <div className="flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-full bg-[#FEE4E2] border-2 border-[#F04438] text-[#F04438] font-bold shadow-[2px_2px_0px_#F04438]">
              <span className="w-2 h-2 rounded-full bg-[#F04438]" />
              <span>{activeAlertsCount} {activeAlertsCount === 1 ? 'alerta' : 'alertas'}</span>
            </div>
          )}

          {/* Metadata */}
          <div className="hidden sm:flex items-center gap-2.5 text-xs font-mono text-[#4A4A68]">
            <span className="text-[#1A1A2E] font-semibold bg-[#FFF7E8] px-2 py-0.5 rounded-md border border-[#1A1A2E]/30">{serverIp || '192.168.100.23'}</span>
            {uptimeFormatted && (
              <span className="pl-2 border-l-2 border-[#1A1A2E]/20">Uptime {uptimeFormatted}</span>
            )}
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-[#12B76A] font-bold font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-[#12B76A] border border-[#1A1A2E]" />
                <span className="hidden md:inline">Servidor online</span>
                <span className="md:hidden">Online</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#F04438] font-bold font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-[#F04438] border border-[#1A1A2E]" />
                <span className="hidden md:inline">Servidor offline</span>
                <span className="md:hidden">Offline</span>
              </span>
            )}

            {isStaleData && !isOnline && (
              <span className="text-[10px] text-[#F79009] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#FEF0C7] border border-[#F79009]">
                Cache
              </span>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-1.5 pl-1.5 border-l-2 border-[#1A1A2E]/20">
            <button
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="h-8 px-2.5 rounded-md bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-semibold shadow-[2px_2px_0px_#1A1A2E] transition-all duration-120 flex items-center gap-1.5 disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Atualizar telemetria"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF5A36] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Atualizar</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="h-8 px-2.5 rounded-md bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-semibold shadow-[2px_2px_0px_#1A1A2E] transition-all duration-120 flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Configurar servidor"
            >
              <Settings className="w-3.5 h-3.5 text-[#00A6FB]" />
              <span className="hidden md:inline">Configurar</span>
            </button>

            {/* Usuário e Botão Deslogar */}
            {currentUser && onLogout && (
              <div className="flex items-center gap-1.5 pl-1.5 border-l-2 border-[#1A1A2E]/20">
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono text-xs font-bold">
                  <User className="w-3 h-3 text-[#FF5A36]" />
                  <span>{currentUser}</span>
                </div>

                <button
                  onClick={onLogout}
                  className="h-8 px-2.5 rounded-md bg-white hover:bg-[#FEE4E2] text-[#F04438] border-2 border-[#1A1A2E] text-xs font-bold shadow-[2px_2px_0px_#1A1A2E] transition-all duration-120 flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                  title="Deslogar do servidor"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
