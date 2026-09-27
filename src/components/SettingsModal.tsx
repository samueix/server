import React, { useState } from 'react';
import { X, Save, CheckCircle2, AlertCircle, RefreshCw, Shield, Server } from 'lucide-react';
import { loadConfig, saveConfig, AppConfig, DEFAULT_CONFIG, API } from '../config';
import { getAuthHeaders } from '../services/authService';

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
  const [cpuThreshold, setCpuThreshold] = useState(currentConfig.cpuThreshold ?? 80);
  const [ramThreshold, setRamThreshold] = useState(currentConfig.ramThreshold ?? 85);
  const [tempThreshold, setTempThreshold] = useState(currentConfig.tempThreshold ?? 75);
  const [refreshInterval, setRefreshInterval] = useState(currentConfig.refreshIntervalSeconds ?? 3);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Testando endpoints relativos do Nginx (/api/system e /adguard-api/status)...');

    try {
      // 1. Testa o endpoint do FastAPI (/api/system)
      const authHeaders = getAuthHeaders();
      const apiRes = await fetch('/api/system', {
        method: 'GET',
        headers: { 
          'Accept': 'application/json',
          ...authHeaders
        },
        signal: AbortSignal.timeout(4000)
      });

      if (!apiRes.ok) {
        throw new Error(`Endpoint /api/system respondeu com status HTTP ${apiRes.status}`);
      }

      const apiData = await apiRes.json();

      // 2. Testa o proxy do AdGuard Home (/adguard-api/status)
      let adguardMsg = '';
      try {
        const adguardRes = await fetch(`${API.adguard}/status`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        });
        if (adguardRes.ok) {
          const adguardData = await adguardRes.json();
          adguardMsg = ` • AdGuard Home ${adguardData.version || 'Online'}`;
        }
      } catch {
        adguardMsg = ' • AdGuard Home offline ou aguardando proxy';
      }

      setTestStatus('success');
      const hostname = apiData.system?.hostname || apiData.hostname || apiData.servidor || 'samuelserver';
      setTestMessage(`Conectado com sucesso via Nginx! Servidor: ${hostname}${adguardMsg}`);
    } catch (err: any) {
      setTestStatus('error');
      if (err.name === 'AbortError') {
        setTestMessage('Tempo esgotado (timeout 4s). Verifique se o Nginx e o FastAPI estão ativos.');
      } else {
        setTestMessage(err.message || 'Falha ao conectar via Nginx.');
      }
    }
  };

  const handleSave = () => {
    const newConfig: AppConfig = {
      cpuThreshold: Number(cpuThreshold) || 80,
      ramThreshold: Number(ramThreshold) || 85,
      tempThreshold: Number(tempThreshold) || 75,
      refreshIntervalSeconds: Number(refreshInterval) || 3,
      serverIpv6: currentConfig.serverIpv6 || DEFAULT_CONFIG.serverIpv6
    };
    saveConfig(newConfig);
    onSaved();
    onClose();
  };

  const handleResetDefault = () => {
    setCpuThreshold(DEFAULT_CONFIG.cpuThreshold ?? 80);
    setRamThreshold(DEFAULT_CONFIG.ramThreshold ?? 85);
    setTempThreshold(DEFAULT_CONFIG.tempThreshold ?? 75);
    setRefreshInterval(DEFAULT_CONFIG.refreshIntervalSeconds ?? 3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none transition-all">
      <div className="w-full max-w-lg rounded-2xl bg-[#0f172a] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0b1324]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-950/60 flex items-center justify-center text-blue-400 border border-blue-800/80">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-white">
                Configurações da Infraestrutura
              </h2>
              <span className="text-[11px] text-slate-400">
                Rotas de Proxy Nginx e Limiares Operacionais
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          {/* Informação sobre Nginx e Autenticação */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300">
            <div className="flex items-center gap-2 text-blue-400 font-semibold mb-1">
              <Shield className="w-4 h-4" />
              <span>Arquitetura de Proxy Nginx (Mesma Origem)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Todas as requisições utilizam caminhos relativos ao domínio (<code className="text-slate-200">/api/</code> e <code className="text-slate-200">/adguard-api/</code>). O Nginx injeta silenciosamente as chaves e credenciais no backend local, eliminando problemas de CORS e exposição de senhas.
            </p>
          </div>

          {/* Teste de Conexão */}
          <div className="space-y-2">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
              <span>{testStatus === 'testing' ? 'Testando Proxies...' : 'Testar Conexão dos Proxies (/api e /adguard-api)'}</span>
            </button>

            {testStatus === 'success' && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-2 text-xs font-mono">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{testMessage}</span>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-start gap-2 text-xs font-mono">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{testMessage}</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 pt-3">
            <span className="text-xs font-semibold text-white block mb-3">Limiares de Alerta do NOC</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400 text-[11px] block">
                  Alerta de CPU (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={cpuThreshold}
                  onChange={(e) => setCpuThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 text-[11px] block">
                  Alerta de RAM (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={ramThreshold}
                  onChange={(e) => setRamThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 text-[11px] block">
                  Alerta de Temperatura (°C)
                </label>
                <input
                  type="number"
                  min="50"
                  max="95"
                  value={tempThreshold}
                  onChange={(e) => setTempThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 text-[11px] block">
                  Intervalo de Polling (segundos)
                </label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#0b1324]">
          <button
            onClick={handleResetDefault}
            className="text-xs text-slate-400 hover:text-white transition font-mono"
          >
            Restaurar Padrões
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
