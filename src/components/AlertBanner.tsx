import React, { useState } from 'react';
import { Flame, Cpu, Layers, X, AlertTriangle, History, Trash2, Clock } from 'lucide-react';
import { NavigationTab, AlertHistoryItem } from '../types';

export interface ActiveAlert {
  id: 'cpu' | 'ram' | 'temp';
  level: 'warning' | 'critical';
  title: string;
  message: string;
  value: string;
  threshold: string;
  tabTarget: NavigationTab;
}

interface AlertBannerProps {
  alerts: ActiveAlert[];
  alertHistory?: AlertHistoryItem[];
  onDismissAlert?: (id: string) => void;
  onSelectTab?: (tab: NavigationTab) => void;
  onClearAlertHistory?: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  alertHistory = [],
  onDismissAlert,
  onSelectTab,
  onClearAlertHistory
}) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  if ((!alerts || alerts.length === 0) && alertHistory.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* Active Alerts */}
      {alerts.map((alert) => {
        const isCritical = alert.level === 'critical';

        const getIcon = () => {
          switch (alert.id) {
            case 'temp':
              return <Flame className={`w-5 h-5 shrink-0 ${isCritical ? 'text-[#F04438]' : 'text-[#F79009]'}`} />;
            case 'cpu':
              return <Cpu className={`w-5 h-5 shrink-0 ${isCritical ? 'text-[#F04438]' : 'text-[#F79009]'}`} />;
            case 'ram':
              return <Layers className={`w-5 h-5 shrink-0 ${isCritical ? 'text-[#F04438]' : 'text-[#F79009]'}`} />;
            default:
              return <AlertTriangle className="w-5 h-5 shrink-0 text-[#F79009]" />;
          }
        };

        const bgStyles = isCritical
          ? 'bg-[#FEE4E2] border-2 border-[#F04438] shadow-[3px_3px_0px_#F04438]'
          : 'bg-[#FEF0C7] border-2 border-[#F79009] shadow-[3px_3px_0px_#F79009]';

        const badgeStyles = isCritical
          ? 'text-[#F04438] bg-white border border-[#F04438]'
          : 'text-[#F79009] bg-white border border-[#F79009]';

        return (
          <div
            key={alert.id}
            role="alert"
            aria-live="polite"
            className={`p-3.5 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#1A1A2E] ${bgStyles}`}
          >
            <div className="flex items-center gap-3">
              {getIcon()}

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm font-title text-[#1A1A2E]">
                    {alert.title}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${badgeStyles}`}>
                    {isCritical ? 'Alerta crítico' : 'Atenção'}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#1A1A2E]">
                    Valor: <strong className="underline">{alert.value}</strong> (limite: {alert.threshold})
                  </span>
                </div>
                <p className="text-xs text-[#4A4A68] font-medium mt-0.5 leading-relaxed">
                  {alert.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {alertHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(true)}
                  className="px-2.5 py-1.5 rounded-md bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs font-bold text-[#1A1A2E] shadow-[1.5px_1.5px_0px_#1A1A2E] flex items-center gap-1 transition"
                  title="Ver histórico de alertas desta sessão"
                  aria-label="Ver histórico de alertas"
                >
                  <History className="w-3.5 h-3.5 text-[#FF5A36]" />
                  <span className="hidden sm:inline">Histórico ({alertHistory.length})</span>
                </button>
              )}

              {onSelectTab && (
                <button
                  onClick={() => onSelectTab(alert.tabTarget)}
                  className="px-3 py-1.5 rounded-md bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs font-bold text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                >
                  Inspecionar
                </button>
              )}

              {onDismissAlert && (
                <button
                  onClick={() => onDismissAlert(alert.id)}
                  className="p-1.5 rounded-md border-2 border-[#1A1A2E] bg-white text-[#1A1A2E] hover:bg-[#FFF7E8] transition shadow-[1px_1px_0px_#1A1A2E]"
                  title="Dispensar aviso por agora"
                  aria-label="Dispensar alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal Histórico dos últimos 20 alertas */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1A2E]/60">
          <div className="w-full max-w-xl rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden flex flex-col max-h-[80vh] font-sans text-[#1A1A2E]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#1A1A2E] bg-[#FFF7E8]">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#FF5A36]" />
                <h3 className="font-bold font-title text-sm">Histórico de Alertas da Sessão (Últimas 20 ocorrências)</h3>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 rounded-md border border-[#1A1A2E] bg-white hover:bg-[#FFF7E8]"
                aria-label="Fechar histórico"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 text-xs">
              {alertHistory.length === 0 ? (
                <p className="text-center text-[#717188] py-6">Nenhum alerta registrado nesta sessão.</p>
              ) : (
                alertHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8]/50 shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1A1A2E]">{item.title}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-bold ${
                          item.level === 'critical' ? 'bg-[#FEE4E2] text-[#F04438] border-[#F04438]' : 'bg-[#FEF0C7] text-[#F79009] border-[#F79009]'
                        }`}>
                          {item.value} (limite {item.threshold})
                        </span>
                      </div>
                      <p className="text-[11px] text-[#4A4A68] mt-0.5">{item.message}</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#717188] shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.timestamp}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t-2 border-[#1A1A2E] bg-[#FFF7E8] flex justify-between items-center text-xs">
              {onClearAlertHistory && alertHistory.length > 0 ? (
                <button
                  onClick={() => {
                    onClearAlertHistory();
                    setIsHistoryOpen(false);
                  }}
                  className="flex items-center gap-1.5 text-[#F04438] hover:underline font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar histórico</span>
                </button>
              ) : <span />}
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-4 py-1.5 rounded-md bg-[#1A1A2E] text-white font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
