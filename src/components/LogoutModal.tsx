import React from 'react';
import { LogOut, ShieldAlert, X } from 'lucide-react';
import { AuthSession } from '../services/authService';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLogout: () => void;
  session: AuthSession | null;
  serverIp: string;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({
  isOpen,
  onClose,
  onConfirmLogout,
  session,
  serverIp
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-md rounded-2xl bg-[#0b1324] border border-slate-800 shadow-2xl p-6 text-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Deslogar do Servidor</h3>
              <p className="text-[11px] text-slate-400 font-mono">Encerrar sessão de telemetria</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Tem certeza de que deseja encerrar a sessão de administração? As credenciais salvas neste navegador serão removidas e você precisará se autenticar novamente para visualizar a telemetria do Ubuntu Server.
          </p>

          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Usuário:</span>
              <span className="text-white font-semibold">{session?.user || 'admin'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tipo de Autenticação:</span>
              <span className="text-blue-400">
                {session?.authType === 'basic' ? 'Usuário / Senha (Basic)' : 'Chave de API / Bearer'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Servidor Alvo:</span>
              <span className="text-slate-300">{serverIp}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition border border-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmLogout}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Confirmar e Deslogar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
