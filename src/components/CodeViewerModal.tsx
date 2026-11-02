import React, { useState } from 'react';
import { X, Copy, Check, Terminal } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none">
      <div className="relative w-full max-w-3xl rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[8px_8px_0px_#1A1A2E] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#1A1A2E] bg-[#FFF7E8]">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-[#FF5A36] shrink-0" />
            <div>
              <h2 className="text-sm font-bold font-title text-[#1A1A2E]">Instalação e scripts do Ubuntu Server</h2>
              <p className="text-xs text-[#4A4A68]">Comandos operacionais para o servidor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-[#1A1A2E] hover:bg-[#F04438] hover:text-white border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-5 pt-3 pb-2.5 border-b-2 border-[#1A1A2E] bg-[#FFF7E8] text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('install')}
            className={`px-3 py-1.5 rounded-md font-bold transition whitespace-nowrap border-2 border-[#1A1A2E] ${
              activeTab === 'install'
                ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E]'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            Instalador (install.sh)
          </button>
          <button
            onClick={() => setActiveTab('curl')}
            className={`px-3 py-1.5 rounded-md font-bold transition whitespace-nowrap border-2 border-[#1A1A2E] ${
              activeTab === 'curl'
                ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E]'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            Comandos curl
          </button>
          <button
            onClick={() => setActiveTab('systemd')}
            className={`px-3 py-1.5 rounded-md font-bold transition whitespace-nowrap border-2 border-[#1A1A2E] ${
              activeTab === 'systemd'
                ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E]'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            systemd service
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-3 py-1.5 rounded-md font-bold transition whitespace-nowrap border-2 border-[#1A1A2E] ${
              activeTab === 'env'
                ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E]'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            .env de configuração
          </button>
          <button
            onClick={() => setActiveTab('readme')}
            className={`px-3 py-1.5 rounded-md font-bold transition whitespace-nowrap border-2 border-[#1A1A2E] ${
              activeTab === 'readme'
                ? 'bg-[#FF5A36] text-white shadow-[2px_2px_0px_#1A1A2E]'
                : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'
            }`}
          >
            Guia HTTPS
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-3.5 font-mono text-xs">
          {activeTab === 'install' && (
            <div className="space-y-3">
              <div className="p-3 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-[#1A1A2E] font-sans text-xs shadow-[2px_2px_0px_#1A1A2E]">
                O arquivo <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-bold">install.sh</code> cria o venv em <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[#1A1A2E] font-bold">/opt/server-monitor</code>, instala as dependências do FastAPI e configura o serviço systemd.
              </div>

              <div>
                <div className="flex items-center justify-between text-[#4A4A68] text-xs mb-1.5 font-sans font-semibold">
                  <span>Comando de instalação no Ubuntu:</span>
                  <button
                    onClick={() => copyToClipboard(installScriptCmd, 'install')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white hover:bg-[#FFC857] text-[#1A1A2E] transition border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] font-bold"
                  >
                    {copiedKey === 'install' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'install' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-[#FFF7E8] rounded-lg border-2 border-[#1A1A2E] text-[#1A1A2E] overflow-x-auto leading-relaxed shadow-[2px_2px_0px_#1A1A2E]">
                  {installScriptCmd}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[#4A4A68] text-xs mb-1.5 font-sans font-semibold">
                  <span>Comandos de teste no terminal:</span>
                  <button
                    onClick={() => copyToClipboard(curlTestCmd, 'curl')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white hover:bg-[#FFC857] text-[#1A1A2E] transition border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] font-bold"
                  >
                    {copiedKey === 'curl' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'curl' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-[#FFF7E8] rounded-lg border-2 border-[#1A1A2E] text-[#1A1A2E] overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-[2px_2px_0px_#1A1A2E]">
                  {curlTestCmd}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'systemd' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[#4A4A68] text-xs font-sans font-semibold mb-1">
                <span>Arquivo <code className="text-[#00A6FB] font-mono font-bold">/etc/systemd/system/server-monitor.service</code>:</span>
                <button
                  onClick={() => copyToClipboard(systemdServiceText, 'systemd')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white hover:bg-[#FFC857] text-[#1A1A2E] transition border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] font-bold"
                >
                  {copiedKey === 'systemd' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'systemd' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3.5 bg-[#FFF7E8] rounded-lg border-2 border-[#1A1A2E] text-[#1A1A2E] overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-[2px_2px_0px_#1A1A2E]">
                {systemdServiceText}
              </pre>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[#4A4A68] text-xs font-sans font-semibold mb-1">
                <span>Arquivo <code className="text-[#00A6FB] font-mono font-bold">/opt/server-monitor/.env</code>:</span>
                <button
                  onClick={() => copyToClipboard(envExampleText, 'env')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white hover:bg-[#FFC857] text-[#1A1A2E] transition border-2 border-[#1A1A2E] shadow-[1px_1px_0px_#1A1A2E] font-bold"
                >
                  {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'env' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3.5 bg-[#FFF7E8] rounded-lg border-2 border-[#1A1A2E] text-[#1A1A2E] overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-[2px_2px_0px_#1A1A2E]">
                {envExampleText}
              </pre>
            </div>
          )}

          {activeTab === 'readme' && (
            <div className="space-y-3 font-sans text-xs text-[#4A4A68]">
              <div className="p-3.5 bg-[#FFF7E8] rounded-lg border-2 border-[#1A1A2E] space-y-2 shadow-[2px_2px_0px_#1A1A2E]">
                <h4 className="font-bold font-title text-[#1A1A2E]">Configurando HTTPS com Nginx & Certbot</h4>
                <pre className="p-3 bg-white rounded-md border-2 border-[#1A1A2E] font-mono text-xs text-[#1A1A2E] overflow-x-auto shadow-[1px_1px_0px_#1A1A2E]">
{`sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d monitor.seudominio.com`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t-2 border-[#1A1A2E] bg-[#FFF7E8] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white hover:bg-[#FFC857] text-[#1A1A2E] font-bold text-xs transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
