import React, { useState } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  Search, 
  Server, 
  Shield, 
  Network, 
  HardDrive, 
  Cpu, 
  FileText, 
  Layers,
  Info
} from 'lucide-react';

interface PracticalCommand {
  command: string;
  desc: string;
}

interface CommandCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  commands: PracticalCommand[];
}

const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    id: 'sistema',
    name: 'Sistema',
    icon: Server,
    commands: [
      { command: 'sudo apt update', desc: 'Atualiza o índice de pacotes disponíveis dos repositórios do Ubuntu.' },
      { command: 'sudo apt upgrade -y', desc: 'Instala as versões mais recentes de todos os pacotes instalados com confirmação automática.' },
      { command: 'sudo reboot', desc: 'Reinicia o Ubuntu Server de forma segura.' },
      { command: 'uptime', desc: 'Exibe o tempo que o servidor está ligado, usuários conectados e a média de carga (load average).' },
      { command: 'hostnamectl', desc: 'Exibe informações do sistema, hostname, arquitetura e versão do kernel.' },
      { command: 'uname -a', desc: 'Imprime todas as informações detalhadas do kernel Linux em execução.' }
    ]
  },
  {
    id: 'servidor',
    name: 'Servidor',
    icon: Terminal,
    commands: [
      { command: 'sudo systemctl status server-panel', desc: 'Verifica o status atual do serviço systemd do Server Panel.' },
      { command: 'sudo systemctl restart server-panel', desc: 'Reinicia o serviço daemon do Server Panel para aplicar alterações.' },
      { command: 'sudo journalctl -u server-panel -n 100 --no-pager', desc: 'Visualiza as últimas 100 linhas de logs do Server Panel no terminal.' }
    ]
  },
  {
    id: 'adguard',
    name: 'AdGuard Home',
    icon: Shield,
    commands: [
      { command: 'sudo systemctl status AdGuardHome', desc: 'Verifica se o daemon do AdGuard Home está ativo e respondendo.' },
      { command: 'sudo systemctl restart AdGuardHome', desc: 'Reinicia o serviço do AdGuard Home liberando portas e recarregando listas.' },
      { command: 'sudo journalctl -u AdGuardHome -n 100 --no-pager', desc: 'Exibe os últimos 100 logs de inicialização e requisições do AdGuard Home.' }
    ]
  },
  {
    id: 'ssh',
    name: 'SSH',
    icon: Terminal,
    commands: [
      { command: 'sudo systemctl status ssh', desc: 'Verifica se o servidor OpenSSH está ativo e escutando na porta 22.' },
      { command: 'sudo systemctl restart ssh', desc: 'Reinicia o daemon OpenSSH aplicando novas diretivas do sshd_config.' }
    ]
  },
  {
    id: 'rede',
    name: 'Rede',
    icon: Network,
    commands: [
      { command: 'ip addr', desc: 'Lista todas as interfaces de rede com seus endereços IPv4 configurados.' },
      { command: 'ip -6 addr', desc: 'Exibe especificamente os endereços IPv6 (globais e link-local) de cada interface.' },
      { command: 'ip route', desc: 'Exibe a tabela de roteamento IPv4 e gateway padrão do sistema.' },
      { command: 'ip -6 route', desc: 'Exibe a tabela de rotas e gateway para tráfego IPv6.' },
      { command: 'ss -lntp', desc: 'Exibe todas as portas TCP abertas em modo de escuta com seus respectivos processos e PIDs.' }
    ]
  },
  {
    id: 'armazenamento',
    name: 'Armazenamento',
    icon: HardDrive,
    commands: [
      { command: 'lsblk', desc: 'Lista em árvore todos os dispositivos de bloco (discos, partições e pontos de montagem).' },
      { command: 'df -h', desc: 'Exibe o uso do espaço em disco de cada partição em formato legível para humanos (GB/MB).' },
      { command: 'df -Th', desc: 'Exibe o uso do disco juntamente com o tipo de sistema de arquivos (ext4, vfat, etc).' },
      { command: 'sudo fdisk -l', desc: 'Lista a tabela de partições e geometria física de todos os discos rígidos e SSDs.' },
      { command: 'sudo vgs', desc: 'Exibe informações resumidas sobre os grupos de volumes LVM (Volume Groups).' },
      { command: 'sudo lvs', desc: 'Lista os volumes lógicos LVM configurados no servidor.' }
    ]
  },
  {
    id: 'processos',
    name: 'Processos',
    icon: Cpu,
    commands: [
      { command: 'ps aux', desc: 'Lista todos os processos em execução no sistema com consumo de CPU, RAM e usuário.' },
      { command: 'top', desc: 'Monitor interativo em tempo real de uso de CPU, memória e processos do sistema.' },
      { command: 'htop', desc: 'Monitor de processos interativo colorido com suporte a teclado e rolagem.' }
    ]
  },
  {
    id: 'logs',
    name: 'Logs',
    icon: FileText,
    commands: [
      { command: 'sudo journalctl -xe', desc: 'Exibe os logs do sistema operacional a partir do final com mensagens detalhadas de erro.' },
      { command: 'sudo journalctl -u server-panel', desc: 'Visualiza o histórico completo de logs do serviço do Server Panel.' },
      { command: 'sudo journalctl -u AdGuardHome', desc: 'Visualiza o histórico completo de logs de eventos do AdGuard Home.' }
    ]
  }
];

