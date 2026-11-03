import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Lock, Key, X, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSecurityVault } from '../context/SecurityVaultContext';

export const SecurityUnlockModal: React.FC = () => {
  const { isModalOpen, modalReason, unlock, closeModal } = useSecurityVault();
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isModalOpen) {
      setPassword('');
      setError(null);
      setIsSuccess(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) {
      setError('Por favor, digite a senha mestre.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const success = await unlock(password);
      if (success) {
        setIsSuccess(true);
        setError(null);
      } else {
        setError('Senha mestre incorreta. Acesso negado.');
        inputRef.current?.select();
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao validar senha com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A1A2E]/60 select-none"
      onKeyDown={handleKeyDown}
    >
      <div 
        className="w-full max-w-md rounded-xl bg-white border-2 border-[#1A1A2E] p-6 shadow-[6px_6px_0px_#1A1A2E] text-[#1A1A2E] relative animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Close button */}
        <button
          onClick={closeModal}
          className="absolute top-5 right-5 p-1 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] text-[#1A1A2E] hover:bg-white transition shadow-[1px_1px_0px_#1A1A2E]"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-[#1A1A2E]">
          <div className="w-10 h-10 rounded-lg bg-[#FFC857] border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center justify-center text-[#1A1A2E] shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-title text-[#1A1A2E] flex items-center gap-2">
              <span>Cofre de segurança</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FEE4E2] text-[#F04438] border border-[#F04438]">
                Acesso restrito
              </span>
            </h3>
            <p className="text-xs text-[#4A4A68] mt-0.5 font-medium">
              {modalReason}
            </p>
          </div>
        </div>

        {/* Informational warning */}
        <div className="p-3.5 rounded-lg bg-[#FFF7E8] border-2 border-[#1A1A2E] text-xs text-[#1A1A2E] mb-4 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-[#F79009] shrink-0 mt-0.5" />
          <span className="font-medium text-[#4A4A68]">
            As senhas do sistema (SSH, AdGuard e chaves da infraestrutura) estão sob custódia criptográfica. Digite a senha mestre para desbloquear.
          </span>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#1A1A2E] mb-1">
              Senha mestre do administrador
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Digite a senha mestre de acesso..."
                className="w-full px-3 py-2 pr-10 rounded-md bg-[#FFF7E8]/40 border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs focus:outline-none focus:bg-white focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] font-mono transition"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-[#4A4A68] hover:text-[#1A1A2E] transition"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="p-3 rounded-lg bg-[#FEE4E2] border-2 border-[#F04438] text-[#F04438] text-xs flex items-center gap-2 font-bold font-mono">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#F04438]" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded-lg bg-[#D1FADF] border-2 border-[#12B76A] text-[#12B76A] text-xs flex items-center gap-2 font-bold font-mono">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#12B76A]" />
              <span>Desbloqueado com sucesso</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-[#1A1A2E]/20">
            <button
              type="button"
              onClick={closeModal}
              className="px-3.5 py-2 rounded-md bg-[#FFF7E8] border-2 border-[#1A1A2E] hover:bg-white text-[#1A1A2E] text-xs font-bold transition shadow-[2px_2px_0px_#1A1A2E] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-md bg-[#FF5A36] hover:bg-[#E04522] text-white text-xs font-bold transition border-2 border-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{loading ? 'Verificando...' : 'Desbloquear senhas'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
