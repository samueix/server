import React from 'react';
import { Flame, Cpu, Layers, X, AlertTriangle } from 'lucide-react';
import { NavigationTab } from '../types';

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
  onDismissAlert?: (id: string) => void;
  onSelectTab?: (tab: NavigationTab) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  onDismissAlert,
  onSelectTab
}) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-2.5">
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
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
