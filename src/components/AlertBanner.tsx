import React from 'react';
import { AlertTriangle, Flame, Cpu, Layers, X, ShieldAlert, ArrowRight } from 'lucide-react';
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
    <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
      {alerts.map((alert) => {
        const isCritical = alert.level === 'critical';

        const getIcon = () => {
          switch (alert.id) {
            case 'temp':
              return <Flame className={`w-5 h-5 ${isCritical ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`} />;
            case 'cpu':
              return <Cpu className={`w-5 h-5 ${isCritical ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`} />;
            case 'ram':
              return <Layers className={`w-5 h-5 ${isCritical ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`} />;
            default:
              return <AlertTriangle className="w-5 h-5 text-amber-300" />;
          }
        };

        const bgStyles = isCritical
          ? 'bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-transparent border-rose-500/30 text-rose-200'
          : 'bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-amber-500/30 text-amber-200';

        const badgeStyles = isCritical
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

        return (
          <div
            key={alert.id}
            className={`p-4 rounded-3xl apple-glass backdrop-blur-3xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl ${bgStyles} transition-all`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border backdrop-blur-xl ${badgeStyles}`}>
                {getIcon()}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-sm tracking-tight">
                    {alert.title}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badgeStyles}`}>
                    {isCritical ? 'Alerta Crítico' : 'Atenção'}
                  </span>
                  <span className="text-xs font-mono text-white/70">
                    Valor: <strong className="text-white font-bold">{alert.value}</strong> (limite: {alert.threshold})
                  </span>
                </div>
                <p className="text-xs text-white/70 mt-0.5 font-sans leading-relaxed">
                  {alert.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {onSelectTab && (
                <button
                  onClick={() => onSelectTab(alert.tabTarget)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-white font-medium transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>Inspecionar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {onDismissAlert && (
                <button
                  onClick={() => onDismissAlert(alert.id)}
                  className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition"
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
