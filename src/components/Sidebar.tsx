import React from 'react';
import { 
  LayoutDashboard, 
  Activity, 
  Cpu, 
  ShieldCheck, 
  Network, 
  Terminal, 
  Server,
  Shield,
  X
} from 'lucide-react';
import { NavigationTab, ConnectionStatus } from '../types';
import { ServerPanelLogo } from './ServerPanelLogo';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  connectionStatus: ConnectionStatus;
  hostname: string;
  serverIp: string;
  onOpenSettings: () => void;
}

interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Monitoramento', icon: Activity },
  { id: 'processes', label: 'Processos', icon: Cpu },
  { id: 'services', label: 'Serviços', icon: ShieldCheck },
  { id: 'network', label: 'Rede', icon: Network },
  { id: 'adguard', label: 'AdGuard Home', icon: Shield },
  { id: 'commands', label: 'Comandos', icon: Terminal, badge: 'Em breve' },
  { id: 'system', label: 'Sistema', icon: Server }
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  connectionStatus,
  serverIp
}) => {
  const isOnline = connectionStatus === 'connected';

  const content = (
    <div className="flex flex-col h-full justify-between select-none text-slate-200">
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Brand Header with Ubuntu Server Logo */}
        <div className="flex items-center justify-between px-2 pb-3 mb-1 border-b border-white/10">
          <ServerPanelLogo />
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10"
            title="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Label */}
        <div className="px-3 pt-1 text-[11px] font-medium tracking-wider text-white/40 uppercase">
          Módulos
        </div>

        {/* Navigation list */}
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium transition-all duration-200 rounded-2xl ${
                  isActive
                    ? 'apple-glass-active text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_4px_12px_rgba(0,0,0,0.3)] font-semibold'
                    : 'text-white/70 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'text-white scale-110' : 'text-white/60'}`} />
                  <span className="tracking-tight">{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/60">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Compact Apple-style Glass Status Footer */}
      <div className="mt-4 p-3 rounded-2xl bg-black/20 border border-white/10 text-[11px] font-mono text-white/70 space-y-1.5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-white/40 font-sans">API FastAPI:</span>
          <span className={`font-semibold flex items-center gap-1.5 ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-rose-400'}`} />
            {isOnline ? 'Conectado' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center justify-between text-white/50">
          <span className="font-sans">Host:</span>
          <span className="text-white/80 font-mono truncate max-w-[110px]">
            {serverIp || '192.168.100.23'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Floating Glass Dock / Panel) */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 h-[calc(100vh-5rem)] sticky top-20 z-20 my-4 ml-4 rounded-3xl apple-glass p-3 border border-white/15 backdrop-blur-2xl shadow-2xl">
        {content}
      </aside>

      {/* Mobile Drawer (Slide over) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
            onClick={onCloseMobile} 
          />
          <div className="relative flex flex-col w-64 max-w-[80vw] h-[92vh] m-auto rounded-3xl apple-glass p-4 border border-white/20 shadow-2xl z-10">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
