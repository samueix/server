import React from 'react';
import { LogOut, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1A2E]/60 select-none">
      <div className="w-full max-w-md rounded-xl bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] p-6 text-[#1A1A2E] relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#1A1A2E]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-[#FEE4E2] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center text-[#F04438]">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Deslogar do servidor</h3>
              <p className="text-xs text-[#4A4A68] font-mono">Encerrar sessão de telemetria</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md border-2 border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#FFF7E8] transition shadow-[1px_1px_0px_#1A1A2E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs">
          <p className="text-[#4A4A68] font-medium leading-relaxed">
            Tem certeza de que deseja encerrar a sessão? As credenciais salvas neste navegador serão removidas e você precisará se autenticar novamente para visualizar o painel.
          </p>

          <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-[#4A4A68]">Usuário:</span>
              <span className="text-[#1A1A2E] font-bold">{session?.user || 'admin'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4A4A68]">Tipo de autenticação:</span>
              <span className="text-[#FF5A36] font-bold">
                {session?.authType === 'basic' ? 'Usuário / Senha (Basic)' : 'Chave de API / Bearer'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4A4A68]">Servidor alvo:</span>
              <span className="text-[#1A1A2E] font-bold">{serverIp}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-[#1A1A2E]/20">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-md bg-[#FFF7E8] hover:bg-white text-[#1A1A2E] text-xs font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmLogout}
            className="px-4 py-2 rounded-md bg-[#F04438] hover:bg-[#d63428] text-white text-xs font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Confirmar e deslogar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
