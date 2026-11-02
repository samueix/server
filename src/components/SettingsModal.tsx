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

      let adguardMsg = '';
      try {
        const adguardRes = await fetch(`${API.adguard}/status`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        });
        if (adguardRes.ok) {
          const adguardData = await adguardRes.json();
          adguardMsg = ` | AdGuard Home ${adguardData.version || 'Online'}`;
        }
      } catch {
        adguardMsg = ' | AdGuard Home offline ou aguardando proxy';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1A2E]/60 select-none">
      <div className="w-full max-w-lg rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden flex flex-col max-h-[90vh] font-sans relative animate-in fade-in zoom-in-95 duration-150 text-[#1A1A2E]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[#1A1A2E] bg-[#FFF7E8]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-white border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center text-[#FF5A36]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-title text-[#1A1A2E]">
                Configurações da infraestrutura
              </h2>
              <span className="text-xs text-[#4A4A68] font-mono">
                Rotas de proxy Nginx e limiares operacionais
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md border-2 border-[#1A1A2E] bg-white flex items-center justify-center text-[#1A1A2E] hover:bg-[#FFF7E8] shadow-[1px_1px_0px_#1A1A2E] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          {/* Informação sobre Nginx e Autenticação */}
          <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E]">
            <div className="flex items-center gap-2 text-[#1A1A2E] font-bold mb-1">
              <Shield className="w-4 h-4 text-[#FF5A36]" />
              <span>Arquitetura de proxy Nginx</span>
            </div>
            <p className="text-xs text-[#4A4A68] leading-relaxed font-mono">
              Todas as requisições utilizam caminhos relativos (<code className="text-[#1A1A2E] font-bold bg-white px-1 py-0.5 rounded border border-[#1A1A2E]/20">/api/</code> e <code className="text-[#1A1A2E] font-bold bg-white px-1 py-0.5 rounded border border-[#1A1A2E]/20">/adguard-api/</code>). O Nginx injeta silenciosamente as chaves e credenciais no backend local.
            </p>
          </div>

          {/* Teste de Conexão */}
          <div className="space-y-2">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className="w-full py-2.5 rounded-md bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-bold shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center gap-2 transition disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF5A36] ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
              <span>{testStatus === 'testing' ? 'Testando proxies...' : 'Testar conexão dos proxies (/api e /adguard-api)'}</span>
            </button>

            {testStatus === 'success' && (
              <div className="p-3 rounded-lg bg-[#D1FADF] border-2 border-[#12B76A] text-[#12B76A] flex items-start gap-2 text-xs font-mono font-bold">
                <CheckCircle2 className="w-4 h-4 text-[#12B76A] shrink-0 mt-0.5" />
                <span>{testMessage}</span>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="p-3 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-[#F04438] flex items-start gap-2 text-xs font-mono font-bold">
                <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0 mt-0.5" />
                <span>{testMessage}</span>
              </div>
            )}
          </div>

          <div className="border-t-2 border-[#1A1A2E]/20 pt-4">
            <span className="text-xs font-bold font-title text-[#1A1A2E] block mb-3">Limiares de alerta</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[#4A4A68] text-xs font-bold block font-sans">
                  Alerta de CPU (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={cpuThreshold}
                  onChange={(e) => setCpuThreshold(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono text-xs focus:outline-none focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#4A4A68] text-xs font-bold block font-sans">
                  Alerta de RAM (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={ramThreshold}
                  onChange={(e) => setRamThreshold(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono text-xs focus:outline-none focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#4A4A68] text-xs font-bold block font-sans">
                  Alerta de temperatura (°C)
                </label>
                <input
                  type="number"
                  min="50"
                  max="95"
                  value={tempThreshold}
                  onChange={(e) => setTempThreshold(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono text-xs focus:outline-none focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#4A4A68] text-xs font-bold block font-sans">
                  Intervalo de atualização (segundos)
                </label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] font-mono text-xs focus:outline-none focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t-2 border-[#1A1A2E] bg-[#FFF7E8]">
          <button
            onClick={handleResetDefault}
            className="text-xs text-[#4A4A68] hover:text-[#1A1A2E] underline font-semibold transition font-mono"
          >
            Restaurar padrões
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-md text-xs font-bold text-[#1A1A2E] bg-white hover:bg-[#FFF7E8] transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-md text-xs font-bold bg-[#FF5A36] hover:bg-[#E04522] text-white transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar alterações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
