import React, { useState } from 'react';
import { 
  BookOpen, 
  HelpCircle, 
  Copy, 
  Check, 
  Sparkles, 
  Layers, 
  Terminal,
  ArrowRight
} from 'lucide-react';

interface CommandToken {
  token: string;
  type: 'cmd' | 'flag' | 'path' | 'operator' | 'arg' | 'symbol';
  name: string;
  explanation: string;
}

// Dicionário mestre de desconstrução de tokens e símbolos do Shell Linux/Ubuntu
const LINUX_DICTIONARY: Record<string, { name: string; type: CommandToken['type']; explanation: string }> = {
  'cd': { name: 'Change Directory', type: 'cmd', explanation: 'Comando do bash que muda a pasta de trabalho atual para o diretório especificado.' },
  '/': { name: 'Barra (Separador / Raiz)', type: 'symbol', explanation: 'No início representa a raiz absoluta do sistema (/); entre palavras atua como separador de diretórios.' },
  '.': { name: 'Ponto Simples (Diretório Atual)', type: 'symbol', explanation: 'Representa a pasta atual onde o comando está sendo executado.' },
  '..': { name: 'Dois Pontos (Diretório Pai)', type: 'symbol', explanation: 'Representa um nível acima na árvore de diretórios (a pasta mãe).' },
  '\\': { name: 'Contra-Barra (Continuação de Linha)', type: 'symbol', explanation: 'Escapa a quebra de linha no bash, permitindo escrever um único comando longo em várias linhas legíveis.' },
  '&&': { name: 'Operador Lógico E (AND)', type: 'operator', explanation: 'Encadeia comandos. Só executa o próximo se o comando anterior finalizar com sucesso absoluto (exit code 0).' },
  ';': { name: 'Ponto e Vírgula (Separador)', type: 'operator', explanation: 'Executa comandos sequencialmente, independente de o anterior ter dado erro ou sucesso.' },
  '|': { name: 'Pipe (Tubo de Redirecionamento)', type: 'operator', explanation: 'Pega toda a saída de texto gerada pelo comando da esquerda e a injeta como entrada para o comando da direita.' },
  '*': { name: 'Asterisco (Wildcard Coringa)', type: 'symbol', explanation: 'Representa qualquer conjunto de caracteres. Em caminhos como /*, seleciona todos os arquivos e pastas daquele diretório.' },
  'opt': { name: 'Optional Software (/opt)', type: 'path', explanation: 'Diretório padrão da hierarquia Linux (FHS) destinado a softwares e aplicações adicionais de terceiros.' },
  'server-panel': { name: 'Pasta do Projeto', type: 'path', explanation: 'Subpasta onde está clonado o código fonte do painel de controle do servidor.' },
  'var': { name: 'Variable Data (/var)', type: 'path', explanation: 'Diretório do Linux que armazena dados variáveis, como sites do Nginx (/var/www) e logs de serviços.' },
  'www': { name: 'World Wide Web (/var/www)', type: 'path', explanation: 'Local padrão onde servidores web (Nginx e Apache) servem páginas HTML e aplicações frontend no Debian e Ubuntu.' },
  'git': { name: 'Git Version Control', type: 'cmd', explanation: 'Utilitário de linha de comando para gerenciamento de histórico e sincronização com repositórios Git.' },
  'pull': { name: 'Git Pull', type: 'arg', explanation: 'Subcomando do Git que baixa commits do repositório remoto e os mescla na branch local.' },
  '--ff-only': { name: 'Fast-Forward Only', type: 'flag', explanation: 'Exige que a atualização ocorra estritamente sem criar commits de merge sujos. Se houver conflito local, o comando aborta com segurança.' },
  'origin': { name: 'Remote Origin', type: 'arg', explanation: 'Nome padrão da conexão remota configurada no repositório (aponta para o GitHub/GitLab do projeto).' },
  'main': { name: 'Branch Main', type: 'arg', explanation: 'Nome da ramificação de código principal e estável do repositório.' },
  'npm': { name: 'Node Package Manager', type: 'cmd', explanation: 'Gerenciador de pacotes do ecossistema Node.js para compilar e gerenciar dependências.' },
  'run': { name: 'Run Script', type: 'arg', explanation: 'Instrui o npm a executar um script predefinido no arquivo package.json.' },
  'build': { name: 'Build Production', type: 'arg', explanation: 'Executa o compilador Vite/TypeScript gerando o bundle estático minificado e otimizado na pasta dist/.' },
  'sudo': { name: 'SuperUser DO (Root)', type: 'cmd', explanation: 'Executa o comando seguinte com privilégios de administrador (root), necessários para modificar arquivos do sistema.' },
  'rm': { name: 'Remove Files', type: 'cmd', explanation: 'Comando do Linux que deleta permanentemente arquivos ou diretórios do sistema de arquivos.' },
  '-r': { name: 'Flag Recursive (-r)', type: 'flag', explanation: 'Aplica a exclusão recursivamente em todas as subpastas e arquivos internos.' },
  '-f': { name: 'Flag Force (-f)', type: 'flag', explanation: 'Força a exclusão sem solicitar confirmação interativa para cada arquivo e ignora arquivos que não existam.' },
  '-rf': { name: 'Flags Combinadas (-rf)', type: 'flag', explanation: 'Combina recursão (-r) e força (-f), limpando totalmente a pasta de destino sem travar o script.' },
  '-R': { name: 'Flag Recursive Maiúsculo (-R)', type: 'flag', explanation: 'Aplica a alteração de dono ou permissões recursivamente em toda a árvore de arquivos e subdiretórios.' },
  'cp': { name: 'Copy Files', type: 'cmd', explanation: 'Copia arquivos ou pastas de um local de origem para um local de destino.' },
  '-a': { name: 'Flag Archive (-a)', type: 'flag', explanation: 'Preserva permissões originais, donos (ownership), links simbólicos e datas de modificação dos arquivos.' },
  'dist/.': { name: 'Conteúdo de dist/', type: 'path', explanation: 'A pasta dist/ com o ponto no final (. ) garante que o conteúdo interno seja copiado, e não a pasta dist em si.' },
  'chown': { name: 'Change Owner', type: 'cmd', explanation: 'Modifica o usuário e/ou grupo proprietário de arquivos e diretórios no sistema de permissões do Linux.' },
  'www-data:www-data': { name: 'Usuário:Grupo Web', type: 'arg', explanation: 'Define o dono como o usuário www-data e grupo www-data, que é a conta de serviço do Nginx no Ubuntu.' },
  'nginx': { name: 'Nginx Web Server', type: 'cmd', explanation: 'O servidor HTTP e proxy reverso de alto desempenho responsável por servir o painel.' },
  '-t': { name: 'Flag Test Configuration (-t)', type: 'flag', explanation: 'Testa a sintaxe dos arquivos de configuração do Nginx antes de aplicá-las, evitando que o site caia por erro de digitação.' },
  'systemctl': { name: 'System Control (systemd)', type: 'cmd', explanation: 'Ferramenta central do Ubuntu para gerenciar e inspecionar serviços e daemons em execução no sistema.' },
  'reload': { name: 'Reload Service', type: 'arg', explanation: 'Recarrega arquivos de configuração sem derrubar o serviço nem fechar conexões ativas de rede.' },
  'restart': { name: 'Restart Service', type: 'arg', explanation: 'Encerra o processo do serviço e inicia uma nova instância do zero.' },
  'status': { name: 'Status do Serviço', type: 'arg', explanation: 'Exibe se o serviço está ativo (running), falhado ou desabilitado, além de logs recentes.' },
  'echo': { name: 'Echo Text', type: 'cmd', explanation: 'Imprime na tela do terminal a mensagem ou variável especificada.' },
  'uptime': { name: 'System Uptime', type: 'cmd', explanation: 'Exibe há quanto tempo o computador está ligado, quantidade de usuários e a média de carga da CPU (1, 5 e 15 min).' },
  'free': { name: 'Free Memory', type: 'cmd', explanation: 'Mostra o consumo atual de memória RAM física e memória Swap.' },
  '-h': { name: 'Human-Readable (-h)', type: 'flag', explanation: 'Converte números de bytes brutos em unidades humanas amigáveis (K, M, G, T).' },
  'df': { name: 'Disk Free', type: 'cmd', explanation: 'Exibe a quantidade de espaço em disco livre e ocupado em cada partição montada no sistema operacional.' },
  'ip': { name: 'IP Route Management', type: 'cmd', explanation: 'Comando moderno do Linux que substituiu o ifconfig para configurar e inspecionar placas e endereços de rede.' },
  'addr': { name: 'Address Subcommand', type: 'arg', explanation: 'Subcomando do utilitário ip que lista todos os endereços IPv4 e IPv6 das placas de rede.' },
  'ss': { name: 'Socket Statistics', type: 'cmd', explanation: 'Utilitário ultrarrápido para listar portas de rede abertas e conexões TCP/UDP ativas.' },
  '-lntp': { name: 'Flags Combinadas (-lntp)', type: 'flag', explanation: '-l (apenas portas escutando), -n (exibe números de portas em vez de nomes), -t (somente TCP), -p (mostra o processo dono).' },
  'curl': { name: 'Client URL (cURL)', type: 'cmd', explanation: 'Ferramenta para transferir dados de ou para um servidor usando protocolos HTTP, HTTPS, FTP etc.' },
  '-s': { name: 'Silent Mode (-s)', type: 'flag', explanation: 'Silencia a barra de progresso e saídas desnecessárias do curl.' },
  '-X': { name: 'HTTP Method Flag (-X)', type: 'flag', explanation: 'Especifica o método HTTP da requisição (ex: POST, GET, PUT, DELETE).' },
  '-u': { name: 'User Authentication (-u)', type: 'flag', explanation: 'Passa usuário e senha para autenticação HTTP Basic (formato usuario:senha).' }
};

