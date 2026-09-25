import React, { useState } from 'react';
import { X, Copy, Check, Terminal, FileCode, BookOpen, ShieldAlert, Cpu, Layers } from 'lucide-react';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverIp?: string;
}

export const CodeViewerModal: React.FC<CodeViewerModalProps> = ({
  isOpen,
  onClose,
  serverIp = 'SEU_IP'
}) => {
  const [activeTab, setActiveTab] = useState<'install' | 'curl' | 'systemd' | 'env' | 'readme'>('install');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const installScriptCmd = `# Execute no seu Ubuntu Server via SSH:
git clone https://github.com/seu-usuario/server-monitor.git
cd server-monitor
chmod +x install.sh
sudo ./install.sh`;

  const curlTestCmd = `# 1. Teste Health Check público:
curl -i http://${serverIp}:8000/api/health

# 2. Teste autenticado com Basic Auth:
curl -u "admin:sua_senha" http://${serverIp}:8000/api/system

# 3. Teste processos:
curl -u "admin:sua_senha" "http://${serverIp}:8000/api/processes?sort_by=cpu&limit=20"

# 4. Verificar porta aberta no Ubuntu:
sudo ss -tulpn | grep 8000`;

  const systemdServiceText = `[Unit]
Description=Server Monitor - Backend API de Telemetria
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/server-monitor
EnvironmentFile=/opt/server-monitor/.env
ExecStart=/opt/server-monitor/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=5s
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target`;

  const envExampleText = `# /opt/server-monitor/.env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=alterar_esta_senha_super_segura
API_KEY=chave_secreta_opcional_para_api
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=*
ADGUARD_URL=http://127.0.0.1:8081
ADGUARD_USERNAME=
ADGUARD_PASSWORD=`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none transition-all">
      <div className="w-full max-w-4xl rounded-3xl apple-glass-dark border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 text-blue-300 border border-white/15 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Instalação & Scripts do Ubuntu Server</h2>
              <p className="text-xs text-white/60">Códigos prontos e comandos para rodar no seu servidor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-white/10 bg-white/5 text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('install')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'install'
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            ⚡ Instalador (install.sh)
          </button>
          <button
            onClick={() => setActiveTab('curl')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'curl'
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            📡 Comandos curl & Diagnóstico
          </button>
          <button
            onClick={() => setActiveTab('systemd')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'systemd'
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            ⚙️ systemd Service
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'env'
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            🔒 .env de Configuração
          </button>
          <button
            onClick={() => setActiveTab('readme')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition whitespace-nowrap ${
              activeTab === 'readme'
                ? 'bg-white/20 text-white border border-white/25 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            📖 Guia Completo & HTTPS
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs">
          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-200 font-sans text-xs">
                O arquivo <code className="font-mono bg-blue-900/40 px-1 py-0.5 rounded">install.sh</code> já foi criado no repositório. Ele cria o venv em <code className="font-mono bg-blue-900/40 px-1 py-0.5 rounded">/opt/server-monitor</code>, instala as dependências do FastAPI e configura o serviço systemd para iniciar no boot.
              </div>

              <div className="relative">
                <div className="flex items-center justify-between text-white/60 text-[11px] mb-2 font-sans">
                  <span>Comando de 1 linha para rodar no Ubuntu:</span>
                  <button
                    onClick={() => copyToClipboard(installScriptCmd, 'install')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/10"
                  >
                    {copiedKey === 'install' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'install' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-black/40 rounded-2xl border border-white/10 text-white/90 overflow-x-auto">
                  {installScriptCmd}
                </pre>
              </div>

              <div className="font-sans text-xs text-white/60 space-y-1.5 p-3.5 rounded-2xl bg-white/5 border border-white/10">
                <p className="font-semibold text-white">O que o script faz automaticamente:</p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-white/70">
                  <li>Instala <code className="text-blue-300">python3-venv</code>, <code className="text-blue-300">pip</code> e ferramentas do sistema.</li>
                  <li>Copia todos os arquivos do backend para <code className="text-blue-300">/opt/server-monitor</code>.</li>
                  <li>Gera senhas seguras no arquivo <code className="text-blue-300">/opt/server-monitor/.env</code>.</li>
                  <li>Habilita e inicia o daemon <code className="text-blue-300">server-monitor.service</code> via systemctl.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="space-y-4">
              <div className="relative">
                <div className="flex items-center justify-between text-white/60 text-[11px] mb-2 font-sans">
                  <span>Comandos de teste no terminal do Ubuntu:</span>
                  <button
                    onClick={() => copyToClipboard(curlTestCmd, 'curl')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/10"
                  >
                    {copiedKey === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'curl' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-black/40 rounded-2xl border border-white/10 text-white/90 overflow-x-auto whitespace-pre-wrap">
                  {curlTestCmd}
                </pre>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 font-sans text-xs text-white/80 space-y-2">
                <div className="font-semibold text-white">Como saber se a porta 8000 está respondendo:</div>
                <p className="text-white/60 text-[11px]">
                  1. Execute <code className="text-blue-300 font-mono">sudo ss -tulpn | grep 8000</code>. Você deve ver o processo <code className="text-blue-300 font-mono">uvicorn</code> no estado <code className="text-emerald-400 font-mono">LISTEN</code>.
                </p>
                <p className="text-white/60 text-[11px]">
                  2. Se o firewall UFW estiver ativo: <code className="text-blue-300 font-mono">sudo ufw allow 8000/tcp</code>.
                </p>
                <p className="text-white/60 text-[11px]">
                  3. Ver logs do backend em tempo real: <code className="text-blue-300 font-mono">sudo journalctl -u server-monitor -f</code>.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'systemd' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-white/60 text-[11px] font-sans">
                <span>Arquivo <code className="text-blue-300">/etc/systemd/system/server-monitor.service</code>:</span>
                <button
                  onClick={() => copyToClipboard(systemdServiceText, 'systemd')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/10"
                >
                  {copiedKey === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'systemd' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-4 bg-black/40 rounded-2xl border border-white/10 text-white/90 overflow-x-auto whitespace-pre-wrap">
                {systemdServiceText}
              </pre>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-white/60 text-[11px] font-sans">
                <span>Arquivo <code className="text-blue-300">/opt/server-monitor/.env</code>:</span>
                <button
                  onClick={() => copyToClipboard(envExampleText, 'env')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/10"
                >
                  {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'env' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-4 bg-black/40 rounded-2xl border border-white/10 text-white/90 overflow-x-auto whitespace-pre-wrap">
                {envExampleText}
              </pre>
            </div>
          )}

          {activeTab === 'readme' && (
            <div className="space-y-4 font-sans text-xs text-white/80">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <h4 className="font-semibold text-white text-sm">Configurando HTTPS com Nginx & Let's Encrypt (Certbot)</h4>
                <p className="text-white/60 text-[11px]">
                  Para que o frontend com SSL possa se conectar sem erros de bloqueio de conteúdo misto (Mixed Content):
                </p>
                <pre className="p-3 bg-black/40 rounded-xl border border-white/10 font-mono text-[11px] text-white/90 overflow-x-auto">
{`sudo apt install -y nginx certbot python3-certbot-nginx

# Configure o Nginx para redirecionar para a porta 8000 com suporte a WebSocket:
# proxy_pass http://127.0.0.1:8000;
# proxy_set_header Upgrade $http_upgrade;
# proxy_set_header Connection "upgrade";

# Gere o SSL com Certbot:
sudo certbot --nginx -d monitor-api.seudominio.com`}
                </pre>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <h4 className="font-semibold text-white text-sm">Liberando CORS para o Frontend</h4>
                <p className="text-white/60 text-[11px]">
                  No arquivo <code className="text-blue-300 font-mono">/opt/server-monitor/.env</code>, defina:
                </p>
                <pre className="p-3 bg-black/40 rounded-xl border border-white/10 font-mono text-[11px] text-emerald-300">
CORS_ORIGINS=https://meu-dashboard.vercel.app,https://meu-dominio.com
                </pre>
                <p className="text-white/60 text-[11px]">
                  Depois reinicie com <code className="text-blue-300 font-mono">sudo systemctl restart server-monitor</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition border border-white/15"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
