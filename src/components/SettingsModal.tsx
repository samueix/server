import React, { useState } from 'react';
import { X, Save, CheckCircle2, AlertCircle, RefreshCw, Key, Shield, Server } from 'lucide-react';
import { loadConfig, saveConfig, AppConfig, DEFAULT_CONFIG } from '../config';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const currentConfig = loadConfig();
  const [apiUrl, setApiUrl] = useState(currentConfig.API_URL);
  const [apiKey, setApiKey] = useState(currentConfig.API_KEY);
  const [cpuThreshold, setCpuThreshold] = useState(currentConfig.cpuThreshold ?? 80);
  const [ramThreshold, setRamThreshold] = useState(currentConfig.ramThreshold ?? 85);
  const [tempThreshold, setTempThreshold] = useState(currentConfig.tempThreshold ?? 75);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Testando conexão com o Ubuntu Server...');

    const cleanUrl = apiUrl.trim().replace(/\/+$/, '');

    const controller1 = new AbortController();
    const t1 = setTimeout(() => controller1.abort(), 6000);

    try {
      // Testa o endpoint raiz /
      const rootRes = await fetch(`${cleanUrl}/`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller1.signal
      });
      clearTimeout(t1);

      if (!rootRes.ok) {
        throw new Error(`Servidor respondeu com status HTTP ${rootRes.status}`);
      }

      // Testa a autenticação com X-API-Key em /api/status
      const controller2 = new AbortController();
      const t2 = setTimeout(() => controller2.abort(), 6000);

      const statusRes = await fetch(`${cleanUrl}/api/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey.trim()
        },
        signal: controller2.signal
      });
      clearTimeout(t2);

      if (statusRes.status === 401) {
        setTestStatus('error');
        setTestMessage('API online, mas a API Key foi rejeitada (401). Verifique a chave no servidor.');
        return;
      }

      if (!statusRes.ok) {
        setTestStatus('error');
        setTestMessage(`Erro HTTP ${statusRes.status} no endpoint /api/status`);
        return;
      }

      const statusData = await statusRes.json();
      setTestStatus('success');
      setTestMessage(`Conectado com sucesso! Servidor: ${statusData.servidor || 'samuelserver'}`);
    } catch (err: any) {
      clearTimeout(t1);
      setTestStatus('error');
      if (err.name === 'AbortError') {
        setTestMessage('Tempo de conexão esgotado (timeout 6s).');
      } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        setTestMessage('Bloqueio pelo navegador (Private Network Access / CORS).');
      } else {
        setTestMessage(err.message || 'Falha ao conectar.');
      }
    }
  };

  const handleSave = () => {
    const newConfig: AppConfig = {
      API_URL: apiUrl.trim().replace(/\/+$/, ''),
      API_KEY: apiKey.trim(),
      cpuThreshold: Number(cpuThreshold) || 80,
      ramThreshold: Number(ramThreshold) || 85,
      tempThreshold: Number(tempThreshold) || 75,
      adguardUrl: currentConfig.adguardUrl || DEFAULT_CONFIG.adguardUrl,
      serverIpv6: currentConfig.serverIpv6 || DEFAULT_CONFIG.serverIpv6
    };
    saveConfig(newConfig);
    onSaved();
    onClose();
  };

  const handleResetDefault = () => {
    setApiUrl(DEFAULT_CONFIG.API_URL);
    setApiKey(DEFAULT_CONFIG.API_KEY);
    setCpuThreshold(DEFAULT_CONFIG.cpuThreshold ?? 80);
    setRamThreshold(DEFAULT_CONFIG.ramThreshold ?? 85);
    setTempThreshold(DEFAULT_CONFIG.tempThreshold ?? 75);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none transition-all">
      <div className="w-full max-w-lg rounded-3xl apple-glass-dark border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-blue-300 border border-white/15">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-white">
                Configurações da Conexão
              </h2>
              <span className="text-[11px] text-white/50">
                Parâmetros de comunicação REST com o host
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto text-xs font-mono">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/80 font-sans">
            <div className="flex items-center gap-2 text-blue-300 font-semibold mb-0.5">
              <Shield className="w-4 h-4" />
              <span>Autenticação por Cabeçalho HTTP</span>
            </div>
            <p className="text-[11px] text-white/60">
              As consultas enviam <code>X-API-Key</code> em cada requisição REST para o endpoint FastAPI.
            </p>
          </div>

          {/* URL da API */}
          <div className="space-y-1.5">
            <label className="text-white font-medium block flex items-center gap-1.5 font-sans text-xs">
              Endereço da API (URL Base)
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://192.168.100.23:8000"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-black/30 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 font-mono text-xs transition"
            />
            <span className="text-[11px] text-white/50 block font-sans">
              Exemplo da rede local: http://192.168.100.23:8000
            </span>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-white font-medium block flex items-center gap-1.5 font-sans text-xs">
              Chave de Acesso (X-API-Key)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-black/30 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 font-mono text-xs transition"
            />
            <span className="text-[11px] text-white/50 block font-sans">
              Chave cadastrada no script Python do servidor.
            </span>
          </div>

          {/* Limiares de Alerta do Sistema */}
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3 font-sans">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium text-xs">Limiares de Alerta Automático</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Gatilhos Visuais
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-white/70 block text-[11px]">CPU Máx (%)</label>
                <input
                  type="number"
                  min="20"
                  max="100"
                  value={cpuThreshold}
                  onChange={(e) => setCpuThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-white/70 block text-[11px]">RAM Máx (%)</label>
                <input
                  type="number"
                  min="20"
                  max="100"
                  value={ramThreshold}
                  onChange={(e) => setRamThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-white/70 block text-[11px]">Temp Máx (°C)</label>
                <input
                  type="number"
                  min="40"
                  max="110"
                  value={tempThreshold}
                  onChange={(e) => setTempThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
            <span className="text-[11px] text-white/50 block">
              Notificações e banners no topo serão disparados quando os recursos ultrapassarem estes limites.
            </span>
          </div>

          {/* Teste de Conexão */}
          <div className="p-4 bg-black/25 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium font-sans">Diagnóstico de Comunicação</span>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 font-medium transition flex items-center gap-1.5 text-xs disabled:opacity-50 font-sans shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-300 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
                Testar Conexão
              </button>
            </div>

            {testStatus === 'success' && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-2.5 text-xs font-sans">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{testMessage}</span>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-2.5 text-xs font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{testMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <button
            onClick={handleResetDefault}
            className="text-xs text-white/50 hover:text-white transition underline font-mono"
          >
            Restaurar Padrão
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-2xl text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-medium text-xs transition flex items-center gap-1.5 shadow-lg shadow-blue-500/25"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