export interface CommandAnatomyModalProps {
  command: string;
  onClose: () => void;
  onExecuteNow?: () => void;
}

export const CommandAnatomyModal: React.FC<CommandAnatomyModalProps> = ({ 
  command, 
  onClose,
  onExecuteNow 
}) => {
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Divide o comando de forma inteligente preservando delimitadores especiais
  const parseTokens = (rawCmd: string): CommandToken[] => {
    // Normaliza quebras de linha e barras invertidas
    const normalized = rawCmd.replace(/\\\s*\n/g, ' \\ ').trim();
    // Separa por espaços, mantendo tokens de pontuação
    const rawParts = normalized.split(/\s+/).filter(Boolean);

    return rawParts.map((part) => {
      // Limpeza de pontuação periférica para busca no dicionário
      const clean = part.replace(/^["']|["']$/g, '');
      const match = LINUX_DICTIONARY[clean] || LINUX_DICTIONARY[part];

      if (match) {
        return {
          token: part,
          type: match.type,
          name: match.name,
          explanation: match.explanation
        };
      }

      // Inferência automática baseada em sintaxe padrão Linux
      if (part === '&&' || part === '||' || part === ';' || part === '|') {
        return {
          token: part,
          type: 'operator',
          name: 'Operador de Fluxo do Shell',
          explanation: part === '&&' 
            ? 'Operador E (AND): só roda o comando seguinte se o anterior der certo.' 
            : part === '|' 
            ? 'Pipe: direciona a saída do primeiro comando para a entrada do próximo.'
            : 'Separador sequencial de comandos.'
        };
      }

      if (part === '\\') {
        return {
          token: part,
          type: 'symbol',
          name: 'Contra-Barra (Continuação)',
          explanation: 'Informa ao bash que o comando continua na próxima linha sem executá-lo agora.'
        };
      }

      if (part.startsWith('-')) {
        return {
          token: part,
          type: 'flag',
          name: `Parâmetro / Flag (${part})`,
          explanation: `Modifica o comportamento padrão do comando anterior. Cada letra ou palavra ativa uma opção específica do utilitário.`
        };
      }

      if (part.includes('/')) {
        return {
          token: part,
          type: 'path',
          name: `Caminho do Sistema de Arquivos (${part})`,
          explanation: `Indica a localização exata no disco do Ubuntu. A barra (/) separa cada diretório na árvore de pastas.`
        };
      }

      return {
        token: part,
        type: 'arg',
        name: `Argumento (${part})`,
        explanation: `Valor ou parâmetro passado para o comando executar sua tarefa no sistema.`
      };
    });
  };

  const tokens = parseTokens(command);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeTokenInfo = selectedToken 
    ? tokens.find(t => t.token === selectedToken) || tokens[0] 
    : tokens[0];

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A2E]/70 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[8px_8px_0px_#1A1A2E] rounded-xl max-w-2xl w-full p-5 sm:p-6 space-y-5 my-auto max-h-[90vh] flex flex-col font-sans">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3.5 border-b-2 border-[#1A1A2E] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] flex items-center justify-center text-[#FF5A36] shadow-[2px_2px_0px_#1A1A2E]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#1A1A2E] font-title">
                  Anatomia do Código & Dicionário Linux
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ECFDF3] border border-[#12B76A] text-[#12B76A]">
                  Educacional
                </span>
              </div>
              <p className="text-xs text-[#717188] font-medium">
                Clique em qualquer palavra, barra, ponto ou símbolo para entender exatamente o que ele faz.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8] hover:bg-[#FEE4E2] flex items-center justify-center text-xs font-bold font-mono transition"
            title="Fechar anatomia"
          >
            ✕
          </button>
        </div>

        {/* CÓDIGO COMPLETO VISUALMENTE INTERATIVO */}
        <div className="space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs font-bold text-[#1A1A2E]">
            <span className="font-mono text-[11px] text-[#717188] flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[#FF5A36]" />
              Comando Dissecado (Clique nos blocos):
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] font-mono text-[#FF5A36] hover:underline font-bold"
            >
              {copied ? <Check className="w-3 h-3 text-[#12B76A]" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copiado!' : 'Copiar Comando Completo'}</span>
            </button>
          </div>

          <div className="p-3 bg-[#1A1A2E] border-2 border-[#1A1A2E] rounded-xl flex flex-wrap gap-1.5 shadow-inner max-h-48 overflow-y-auto">
            {tokens.map((t, idx) => {
              const isSelected = selectedToken === t.token;
              
              let badgeColor = 'bg-[#2D2D42] text-white hover:bg-[#3D3D58]';
              if (t.type === 'cmd') badgeColor = 'bg-[#FF5A36] text-white hover:bg-[#e04826] font-black';
              else if (t.type === 'operator') badgeColor = 'bg-[#FFC857] text-[#1A1A2E] hover:bg-[#e6b44e] font-black';
              else if (t.type === 'flag') badgeColor = 'bg-[#00A6FB] text-white hover:bg-[#008fdb] font-bold';
              else if (t.type === 'path') badgeColor = 'bg-[#12B76A] text-white hover:bg-[#0fa05b] font-mono';
              else if (t.type === 'symbol') badgeColor = 'bg-[#F04438] text-white hover:bg-[#d9382d] font-black';

              return (
                <button
                  key={`${t.token}-${idx}`}
                  onClick={() => setSelectedToken(t.token)}
                  className={`px-2 py-1 rounded text-xs font-mono transition border ${badgeColor} ${
                    isSelected ? 'ring-2 ring-white scale-105 shadow-md' : 'opacity-90'
                  }`}
                  title={`Clique para dissecar: ${t.token}`}
                >
                  {t.token}
                </button>
              );
            })}
          </div>
        </div>

        {/* PAINEL DE EXPLICAÇÃO DO ELEMENTO SELECIONADO */}
        {activeTokenInfo && (
          <div className="bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] rounded-xl p-4 space-y-2.5 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#1A1A2E]/20">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-[#1A1A2E] text-white text-xs font-mono font-black shadow-[1px_1px_0px_#1A1A2E]">
                  {activeTokenInfo.token}
                </span>
                <span className="text-xs font-black text-[#1A1A2E] font-title">
                  {activeTokenInfo.name}
                </span>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                activeTokenInfo.type === 'cmd' ? 'bg-[#FF5A36] text-white' :
                activeTokenInfo.type === 'operator' ? 'bg-[#FFC857] text-[#1A1A2E]' :
                activeTokenInfo.type === 'flag' ? 'bg-[#00A6FB] text-white' :
                activeTokenInfo.type === 'path' ? 'bg-[#12B76A] text-white' : 'bg-[#1A1A2E] text-white'
              }`}>
                {activeTokenInfo.type}
              </span>
            </div>

            <p className="text-xs text-[#1A1A2E] font-medium leading-relaxed">
              {activeTokenInfo.explanation}
            </p>
          </div>
        )}

        {/* LEGENDA RÁPIDA DE CORES */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono font-bold text-[#1A1A2E] pt-1 shrink-0">
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#FFF7E8] border border-[#1A1A2E]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A36]" />
            <span>Comando</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#FFF7E8] border border-[#1A1A2E]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00A6FB]" />
            <span>Flag / Parâmetro</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#FFF7E8] border border-[#1A1A2E]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFC857]" />
            <span>Operador (&&, |)</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#FFF7E8] border border-[#1A1A2E]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#12B76A]" />
            <span>Caminho / Pasta</span>
          </div>
          <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#FFF7E8] border border-[#1A1A2E]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F04438]" />
            <span>Símbolo (\, ., *)</span>
          </div>
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="flex items-center justify-between pt-3 border-t-2 border-[#1A1A2E] shrink-0">
          <span className="text-[11px] font-mono text-[#717188] hidden sm:inline">
            Aprenda a função de cada caractere antes de rodar
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Fechar
            </button>

            {onExecuteNow && (
              <button
                onClick={() => {
                  onClose();
                  onExecuteNow();
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#FF5A36] hover:bg-[#e04826] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] rounded-lg text-xs font-mono font-bold text-white transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <span>Executar no Shell</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
