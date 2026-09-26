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
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2d4d] gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                Documentação da Infraestrutura do Servidor
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Manual operacional técnico do Ubuntu Server, Server Panel, AdGuard Home e Rede
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800 px-3 py-1 rounded">
            Versão de Infraestrutura: v2.4 (Dual-Stack)
          </span>
        </div>

        {/* Navegação Rápida de Tópicos */}
        <div className="flex items-center gap-1.5 flex-wrap pt-3 text-xs font-mono">
          <span className="text-slate-500 mr-1">Tópicos:</span>
          {[
            { id: 'all', label: 'Todos os Tópicos' },
            { id: '1', label: '1. Identificação' },
            { id: '2', label: '2. Acesso SSH' },
            { id: '3', label: '3. Ubuntu Server' },
            { id: '4', label: '4. Server Panel' },
            { id: '5', label: '5. AdGuard Home' },
            { id: '6', label: '6. Rede & Firewall' },
            { id: '7', label: '7. Preparação n8n' }
          ].map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`px-2.5 py-1 rounded transition ${
                activeSection === sec.id 
                  ? 'bg-blue-600 text-white font-semibold' 
                  : 'bg-[#070d1e] text-slate-400 border border-[#1e2d4d] hover:text-white'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. IDENTIFICAÇÃO DO SERVIDOR */}
      {(activeSection === 'all' || activeSection === '1') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Server className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Identificação do Servidor
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Hostname</span>
              <span className="text-white font-semibold text-sm">samuelserver</span>
            </div>
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">IPv4 Primário</span>
              <span className="text-white font-semibold text-sm">{SERVER_IPV4}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Usuário Administrativo</span>
              <span className="text-cyan-300 font-semibold text-sm">{SSH_USER} (sudoer)</span>
            </div>
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Arquitetura</span>
              <span className="text-white font-semibold text-sm">x86_64 (64-bit Linux)</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d] font-mono text-xs">
            <span className="text-slate-500 text-[10px] uppercase block mb-1">IPv6 Global Atual (Dinâmico)</span>
            <span className="text-blue-300 font-semibold break-all text-xs">{SERVER_IPV6}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Sistema Operacional</span>
              <span className="text-slate-200">Ubuntu 24.04 LTS (Noble Numbat)</span>
            </div>
            <div className="p-3 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Versão do Kernel</span>
              <span className="text-slate-200">Linux 6.8.0-generic</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACESSO SSH */}
      {(activeSection === 'all' || activeSection === '2') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Procedimentos de Acesso Remoto (SSH)
            </h2>
          </div>

          <p className="text-xs text-slate-300 font-mono leading-relaxed">
            O servidor está configurado com OpenSSH Server escutando na porta padrão 22 para conexões em IPv4 e IPv6.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Acesso IPv4 */}
            <div className="p-4 rounded-xl bg-[#070d1e] border border-[#1e2d4d] space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] font-bold">
                  ACESSO SSH VIA IPV4
                </span>
                <button
                  onClick={() => copyToClipboard(`ssh ${SSH_USER}@${SERVER_IPV4}`, 'ssh-ipv4-doc')}
                  className="p-1 rounded text-slate-400 hover:text-white transition"
                  title="Copiar comando"
                >
                  {copiedKey === 'ssh-ipv4-doc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <code className="text-xs text-white font-mono block p-2 rounded bg-black/40 border border-slate-800">
                ssh {SSH_USER}@{SERVER_IPV4}
              </code>
              <p className="text-[11px] text-slate-400 font-sans">
                Acesso estável dentro da rede local (192.168.100.0/24).
              </p>
            </div>

            {/* Acesso IPv6 */}
            <div className="p-4 rounded-xl bg-[#070d1e] border border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] font-bold">
                  ACESSO SSH VIA IPV6 ATUAL
                </span>
                <button
                  onClick={() => copyToClipboard(dynamicIpv6Ssh, 'ssh-ipv6-doc')}
                  className="p-1 rounded text-slate-400 hover:text-white transition"
                  title="Copiar comando"
                >
                  {copiedKey === 'ssh-ipv6-doc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <code className="text-[11px] text-blue-200 font-mono block p-2 rounded bg-black/40 border border-slate-800 break-all select-all">
                {dynamicIpv6Ssh}
              </code>
              <p className="text-[11px] text-slate-400 font-sans">
                Nota: No SSH para endereços IPv6, o endereço deve estar entre colchetes <code className="text-blue-300 font-mono">[ ]</code>.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 font-mono text-xs text-slate-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-300 block mb-0.5">Atenção sobre o IPv6 Dinâmico:</strong>
              O prefixo IPv6 é dinâmico e fornecido pela operadora (SLAAC / DHCPv6). Não fixe o IPv6 antigo 
              (<code className="text-slate-400">2804:2d5c:a1:897e...</code>). Para consultar o IPv6 em tempo real no servidor, execute:
              <code className="text-emerald-300 bg-black/40 px-2 py-0.5 rounded block mt-1 border border-slate-800">
                ip -6 addr show dev enp2s0 scope global
              </code>
            </div>
          </div>
        </div>
      )}

      {/* 3. UBUNTU SERVER */}
      {(activeSection === 'all' || activeSection === '3') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Server className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Guia Operacional do Ubuntu Server
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {/* Atualização */}
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-white font-semibold font-sans block mb-1">Como atualizar os pacotes e segurança do sistema:</span>
              <div className="flex items-center justify-between bg-black/40 p-2 rounded border border-slate-800">
                <code className="text-blue-300">sudo apt update && sudo apt upgrade -y</code>
                <button
                  onClick={() => copyToClipboard('sudo apt update && sudo apt upgrade -y', 'apt-update')}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Copiar"
                >
                  {copiedKey === 'apt-update' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Como verificar versão e kernel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
                <span className="text-white font-semibold font-sans block mb-1">Verificar versão do Ubuntu:</span>
                <code className="text-blue-300 bg-black/40 p-2 rounded border border-slate-800 block">
                  lsb_release -a
                </code>
              </div>
              <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
                <span className="text-white font-semibold font-sans block mb-1">Verificar versão do Kernel:</span>
                <code className="text-blue-300 bg-black/40 p-2 rounded border border-slate-800 block">
                  uname -r
                </code>
              </div>
            </div>

            {/* Reiniciar e Desligar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
                <span className="text-white font-semibold font-sans block mb-1">Reiniciar o servidor com segurança:</span>
                <code className="text-amber-300 bg-black/40 p-2 rounded border border-slate-800 block">
                  sudo reboot
                </code>
              </div>
              <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
                <span className="text-white font-semibold font-sans block mb-1">Desligar o servidor com segurança:</span>
                <code className="text-rose-300 bg-black/40 p-2 rounded border border-slate-800 block">
                  sudo poweroff
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SERVER PANEL */}
      {(activeSection === 'all' || activeSection === '4') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Arquitetura do Server Panel
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-indigo-400 font-bold block mb-1 font-sans">Frontend React / Vite</span>
              <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
                Interface de usuário moderna em Tailwind CSS, servida via Nginx na porta 80. Consome exclusivamente rotas relativas (/api).
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-indigo-400 font-bold block mb-1 font-sans">Backend FastAPI (:8000)</span>
              <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
                API de telemetria em Python com psutil, lendo métricas reais de hardware, processos e systemd diretamente do kernel.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-indigo-400 font-bold block mb-1 font-sans">Nginx Reverse Proxy</span>
              <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
                Injeta internamente os cabeçalhos de segurança e a API Key secreta. O navegador do cliente nunca conhece ou expõe credenciais.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#070d1e] border border-[#1e2d4d] font-mono text-xs space-y-2">
            <span className="text-white font-semibold font-sans block">Comandos de Gestão do Daemon do Server Panel:</span>
            <div className="space-y-1.5 text-slate-300">
              <div className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-slate-800">
                <code>sudo systemctl status server-panel</code>
                <span className="text-slate-500 text-[10px]">Verificar status</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-slate-800">
                <code>sudo systemctl restart server-panel</code>
                <span className="text-slate-500 text-[10px]">Reiniciar processo</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-slate-800">
                <code>sudo journalctl -u server-panel -f</code>
                <span className="text-slate-500 text-[10px]">Acompanhar logs ao vivo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADGUARD HOME */}
      {(activeSection === 'all' || activeSection === '5') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              5. Integração com o AdGuard Home
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Porta Web GUI</span>
              <span className="text-white font-bold text-sm">:8081</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Interface administrativa AdGuard</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Porta de Serviço DNS</span>
              <span className="text-white font-bold text-sm">:53 (UDP / TCP)</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Servidor DNS da rede local</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Proxy Nginx</span>
              <span className="text-emerald-400 font-bold text-sm">/adguard-api/</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Injeção segura de Basic Auth</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d] font-mono text-xs">
            <span className="text-white font-semibold font-sans block mb-1">Servidores DNS Upstream Recomendados:</span>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
              <li><code className="text-blue-300">https://dns.cloudflare.com/dns-query</code> (Cloudflare DoH)</li>
              <li><code className="text-blue-300">https://dns.google/dns-query</code> (Google DNS DoH)</li>
              <li><code className="text-blue-300">tls://1.1.1.1</code> e <code className="text-blue-300">tls://8.8.8.8</code> (DNS-over-TLS)</li>
            </ul>
          </div>
        </div>
      )}

      {/* 6. REDE & FIREWALL */}
      {(activeSection === 'all' || activeSection === '6') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Network className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              6. Topologia de Rede & Portas Liberadas
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Sub-rede Local</span>
              <span className="text-white font-semibold">192.168.100.0/24</span>
              <span className="text-slate-400 text-[10px] block mt-0.5">Gateway: 192.168.100.1</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070d1e] border border-[#1e2d4d]">
              <span className="text-slate-500 text-[10px] uppercase block">Endereçamento IPv6</span>
              <span className="text-blue-300 font-semibold">SLAAC Dinâmico (/64)</span>
              <span className="text-slate-400 text-[10px] block mt-0.5">Roteamento global ativo</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1e2d4d]">
            <table className="w-full text-xs font-mono text-left text-slate-300">
              <thead className="bg-[#070d1e] text-slate-400 uppercase text-[10px] border-b border-[#1e2d4d]">
                <tr>
                  <th className="py-2.5 px-3">Porta</th>
                  <th className="py-2.5 px-3">Protocolo</th>
                  <th className="py-2.5 px-3">Serviço</th>
                  <th className="py-2.5 px-3">Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2d4d]/60 bg-[#0b1329]">
                <tr>
                  <td className="py-2 px-3 font-bold text-white">22</td>
                  <td className="py-2 px-3">TCP</td>
                  <td className="py-2 px-3">OpenSSH Server</td>
                  <td className="py-2 px-3 text-emerald-400">Rede Local & IPv6</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-white">80</td>
                  <td className="py-2 px-3">TCP</td>
                  <td className="py-2 px-3">Nginx (Server Panel UI & Proxies)</td>
                  <td className="py-2 px-3 text-emerald-400">Público / LAN</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-white">53</td>
                  <td className="py-2 px-3">UDP / TCP</td>
                  <td className="py-2 px-3">AdGuard Home DNS Server</td>
                  <td className="py-2 px-3 text-emerald-400">Rede Local (LAN)</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-white">8000</td>
                  <td className="py-2 px-3">TCP</td>
                  <td className="py-2 px-3">FastAPI Telemetria Server</td>
                  <td className="py-2 px-3 text-cyan-300">Localhost / Nginx</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-white">8081</td>
                  <td className="py-2 px-3">TCP</td>
                  <td className="py-2 px-3">AdGuard Home Web GUI</td>
                  <td className="py-2 px-3 text-cyan-300">Localhost / Nginx</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. PREPARAÇÃO PARA O N8N */}
      {(activeSection === 'all' || activeSection === '7') && (
        <div className="p-5 rounded-2xl bg-[#0b1329] border border-[#1e2d4d] shadow space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1e2d4d]">
            <Workflow className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              7. Planejamento de Instalação Futura: n8n Workflow Automation
            </h2>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-200">
            <strong>Status de Instalação:</strong> O n8n é o próximo serviço que será adicionado ao servidor.
            Ele <em>não</em> está instalado no momento. O painel e o Nginx já estão estruturalmente preparados para sua recepção futura.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-[#070d1e] border border-[#1e2d4d] space-y-2">
              <span className="text-white font-semibold font-sans block">Especificações Planejadas:</span>
              <ul className="space-y-1 text-slate-300 text-[11px]">
                <li>• <strong>Porta Padrão:</strong> 5678 (HTTP / Webhooks)</li>
                <li>• <strong>Tipo de Execução:</strong> Contêiner Docker ou Serviço systemd Node.js</li>
                <li>• <strong>Diretório de Persistência:</strong> <code className="text-blue-300">/home/samuel/.n8n</code></li>
                <li>• <strong>Banco de Dados:</strong> SQLite local ou PostgreSQL</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[#070d1e] border border-[#1e2d4d] space-y-2">
              <span className="text-white font-semibold font-sans block">Roteamento Nginx Planejado:</span>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Quando o n8n for ativado, bastará incluir o bloco de proxy no Nginx:
              </p>
              <pre className="p-2 rounded bg-black/40 border border-slate-800 text-[10px] text-blue-300 font-mono overflow-x-auto">
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
