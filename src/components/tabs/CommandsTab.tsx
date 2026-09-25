import React from 'react';
import { 
  Terminal, 
  RotateCw, 
  Power, 
  Trash2, 
  RefreshCw, 
  ShieldAlert, 
  Lock 
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  command: string;
  description: string;
  badge: 'Em breve' | 'Desativado por segurança';
  icon: React.ElementType;
}

const COMMAND_ACTIONS: CommandItem[] = [
  {
    id: 'reboot',
    title: 'Reiniciar servidor',
    command: 'sudo systemctl reboot',
    description: 'Envia sinal de reinicialização controlada para o kernel do Ubuntu Server.',
    badge: 'Desativado por segurança',
    icon: RotateCw
  },
  {
    id: 'poweroff',
    title: 'Desligar servidor',
    command: 'sudo systemctl poweroff',
    description: 'Desliga com segurança todos os processos ativos e corta a energia da máquina.',
    badge: 'Desativado por segurança',
    icon: Power
  },
  {
    id: 'cache',
    title: 'Limpar cache de memória',
    command: 'sync; echo 3 > /proc/sys/vm/drop_caches',
    description: 'Libera páginas de cache em disco e buffers de inodes não utilizados na memória RAM.',
    badge: 'Em breve',
    icon: Trash2
  },
  {
    id: 'restart-api',
    title: 'Reiniciar API do Server Panel',
    command: 'sudo systemctl restart server-panel',
    description: 'Reinicia o daemon FastAPI do servidor de telemetria.',
    badge: 'Em breve',
    icon: RefreshCw
  },
  {
    id: 'restart-adguard',
    title: 'Reiniciar AdGuardHome',
    command: 'sudo systemctl restart AdGuardHome',
    description: 'Reinicia o serviço DNS do AdGuardHome sem afetar outros processos.',
    badge: 'Em breve',
    icon: RefreshCw
  },
  {
    id: 'restart-ssh',
    title: 'Reiniciar serviço SSH',
    command: 'sudo systemctl restart ssh',
    description: 'Aplica alterações de configuração no daemon OpenSSH.',
    badge: 'Desativado por segurança',
    icon: RotateCw
  }
];

export const CommandsTab: React.FC = () => {
  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-amber-300 border border-white/15">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white block">
              Ações e Comandos do Sistema
            </span>
            <span className="text-xs text-white/60">
              Gerenciamento operacional e rotinas administrativas
            </span>
          </div>
        </div>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-black/20 border border-white/10 text-white/60 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-white/50" />
          Somente Leitura
        </span>
      </div>

      {/* Security Advisory Bar */}
      <div className="p-4 rounded-3xl apple-glass border border-amber-500/20 bg-amber-500/5 backdrop-blur-2xl flex items-start gap-3 text-xs text-white/80 font-mono">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-300 border border-amber-500/20 shrink-0 mt-0.5">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div>
          <span className="text-white font-semibold font-sans">Política de Segurança Operacional:</span>
          <p className="text-[11px] text-white/60 mt-0.5 font-sans leading-relaxed">
            A execução direta de comandos privilegiados (root/sudo) está temporariamente bloqueada pela API de telemetria para prevenir interrupções acidentais no host Ubuntu.
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
              className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-black/20 border border-white/10 text-white/70 shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-white">
                      {cmd.title}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      cmd.badge === 'Desativado por segurança' 
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' 
                        : 'bg-white/10 text-white/60 border-white/10'
                    }`}>
                      {cmd.badge}
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mt-1">
                    {cmd.description}
                  </p>
                  <code className="inline-block mt-2 px-2.5 py-1 rounded-xl bg-black/30 border border-white/10 text-[11px] font-mono text-white/70">
                    $ {cmd.command}
                  </code>
                </div>
              </div>

              <div className="sm:shrink-0">
                <button
                  disabled
                  className="w-full sm:w-auto px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white/30 text-xs font-mono cursor-not-allowed"
                  title="Operação bloqueada por política de segurança"
                >
                  Executar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
