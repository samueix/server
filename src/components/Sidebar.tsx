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
  BookOpen, 
  X, 
  User, 
  LogOut, 
  Radio,
  ScrollText,
  GitBranch,
  Folder,
  ShieldAlert,
  Key,
  Bot
} from 'lucide-react';
import { NavigationTab, ConnectionStatus } from '../types';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  connectionStatus: ConnectionStatus;
  hostname: string;
  serverIp: string;
  onOpenSettings: () => void;
  currentUser?: string | null;
  currentUserRole?: 'admin' | 'user';
  onLogout?: () => void;
}

interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Monitoramento', icon: Activity },
  { id: 'adguard', label: 'AdGuard Home', icon: Shield },
  { id: 'ping', label: 'Ping / Latência', icon: Radio },
  { id: 'antigravity', label: 'Lux & IA (Ubuntu)', icon: Bot, badge: 'Lux AI', adminOnly: true },
  { id: 'files', label: 'Arquivos', icon: Folder, adminOnly: true },
  { id: 'security', label: 'Segurança & Ataques', icon: ShieldAlert, badge: 'Auditor', adminOnly: true },
  { id: 'credentials', label: 'Credenciais & APIs', icon: Key, badge: 'Config', adminOnly: true },
  { id: 'processes', label: 'Processos', icon: Cpu, adminOnly: true },
  { id: 'services', label: 'Serviços', icon: ShieldCheck, adminOnly: true },
  { id: 'network', label: 'Rede & MAC', icon: Network, adminOnly: true },
  { id: 'logs', label: 'Logs do Sistema', icon: ScrollText, adminOnly: true },
  { id: 'n8n', label: 'n8n Workflows', icon: GitBranch, adminOnly: true },
  { id: 'commands', label: 'Terminal & Shell', icon: Terminal, adminOnly: true },
  { id: 'system', label: 'Sistema', icon: Server, adminOnly: true },
  { id: 'documentation', label: 'Documentação', icon: BookOpen, adminOnly: true }
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  connectionStatus,
  serverIp,
  currentUser,
  currentUserRole = 'admin',
  onLogout
}) => {
  const isOnline = connectionStatus === 'connected';
  const isAdmin = currentUserRole === 'admin' || (currentUser || '').trim().toLowerCase() === 'admin';

  // Exibe todos os módulos de gerenciamento na barra lateral
  const visibleNavItems = NAV_ITEMS;

  const content = (
    <div className="flex flex-col h-full justify-between select-none text-[#1A1A2E]">
      <div className="flex-1 overflow-y-auto space-y-2">
        {/* Mobile Header with close button */}
        <div className="md:hidden flex items-center justify-between px-2 pb-3 mb-1 border-b-2 border-[#1A1A2E]">
          <span className="text-sm font-bold font-title text-[#1A1A2E]">Navegação</span>
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-md border-2 border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFF7E8] shadow-[2px_2px_0px_#1A1A2E]"
            title="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Label */}
        <div className="px-3 pt-1 text-[11px] font-bold font-title uppercase tracking-wider text-[#4A4A68]">
          Módulos
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-all duration-120 rounded-md border-2 ${
                  isActive
                    ? 'bg-[#FF5A36] text-white font-bold border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] translate-x-[2px]'
                    : 'bg-transparent text-[#1A1A2E] border-transparent font-medium hover:bg-[#FFF7E8] hover:border-[#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#4A4A68]'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    isActive ? 'bg-white text-[#FF5A36] border-[#1A1A2E]' : 'bg-[#FFF7E8] text-[#1A1A2E] border-[#1A1A2E]'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Pinguim Lux do Ubuntu */}
      <div className="mt-2 p-2 rounded-lg bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border border-[#1A1A2E] flex items-center justify-center p-0.5 shrink-0">
          <img src="/download.gif" alt="Lux" className="w-7 h-7 object-contain" />
        </div>
        <div className="leading-tight min-w-0">
          <span className="text-[11px] font-black font-title text-[#1A1A2E] block truncate">Ubuntu Lux</span>
          <span className="text-[10px] font-mono font-bold text-[#12B76A] block">Sistema Ativo</span>
        </div>
      </div>

      {/* Flat Status Footer in sidebar */}
      <div className="mt-2 p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs font-mono text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[#4A4A68] font-sans font-medium">API do Servidor</span>
          <span className={`flex items-center gap-1.5 font-bold ${isOnline ? 'text-[#12B76A]' : 'text-[#F04438]'}`}>
            <span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${isOnline ? 'bg-[#12B76A]' : 'bg-[#F04438]'}`} />
            <span>{isOnline ? 'Conectado' : 'Offline'}</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-sans text-[#4A4A68] font-medium">Host</span>
          <span className="text-[#1A1A2E] font-bold truncate max-w-[110px]">
            {serverIp || '192.168.100.23'}
          </span>
        </div>

        {/* Perfil & Nível de Acesso */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[#1A1A2E]/20">
          <span className="font-sans text-[#4A4A68] font-medium">Acesso</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border border-[#1A1A2E] ${
            isAdmin ? 'text-[#1A1A2E] bg-[#FFC857]' : 'text-[#1A1A2E] bg-[#00A6FB]/20'
          }`}>
            {isAdmin ? 'Admin' : 'Operador'}
          </span>
        </div>

        {currentUser && onLogout && (
          <div className="pt-2 mt-2 border-t border-[#1A1A2E]/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <User className="w-3.5 h-3.5 text-[#FF5A36] shrink-0" />
              <span className="truncate text-[#1A1A2E] font-bold">{currentUser}</span>
            </div>
            <button
              onClick={onLogout}
              className="text-[#F04438] hover:underline font-sans font-semibold transition flex items-center gap-1 px-1 py-0.5 rounded"
              title="Deslogar do servidor"
            >
              <LogOut className="w-3 h-3" />
              <span>Sair</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar: Flush left rail with white background, 2px border, and solid flat items */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 z-20 bg-white border-r-2 border-[#1A1A2E] p-3 shadow-[2px_0px_0px_#1A1A2E]/5">
        {content}
      </aside>

      {/* Mobile Drawer (Slide over) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-[#1A1A2E]/50 transition-opacity" 
            onClick={onCloseMobile} 
          />
          <div className="relative flex flex-col w-64 max-w-[85vw] h-full bg-white p-4 border-r-2 border-[#1A1A2E] shadow-[5px_0px_0px_#1A1A2E] z-10">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
