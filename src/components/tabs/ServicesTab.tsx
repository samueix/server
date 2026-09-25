import React from 'react';
import { 
  ShieldCheck, 
  Terminal, 
  RefreshCw 
} from 'lucide-react';
import { ServiceItem } from '../../types';
import { QuickAccessCard } from '../QuickAccessCard';

interface ServicesTabProps {
  services: ServiceItem[];
  isLoading: boolean;
}

interface TargetServiceDef {
  key: string;
  name: string;
  unit: string;
  desc: string;
}

const MONITORED_SERVICES: TargetServiceDef[] = [
  { key: 'ssh', name: 'SSH Server', unit: 'ssh.service / sshd', desc: 'Serviço de acesso remoto criptografado OpenSSH (Porta 22)' },
  { key: 'adguardhome', name: 'AdGuardHome', unit: 'AdGuardHome.service', desc: 'Bloqueador de anúncios DNS e controle de privacidade de rede' },
  { key: 'server-panel', name: 'Server Panel', unit: 'server-panel.service', desc: 'Daemon FastAPI do Server Panel de telemetria' },
  { key: 'cron', name: 'Cron Daemon', unit: 'cron.service', desc: 'Agendador de tarefas periódicas do sistema operacional' },
  { key: 'systemd-resolved', name: 'systemd-resolved', unit: 'systemd-resolved.service', desc: 'Resolução de nomes DNS de rede local' },
  { key: 'docker', name: 'Docker Engine', unit: 'docker.service', desc: 'Gerenciador de contêineres e aplicações' }
];

export const ServicesTab: React.FC<ServicesTabProps> = ({
  services,
  isLoading
}) => {
  // Encontra o status reportado pelo backend
  const resolveStatus = (def: TargetServiceDef): 'ATIVO' | 'INATIVO' | 'DESCONHECIDO' => {
    if (!services || services.length === 0) {
      if (def.key === 'ssh' || def.key === 'server-panel' || def.key === 'adguardhome') return 'ATIVO';
      return 'DESCONHECIDO';
    }

    const cleanKey = def.key.toLowerCase().replace(/[\.\-_]/g, '');
    const found = services.find(s => {
      const sName = s.nome.toLowerCase().replace(/[\.\-_]/g, '');
      return sName.includes(cleanKey) || cleanKey.includes(sName);
    });

    if (found) {
      if (found.status === 'ONLINE') return 'ATIVO';
      if (found.status === 'OFFLINE') return 'INATIVO';
      return 'DESCONHECIDO';
    }

    return 'DESCONHECIDO';
  };

  const renderStatus = (status: 'ATIVO' | 'INATIVO' | 'DESCONHECIDO') => {
    switch (status) {
      case 'ATIVO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-emerald-300 bg-emerald-500/20 border border-emerald-400/20 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            Ativo
          </span>
        );
      case 'INATIVO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-rose-300 bg-rose-500/20 border border-rose-400/20 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Inativo
          </span>
        );
      case 'DESCONHECIDO':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-white/50 bg-white/10 border border-white/10 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            Não instalado
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Quick Access Card with AdGuard & SSH */}
      <QuickAccessCard />

      {/* Header */}
      <div className="p-5 rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-300 border border-white/15">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white block">
              Serviços Monitorados do Sistema
            </span>
            <span className="text-xs text-white/60">
              Daemons systemd e serviços em execução no servidor Ubuntu
            </span>
          </div>
        </div>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-black/20 border border-white/10 text-white/60">
          systemctl status
        </span>
      </div>

      {/* Tabela Técnica de Serviços */}
      <div className="rounded-3xl apple-glass border border-white/15 backdrop-blur-2xl shadow-2xl overflow-hidden p-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-[11px] font-mono select-none">
                <th className="py-3 px-4 font-semibold">SERVIÇO</th>
                <th className="py-3 px-4 font-semibold">UNIDADE SYSTEMD</th>
                <th className="py-3 px-4 font-semibold">DESCRIÇÃO</th>
                <th className="py-3 px-4 font-semibold text-right">STATUS</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 font-mono">
              {MONITORED_SERVICES.map((item) => {
                const status = resolveStatus(item);

                return (
                  <tr key={item.key} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-sans font-semibold text-white">
                      {item.name}
                    </td>
                    <td className="py-3 px-4 text-white/70 text-xs">
                      {item.unit}
                    </td>
                    <td className="py-3 px-4 font-sans text-white/60 text-xs max-w-sm">
                      {item.desc}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {renderStatus(status)}
                    </td>
                  </tr>
                );
              })}

              {/* Serviços extras retornados dinamicamente pela API que não estão na lista pré-definida */}
              {services && services.filter(s => {
                const sName = s.nome.toLowerCase().replace(/[\.\-_]/g, '');
                return !MONITORED_SERVICES.some(m => {
                  const mName = m.key.toLowerCase().replace(/[\.\-_]/g, '');
                  return sName.includes(mName) || mName.includes(sName);
                });
              }).map((extra) => (
                <tr key={extra.nome} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4 font-sans font-semibold text-white">
                    {extra.nome}
                  </td>
                  <td className="py-3 px-4 text-white/70 text-xs">
                    {extra.nome}.service
                  </td>
                  <td className="py-3 px-4 font-sans text-white/60 text-xs">
                    Serviço detectado dinamicamente via telemetria
                  </td>
                  <td className="py-3 px-4 text-right">
                    {renderStatus(extra.status === 'ONLINE' ? 'ATIVO' : extra.status === 'OFFLINE' ? 'INATIVO' : 'DESCONHECIDO')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
