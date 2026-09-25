import React from 'react';
import { 
  Terminal, 
  RotateCw, 
  Power, 
  RefreshCw, 
  ShieldAlert, 
  Lock,
  Play,
  Square,
  Activity
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  command: string;
  description: string;
  badge: 'Em breve';
  icon: React.ElementType;
}

const COMMAND_ACTIONS: CommandItem[] = [
  {
    id: 'reboot',
    title: 'Reiniciar servidor',
    command: 'sudo systemctl reboot',
    description: 'Envia sinal de reinicialização controlada para o kernel do Ubuntu Server.',
    badge: 'Em breve',
    icon: RotateCw
  },
  {
    id: 'poweroff',
    title: 'Desligar servidor',
    command: 'sudo systemctl poweroff',
    description: 'Desliga com segurança todos os processos ativos e corta a energia da máquina.',
    badge: 'Em breve',
    icon: Power
  },
  {
    id: 'restart-adguard',
    title: 'Reiniciar AdGuard Home',
    command: 'sudo systemctl restart AdGuardHome',
    description: 'Reinicia o serviço DNS do AdGuardHome sem afetar outros processos.',
    badge: 'Em breve',
    icon: RefreshCw
  },
  {
    id: 'restart-ssh',
    title: 'Reiniciar SSH',
    command: 'sudo systemctl restart ssh',
    description: 'Aplica alterações de configuração no daemon OpenSSH.',
    badge: 'Em breve',
    icon: RotateCw
  },
  {
    id: 'restart-server-panel',
    title: 'Reiniciar Server Panel',
    command: 'sudo systemctl restart server-panel',
    description: 'Reinicia o daemon FastAPI do servidor de telemetria.',
    badge: 'Em breve',
    icon: RefreshCw
  },
  {
    id: 'start-service',
    title: 'Iniciar serviço',
    command: 'sudo systemctl start <servico>',
    description: 'Inicia uma unidade de serviço do systemd no Ubuntu.',
    badge: 'Em breve',
    icon: Play
  },
  {
    id: 'stop-service',
    title: 'Parar serviço',
    command: 'sudo systemctl stop <servico>',
    description: 'Interrompe a execução de um serviço gerenciado pelo systemd.',
    badge: 'Em breve',
    icon: Square
  },
  {
    id: 'restart-generic-service',
    title: 'Reiniciar serviço',
    command: 'sudo systemctl restart <servico>',
    description: 'Reinicia um serviço específico no sistema operacional.',
    badge: 'Em breve',
    icon: RotateCw
  },
  {
    id: 'status-service',
    title: 'Ver status de serviço',
    command: 'sudo systemctl status <servico>',
    description: 'Consulta o estado detalhado, PID e logs recentes da unidade no journal.',
    badge: 'Em breve',
    icon: Activity
  }
];

export const CommandsTab: React.FC = () => {
  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/80 flex items-center justify-center text-blue-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white block">
              Comandos do Sistema
            </span>
            <span className="text-xs text-slate-400">
              Rotinas administrativas e atalhos operacionais (Somente Leitura)
            </span>
          </div>
        </div>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          Somente Leitura
        </span>
      </div>

      {/* Security Advisory Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-300">
        <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <span className="text-white font-semibold">Política de Segurança da Infraestrutura:</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            A execução arbitrária de comandos não é permitida pelo navegador. As ações abaixo servem como guia operacional de referência dos comandos oficiais a serem executados diretamente no terminal do servidor via SSH (<code className="text-slate-200 font-mono">ssh samuel@192.168.100.23</code>).
          </p>
        </div>
      </div>

      {/* Lista Técnica de Comandos */}
      <div className="space-y-3">
        {COMMAND_ACTIONS.map((cmd) => {
          const Icon = cmd.icon;

          return (
            <div 
              key={cmd.id}
              className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold text-white">
                      {cmd.title}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700">
                      {cmd.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {cmd.description}
                  </p>
                  <code className="inline-block mt-2 px-2.5 py-1 rounded-lg bg-[#070d18] border border-slate-800 text-[11px] font-mono text-blue-300">
                    $ {cmd.command}
                  </code>
                </div>
              </div>

              <div className="sm:shrink-0">
                <button
                  disabled
                  className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 text-xs font-mono cursor-not-allowed"
                  title="Funcionalidade em breve - execução remota desabilitada"
                >
                  Em breve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