export const CommandsTab: React.FC = () => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const filteredCategories = COMMAND_CATEGORIES.map(cat => {
    let cmds = cat.commands;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      cmds = cmds.filter(c => c.command.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    }
    return {
      ...cat,
      commands: cmds
    };
  }).filter(cat => {
    if (selectedCategory !== 'all' && cat.id !== selectedCategory) return false;
    return cat.commands.length > 0;
  });

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Header Informativo */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4 text-[#FF5A36]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#1A1A2E] font-title">
                Documentação prática de comandos do servidor
              </h2>
              <span className="text-xs text-[#4A4A68] font-medium">
                Guia operacional de referência para administração via terminal SSH
              </span>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#1A1A2E] bg-[#FFF7E8] px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] self-start sm:self-auto">
            Copiar e colar no terminal
          </span>
        </div>

        <p className="text-xs text-[#4A4A68] mt-3 font-medium leading-relaxed">
          Nesta versão, por segurança do servidor, os comandos não são executados diretamente pelo navegador. 
          Clique no botão de cópia de cada comando para colá-lo na sua sessão SSH: <code className="text-[#1A1A2E] bg-[#FFF7E8] px-2 py-0.5 rounded border-2 border-[#1A1A2E] font-mono text-xs font-bold shadow-sm">ssh samuel@192.168.100.23</code>
        </p>
      </div>

      {/* Barra de Busca e Filtro de Categorias */}
      <div className="p-3.5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Campo de Busca */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#717188] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar comando ou palavra-chave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-bold placeholder-[#717188] focus:outline-none focus:ring-2 focus:ring-[#FF5A36] font-mono shadow-[2px_2px_0px_#1A1A2E]"
          />
        </div>

        {/* Botões de Categorias */}
        <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto text-xs font-mono">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] transition font-bold shadow-[2px_2px_0px_#1A1A2E] ${selectedCategory === 'all' ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'}`}
          >
            Todos
          </button>
          {COMMAND_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] transition font-bold shadow-[2px_2px_0px_#1A1A2E] ${selectedCategory === cat.id ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Categorias e Comandos */}
      <div className="space-y-4">
        {filteredCategories.map(cat => {
          const Icon = cat.icon;

          return (
            <div key={cat.id} className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-3">
              <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
                <div className="w-6 h-6 rounded bg-[#FFF7E8] border border-[#1A1A2E] flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-[#1A1A2E]" />
                </div>
                <h3 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                  {cat.name}
                </h3>
                <span className="text-[11px] font-mono font-bold text-[#717188]">({cat.commands.length} comandos)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.commands.map((item, idx) => {
                  const isCopied = copiedCmd === item.command;

                  return (
                    <div 
                      key={idx} 
                      className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex flex-col justify-between space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-xs text-[#1A1A2E] font-mono break-all select-all font-bold">
                          {item.command}
                        </code>
                        <button
                          onClick={() => copyCommand(item.command)}
                          className={`p-1.5 rounded-md border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition shrink-0 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                            isCopied 
                              ? 'bg-[#12B76A] text-white' 
                              : 'bg-white text-[#1A1A2E] hover:bg-[#FFEECB]'
                          }`}
                          title="Copiar comando"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <p className="text-xs text-[#4A4A68] font-sans font-medium leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
