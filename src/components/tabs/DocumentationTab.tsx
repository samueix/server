import React, { useState } from 'react';
import { 
  BookOpen, 
  Terminal, 
  Globe, 
  Server, 
  Shield, 
  Network, 
  Cpu, 
  Copy, 
  Check, 
  Layers, 
  Workflow, 
  Lock,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { SERVER_IPV4, SERVER_IPV6, SSH_USER, getDynamicSshCommand } from '../../config';

export const DocumentationTab: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('all');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const dynamicIpv6Ssh = getDynamicSshCommand(SERVER_IPV6);

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Header */}
      <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-[#1A1A2E] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF5A36]/15 border-2 border-[#1A1A2E] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-[#FF5A36]" />
            </div>
            <div>
              <h1 className="text-sm font-black text-[#1A1A2E] font-title">
                Documentação da infraestrutura do servidor
              </h1>
              <p className="text-xs text-[#4A4A68] font-medium">
                Manual operacional técnico do Ubuntu Server, Server Panel, AdGuard Home e Rede
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#FF5A36] bg-[#FFF7E8] border-2 border-[#1A1A2E] px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#1A1A2E] self-start sm:self-auto">
            Versão de infraestrutura: v2.4 (Dual-Stack)
          </span>
        </div>

        {/* Navegação Rápida de Tópicos */}
        <div className="flex items-center gap-1.5 flex-wrap pt-3 text-xs">
          <span className="text-[#4A4A68] font-bold mr-1 text-xs">Tópicos:</span>
          {[
            { id: 'all', label: 'Todos os tópicos' },
            { id: 'update', label: '⚡ Atualizar Painel (Script Git)' },
            { id: '1', label: '1. Identificação' },
            { id: '2', label: '2. Acesso SSH' },
            { id: '3', label: '3. Ubuntu Server' },
            { id: '4', label: '4. Server Panel' },
            { id: '5', label: '5. AdGuard Home' },
            { id: '6', label: '6. Rede e Firewall' },
            { id: '7', label: '7. Preparação n8n' }
          ].map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] transition text-xs font-bold shadow-[2px_2px_0px_#1A1A2E] ${
                activeSection === sec.id 
                  ? 'bg-[#FF5A36] text-white' 
                  : 'bg-[#FFF7E8] text-[#4A4A68] hover:text-[#1A1A2E]'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* SCRIPT DE ATUALIZAÇÃO DO SERVIDOR */}
      {(activeSection === 'all' || activeSection === 'update') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#1A1A2E] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#FF5A36]" />
              <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
                Procedimento de Atualização do Painel no Servidor Ubuntu
              </h2>
            </div>
            <button
              onClick={() => copyToClipboard(`cd /opt/server-panel && \\\ngit pull --ff-only origin main && \\\nnpm run build && \\\nsudo rm -rf /var/www/server-panel/* && \\\nsudo cp -a dist/. /var/www/server-panel/ && \\\nsudo chown -R www-data:www-data /var/www/server-panel && \\\nsudo nginx -t && \\\nsudo systemctl reload nginx && \\\necho "================================" && \\\necho "ATUALIZAÇÃO CONCLUÍDA!" && \\\necho "================================"`, 'update-script')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-bold bg-[#FF5A36] text-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#E04522] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
              title="Copiar comando completo"
            >
              {copiedKey === 'update-script' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Copiado com sucesso!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Script de Atualização</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-[#4A4A68] font-medium leading-relaxed">
            Execute o script em lote abaixo diretamente no terminal do Ubuntu (<code className="text-[#1A1A2E] font-mono font-bold">samuelserver</code>). Ele baixa as últimas alterações do Git, compila o build de produção, copia para o diretório raiz do Nginx (<code className="text-[#1A1A2E] font-mono font-bold">/var/www/server-panel</code>), ajusta as permissões para <code className="text-[#1A1A2E] font-mono font-bold">www-data</code> e recarrega o serviço web.
          </p>

          <div className="relative">
            <pre className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-mono font-bold overflow-x-auto shadow-[2px_2px_0px_#1A1A2E] leading-relaxed selection:bg-[#FFEECB]">
{`cd /opt/server-panel && \\
git pull --ff-only origin main && \\
npm run build && \\
sudo rm -rf /var/www/server-panel/* && \\
sudo cp -a dist/. /var/www/server-panel/ && \\
sudo chown -R www-data:www-data /var/www/server-panel && \\
sudo nginx -t && \\
sudo systemctl reload nginx && \\
echo "================================" && \\
echo "ATUALIZAÇÃO CONCLUÍDA!" && \\
echo "================================"`}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#D1FADF] border-2 border-[#12B76A] text-[#12B76A] font-bold">
              <span>1. Git Pull & Build</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Sincroniza a branch main e compila os pacotes TypeScript/Vite.</p>
            </div>
            <div className="p-3 rounded-lg bg-[#E0F2FE] border-2 border-[#00A6FB] text-[#026AA2] font-bold">
              <span>2. Publicação Nginx</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Substitui os arquivos em /var/www/server-panel com posse www-data.</p>
            </div>
            <div className="p-3 rounded-lg bg-[#FEF0C7] border-2 border-[#F79009] text-[#B54708] font-bold">
              <span>3. Reload Sem Queda</span>
              <p className="text-xs text-[#1A1A2E] font-normal font-sans mt-0.5">Valida a sintaxe e recarrega o Nginx sem derrubar conexões ativas.</p>
            </div>
          </div>
        </div>
      )}

      {/* 1. IDENTIFICAÇÃO DO SERVIDOR */}
      {(activeSection === 'all' || activeSection === '1') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Server className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              1. Identificação do servidor
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Hostname</span>
              <span className="text-[#1A1A2E] font-black text-sm font-mono mt-0.5 block">samuelserver</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">IPv4 primário</span>
              <span className="text-[#FF5A36] font-black text-sm font-mono tabular-nums mt-0.5 block">{SERVER_IPV4}</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Usuário administrativo</span>
              <span className="text-[#00A6FB] font-black text-sm font-mono mt-0.5 block">{SSH_USER} (sudoer)</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Arquitetura</span>
              <span className="text-[#1A1A2E] font-black text-sm font-mono mt-0.5 block">x86_64 (64-bit Linux)</span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] text-xs">
            <span className="text-[#4A4A68] text-xs font-bold block mb-1">IPv6 global atual (dinâmico)</span>
            <span className="text-[#1A1A2E] font-mono font-bold break-all text-xs tabular-nums">{SERVER_IPV6}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Sistema operacional</span>
              <span className="text-[#1A1A2E] font-bold mt-0.5 block">Ubuntu 24.04 LTS (Noble Numbat)</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Versão do kernel</span>
              <span className="text-[#1A1A2E] font-mono font-bold mt-0.5 block">Linux 6.8.0-generic</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACESSO SSH */}
      {(activeSection === 'all' || activeSection === '2') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Terminal className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              2. Procedimentos de acesso remoto (SSH)
            </h2>
          </div>

          <p className="text-xs text-[#4A4A68] font-medium leading-relaxed">
            O servidor está configurado com OpenSSH Server escutando na porta padrão 22 para conexões em IPv4 e IPv6.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Acesso IPv4 */}
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-md bg-white text-[#FF5A36] border-2 border-[#1A1A2E] font-mono text-xs font-bold shadow-sm">
                  Acesso SSH via IPv4
                </span>
                <button
                  onClick={() => copyToClipboard(`ssh ${SSH_USER}@${SERVER_IPV4}`, 'ssh-ipv4-doc')}
                  className="p-1.5 rounded-md text-[#1A1A2E] bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#FFEECB] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                  title="Copiar comando"
                >
                  {copiedKey === 'ssh-ipv4-doc' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <code className="text-xs text-[#1A1A2E] font-mono font-bold block p-2.5 rounded-md bg-white border-2 border-[#1A1A2E] select-all">
                ssh {SSH_USER}@{SERVER_IPV4}
              </code>
              <p className="text-xs text-[#4A4A68] font-medium">
                Acesso estável dentro da rede local (192.168.100.0/24).
              </p>
            </div>

            {/* Acesso IPv6 */}
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-md bg-white text-[#00A6FB] border-2 border-[#1A1A2E] font-mono text-xs font-bold shadow-sm">
                  Acesso SSH via IPv6 atual
                </span>
                <button
                  onClick={() => copyToClipboard(dynamicIpv6Ssh, 'ssh-ipv6-doc')}
                  className="p-1.5 rounded-md text-[#1A1A2E] bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] hover:bg-[#FFEECB] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                  title="Copiar comando"
                >
                  {copiedKey === 'ssh-ipv6-doc' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <code className="text-xs text-[#1A1A2E] font-mono font-bold block p-2.5 rounded-md bg-white border-2 border-[#1A1A2E] break-all select-all">
                {dynamicIpv6Ssh}
              </code>
              <p className="text-xs text-[#4A4A68] font-medium">
                Nota: No SSH para endereços IPv6, o endereço deve estar entre colchetes <code className="text-[#1A1A2E] font-mono font-bold">[ ]</code>.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#4A4A68] flex items-start gap-2.5 shadow-[2px_2px_0px_#1A1A2E]">
            <Info className="w-4 h-4 text-[#FF5A36] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#1A1A2E] block mb-1">Atenção sobre o IPv6 dinâmico:</strong>
              O prefixo IPv6 é dinâmico e fornecido pela operadora (SLAAC / DHCPv6). Não fixe o IPv6 antigo 
              (<code className="text-[#1A1A2E] font-mono font-bold">2804:2d5c:a2:512d...</code>). Para consultar o IPv6 em tempo real no servidor, execute:
              <code className="text-[#12B76A] bg-white px-2.5 py-1.5 rounded-md block mt-2 border-2 border-[#1A1A2E] font-mono font-bold select-all">
                ip -6 addr show dev enp2s0 scope global
              </code>
            </div>
          </div>
        </div>
      )}

      {/* 3. UBUNTU SERVER */}
      {(activeSection === 'all' || activeSection === '3') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Server className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              3. Guia operacional do Ubuntu Server
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {/* Atualização */}
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#1A1A2E] font-bold font-sans block mb-1.5">Como atualizar os pacotes e segurança do sistema:</span>
              <div className="flex items-center justify-between bg-white p-2.5 rounded-md border-2 border-[#1A1A2E]">
                <code className="text-[#1A1A2E] font-bold">sudo apt update && sudo apt upgrade -y</code>
                <button
                  onClick={() => copyToClipboard('sudo apt update && sudo apt upgrade -y', 'apt-update')}
                  className="p-1 text-[#1A1A2E] hover:bg-[#FFEECB] rounded transition"
                  title="Copiar"
                >
                  {copiedKey === 'apt-update' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Como verificar versão e kernel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
                <span className="text-[#1A1A2E] font-bold font-sans block mb-1.5">Verificar versão do Ubuntu:</span>
                <code className="text-[#FF5A36] bg-white p-2.5 rounded-md border-2 border-[#1A1A2E] block select-all font-bold">
                  lsb_release -a
                </code>
              </div>
              <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
                <span className="text-[#1A1A2E] font-bold font-sans block mb-1.5">Verificar versão do Kernel:</span>
                <code className="text-[#00A6FB] bg-white p-2.5 rounded-md border-2 border-[#1A1A2E] block select-all font-bold">
                  uname -r
                </code>
              </div>
            </div>

            {/* Reiniciar e Desligar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
                <span className="text-[#1A1A2E] font-bold font-sans block mb-1.5">Reiniciar o servidor com segurança:</span>
                <code className="text-[#1A1A2E] bg-white p-2.5 rounded-md border-2 border-[#1A1A2E] block select-all font-bold">
                  sudo reboot
                </code>
              </div>
              <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
                <span className="text-[#1A1A2E] font-bold font-sans block mb-1.5">Desligar o servidor com segurança:</span>
                <code className="text-[#F04438] bg-white p-2.5 rounded-md border-2 border-[#1A1A2E] block select-all font-bold">
                  sudo poweroff
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SERVER PANEL */}
      {(activeSection === 'all' || activeSection === '4') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Layers className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              4. Arquitetura do Server Panel
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#1A1A2E] font-black block mb-1 text-sm font-title">Frontend React / Vite</span>
              <p className="text-[#4A4A68] leading-relaxed text-xs font-medium">
                Interface de usuário moderna em Tailwind CSS, servida via Nginx na porta 80. Consome exclusivamente rotas relativas (/api).
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#1A1A2E] font-black block mb-1 text-sm font-title">Backend FastAPI (:8000)</span>
              <p className="text-[#4A4A68] leading-relaxed text-xs font-medium">
                API de telemetria em Python com psutil, lendo métricas reais de hardware, processos e systemd diretamente do kernel.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#1A1A2E] font-black block mb-1 text-sm font-title">Nginx Reverse Proxy</span>
              <p className="text-[#4A4A68] leading-relaxed text-xs font-medium">
                Injeta internamente os cabeçalhos de segurança e a API Key secreta. O navegador do cliente nunca conhece ou expõe credenciais.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs space-y-2.5 shadow-[2px_2px_0px_#1A1A2E]">
            <span className="text-[#1A1A2E] font-bold block">Comandos de gestão do daemon do Server Panel:</span>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-md bg-white border-2 border-[#1A1A2E]">
                <code className="text-[#1A1A2E] font-bold">sudo systemctl status server-panel</code>
                <span className="text-[#4A4A68] text-xs font-sans font-bold">Verificar status</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-md bg-white border-2 border-[#1A1A2E]">
                <code className="text-[#1A1A2E] font-bold">sudo systemctl restart server-panel</code>
                <span className="text-[#4A4A68] text-xs font-sans font-bold">Reiniciar processo</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-md bg-white border-2 border-[#1A1A2E]">
                <code className="text-[#1A1A2E] font-bold">sudo journalctl -u server-panel -f</code>
                <span className="text-[#4A4A68] text-xs font-sans font-bold">Acompanhar logs ao vivo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADGUARD HOME */}
      {(activeSection === 'all' || activeSection === '5') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Shield className="w-4 h-4 text-[#12B76A]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              5. Integração com o AdGuard Home
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Porta Web GUI</span>
              <span className="text-[#1A1A2E] font-mono font-black text-sm tabular-nums mt-0.5 block">:8081</span>
              <span className="text-xs text-[#717188] font-medium block mt-0.5">Interface administrativa AdGuard</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Porta de serviço DNS</span>
              <span className="text-[#1A1A2E] font-mono font-black text-sm tabular-nums mt-0.5 block">:53 (UDP / TCP)</span>
              <span className="text-xs text-[#717188] font-medium block mt-0.5">Servidor DNS da rede local</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Proxy Nginx</span>
              <span className="text-[#12B76A] font-mono font-black text-sm mt-0.5 block">/adguard-api/</span>
              <span className="text-xs text-[#717188] font-medium block mt-0.5">Injeção segura de Basic Auth</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs shadow-[2px_2px_0px_#1A1A2E]">
            <span className="text-[#1A1A2E] font-bold block mb-2">Servidores DNS upstream recomendados:</span>
            <ul className="list-disc list-inside space-y-1.5 text-[#4A4A68] text-xs font-mono font-bold">
              <li><code className="text-[#1A1A2E]">https://dns.cloudflare.com/dns-query</code> <span className="font-sans text-xs text-[#717188] font-medium">(Cloudflare DoH)</span></li>
              <li><code className="text-[#1A1A2E]">https://dns.google/dns-query</code> <span className="font-sans text-xs text-[#717188] font-medium">(Google DNS DoH)</span></li>
              <li><code className="text-[#1A1A2E]">tls://1.1.1.1</code> e <code className="text-[#1A1A2E]">tls://8.8.8.8</code> <span className="font-sans text-xs text-[#717188] font-medium">(DNS-over-TLS)</span></li>
            </ul>
          </div>
        </div>
      )}

      {/* 6. REDE & FIREWALL */}
      {(activeSection === 'all' || activeSection === '6') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Network className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              6. Topologia de rede e portas liberadas
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Sub-rede local</span>
              <span className="text-[#1A1A2E] font-mono font-black tabular-nums mt-0.5 block">192.168.100.0/24</span>
              <span className="text-[#717188] text-xs font-medium block mt-0.5">Gateway: 192.168.100.1</span>
            </div>
            <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#4A4A68] text-xs font-bold block">Endereçamento IPv6</span>
              <span className="text-[#00A6FB] font-mono font-black mt-0.5 block">SLAAC dinâmico (/64)</span>
              <span className="text-[#717188] text-xs font-medium block mt-0.5">Roteamento global ativo</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
            <table className="w-full text-xs font-mono text-left text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] text-xs font-black border-b-2 border-[#1A1A2E] font-sans">
                <tr>
                  <th className="py-2.5 px-3.5">Porta</th>
                  <th className="py-2.5 px-3.5">Protocolo</th>
                  <th className="py-2.5 px-3.5">Serviço</th>
                  <th className="py-2.5 px-3.5">Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8] bg-white">
                <tr>
                  <td className="py-2.5 px-3.5 font-black text-[#1A1A2E] tabular-nums">22</td>
                  <td className="py-2.5 px-3.5">TCP</td>
                  <td className="py-2.5 px-3.5 text-[#1A1A2E] font-sans font-bold">OpenSSH Server</td>
                  <td className="py-2.5 px-3.5 text-[#12B76A] font-sans font-bold">Rede local e IPv6</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-black text-[#1A1A2E] tabular-nums">80</td>
                  <td className="py-2.5 px-3.5">TCP</td>
                  <td className="py-2.5 px-3.5 text-[#1A1A2E] font-sans font-bold">Nginx (Server Panel UI e Proxies)</td>
                  <td className="py-2.5 px-3.5 text-[#12B76A] font-sans font-bold">Público / LAN</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-black text-[#1A1A2E] tabular-nums">53</td>
                  <td className="py-2.5 px-3.5">UDP / TCP</td>
                  <td className="py-2.5 px-3.5 text-[#1A1A2E] font-sans font-bold">AdGuard Home DNS Server</td>
                  <td className="py-2.5 px-3.5 text-[#12B76A] font-sans font-bold">Rede local (LAN)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-black text-[#1A1A2E] tabular-nums">8000</td>
                  <td className="py-2.5 px-3.5">TCP</td>
                  <td className="py-2.5 px-3.5 text-[#1A1A2E] font-sans font-bold">FastAPI Telemetria Server</td>
                  <td className="py-2.5 px-3.5 text-[#00A6FB] font-sans font-bold">Localhost / Nginx</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-black text-[#1A1A2E] tabular-nums">8081</td>
                  <td className="py-2.5 px-3.5">TCP</td>
                  <td className="py-2.5 px-3.5 text-[#1A1A2E] font-sans font-bold">AdGuard Home Web GUI</td>
                  <td className="py-2.5 px-3.5 text-[#00A6FB] font-sans font-bold">Localhost / Nginx</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. PREPARAÇÃO PARA O N8N */}
      {(activeSection === 'all' || activeSection === '7') && (
        <div className="p-5 rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b-2 border-[#1A1A2E]">
            <Workflow className="w-4 h-4 text-[#FF5A36]" />
            <h2 className="text-xs font-black text-[#1A1A2E] font-title uppercase tracking-wider">
              7. Planejamento de instalação futura: n8n Workflow Automation
            </h2>
          </div>

          <div className="p-4 rounded-lg bg-[#FEF0C7] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]">
            <strong className="text-[#B54708]">Status de instalação:</strong> O n8n é o próximo serviço que será adicionado ao servidor.
            Ele <em>não</em> está instalado no momento. O painel e o Nginx já estão estruturalmente preparados para sua recepção futura.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2 shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#1A1A2E] font-bold block">Especificações planejadas:</span>
              <ul className="space-y-1 text-[#4A4A68] text-xs font-medium">
                <li><strong className="text-[#1A1A2E]">Porta padrão:</strong> 5678 (HTTP / Webhooks)</li>
                <li><strong className="text-[#1A1A2E]">Tipo de execução:</strong> Contêiner Docker ou Serviço systemd Node.js</li>
                <li><strong className="text-[#1A1A2E]">Diretório de persistência:</strong> <code className="text-[#1A1A2E] font-mono font-bold">/home/samuel/.n8n</code></li>
                <li><strong className="text-[#1A1A2E]">Banco de dados:</strong> SQLite local ou PostgreSQL</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-2 shadow-[2px_2px_0px_#1A1A2E]">
              <span className="text-[#1A1A2E] font-bold block">Roteamento Nginx planejado:</span>
              <p className="text-xs text-[#4A4A68] font-medium leading-relaxed">
                Quando o n8n for ativado, bastará incluir o bloco de proxy no Nginx:
              </p>
              <pre className="p-3 rounded-md bg-white border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] font-mono font-bold overflow-x-auto shadow-sm">
{`location /n8n/ {
    proxy_pass http://127.0.0.1:5678/;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
