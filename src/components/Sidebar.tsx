import React, { useState } from 'react';
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
  Bot,
  Monitor,
  Camera,
  Router,
  PanelLeftClose,
  PanelLeftOpen
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
  { id: 'opencode', label: 'Lux e Opencode', icon: Bot, adminOnly: true },
  { id: 'browser', label: 'Navegador Remoto', icon: Monitor, adminOnly: true },
  { id: 'cameras', label: 'Câmeras', icon: Camera },
  { id: 'mikrotik', label: 'MikroTik', icon: Router },
  { id: 'files', label: 'Arquivos', icon: Folder, adminOnly: true },
  { id: 'security', label: 'Segurança & Ataques', icon: ShieldAlert, adminOnly: true },
  { id: 'credentials', label: 'Credenciais & APIs', icon: Key, adminOnly: true },
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sp_sidebar_collapsed') === '1');
  const toggleCollapsed = () => setCollapsed(v => { const n=!v; localStorage.setItem('sp_sidebar_collapsed', n?'1':'0'); return n; });
  const isOnline = connectionStatus === 'connected';
  const isAdmin = currentUserRole === 'admin' || (currentUser || '').trim().toLowerCase() === 'admin';

  const visibleNavItems = NAV_ITEMS;

  const content = (mini = false) => (
    <div className="flex flex-col h-full min-h-0 justify-between select-none text-[#1A1A2E]">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 space-y-2 [scrollbar-width:thin] [scrollbar-color:#1A1A2E33_transparent]">
        <div className={`${mini ? 'hidden' : 'md:hidden'} flex items-center justify-between px-2 pb-3 mb-1 border-b-2 border-[#1A1A2E]`}>
          <span className="text-sm font-bold font-title text-[#1A1A2E]">Navegação</span>
          <button onClick={onCloseMobile} className="p-1.5 rounded-md border-2 border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFF7E8] shadow-[2px_2px_0px_#1A1A2E]" title="Fechar menu"><X className="w-4 h-4" /></button>
        </div>

        <div className={`px-3 pt-1 text-[11px] font-bold font-title uppercase tracking-wider text-[#4A4A68] transition-opacity duration-200 ${mini?'opacity-0 h-0 overflow-hidden p-0':'opacity-100'}`}>Módulos</div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => { onSelectTab(item.id); onCloseMobile(); }}
                title={item.label}
                className={`w-full flex items-center ${mini?'justify-center px-0':'justify-between px-3'} py-2 text-xs rounded-md border-2 transition-[background-color,border-color,color,box-shadow] duration-200 ${
                  isActive
                    ? 'bg-[#FF5A36] text-white font-bold border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]'
                    : 'bg-transparent text-[#1A1A2E] border-transparent font-medium hover:bg-[#FFF7E8] hover:border-[#1A1A2E] hover:shadow-[2px_2px_0px_#1A1A2E]'
                }`}
              >
                <div className={`flex items-center min-w-0 ${mini?'justify-center':'gap-2.5'}`}>
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#4A4A68]'}`} />
                  <span className={`whitespace-nowrap transition-[max-width,opacity] duration-200 ${mini?'max-w-0 opacity-0 overflow-hidden':'max-w-[140px] opacity-100'}`}>{item.label}</span>
                </div>
                {!mini && item.badge && (
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${isActive ? 'bg-white text-[#FF5A36] border-[#1A1A2E]' : 'bg-[#FFF7E8] text-[#1A1A2E] border-[#1A1A2E]'}`}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={`mt-2 shrink-0 transition-[opacity,max-height] duration-200 overflow-hidden ${mini ? 'opacity-0 max-h-0' : 'opacity-100 max-h-[320px]'}`}>
        <div className="p-2 rounded-lg bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-[#FFF7E8] border border-[#1A1A2E] flex items-center justify-center p-0.5 shrink-0"><img src="/download.gif" alt="Opencode" className="w-7 h-7 object-contain" /></div>
          <div className="leading-tight min-w-0"><span className="text-[11px] font-black font-title text-[#1A1A2E] block truncate">Opencode</span><span className="text-[10px] font-mono font-bold text-[#12B76A] block">Sistema Ativo</span></div>
        </div>
        <div className="mt-2 p-3 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs font-mono text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] space-y-2">
          <div className="flex items-center justify-between"><span className="text-[#4A4A68] font-sans font-medium">API do Servidor</span><span className={`flex items-center gap-1.5 font-bold ${isOnline ? 'text-[#12B76A]' : 'text-[#F04438]'}`}><span className={`w-2 h-2 rounded-full border border-[#1A1A2E] ${isOnline ? 'bg-[#12B76A]' : 'bg-[#F04438]'}`} /><span>{isOnline ? 'Conectado' : 'Offline'}</span></span></div>
          <div className="flex items-center justify-between"><span className="font-sans text-[#4A4A68] font-medium">Host</span><span className="text-[#1A1A2E] font-bold truncate max-w-[110px]">{serverIp || '192.168.100.23'}</span></div>
          <div className="flex items-center justify-between pt-1.5 border-t border-[#1A1A2E]/20"><span className="font-sans text-[#4A4A68] font-medium">Acesso</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border border-[#1A1A2E] ${isAdmin ? 'text-[#1A1A2E] bg-[#FFC857]' : 'text-[#1A1A2E] bg-[#00A6FB]/20'}`}>{isAdmin ? 'Admin' : 'Operador'}</span></div>
          {currentUser && onLogout && <div className="pt-2 mt-2 border-t border-[#1A1A2E]/20 flex items-center justify-between text-xs"><div className="flex items-center gap-1.5 overflow-hidden"><User className="w-3.5 h-3.5 text-[#FF5A36] shrink-0" /><span className="truncate text-[#1A1A2E] font-bold">{currentUser}</span></div><button onClick={onLogout} className="text-[#F04438] hover:underline font-sans font-semibold transition flex items-center gap-1 px-1 py-0.5 rounded" title="Deslogar do servidor"><LogOut className="w-3 h-3" /><span>Sair</span></button></div>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className={`hidden md:flex flex-col shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 z-20 bg-white border-r-2 border-[#1A1A2E] shadow-[2px_0px_0px_#1A1A2E]/5 transition-[width,padding] duration-300 ease-in-out overflow-hidden ${collapsed ? 'w-14 p-2' : 'w-56 p-3'}`}>
        <button onClick={toggleCollapsed} className={`mb-2 shrink-0 flex items-center ${collapsed?'justify-center':'justify-end'} w-full text-[#4A4A68] hover:text-[#1A1A2E] transition-colors`} title={collapsed?'Expandir menu':'Recolher menu'}>
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        {content(collapsed)}
      </aside>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-[#1A1A2E]/50 transition-opacity" onClick={onCloseMobile} />
          <div className="relative flex flex-col w-64 max-w-[85vw] h-full bg-white p-4 border-r-2 border-[#1A1A2E] shadow-[5px_0px_0px_#1A1A2E] z-10">
            {content(false)}
          </div>
        </div>
      )}
    </>
  );
};
