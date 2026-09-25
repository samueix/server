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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) {
      setError('Por favor, digite a senha mestre.');
      return;
    }

    const success = unlock(password);
    if (success) {
      setIsSuccess(true);
      setError(null);
    } else {
      setError('Senha mestre incorreta. Acesso negado.');
      inputRef.current?.select();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onKeyDown={handleKeyDown}
    >
      <div 
        className="w-full max-w-md rounded-3xl bg-[#0f172a] border border-blue-500/30 p-6 shadow-2xl shadow-blue-950/50 text-white relative overflow-hidden"
      >
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Cofre de Segurança</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                ACESSO RESTRITO
              </span>
            </h3>
            <p className="text-xs text-white/60 mt-0.5">
              {modalReason}
            </p>
          </div>
        </div>

        {/* Informational warning */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-white/70 mb-5 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            As senhas do sistema (SSH, AdGuard e chaves da infraestrutura) estão sob custódia criptográfica. Digite a senha mestre para desbloquear a visualização e cópia.
          </span>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5">
              Senha Mestre do Administrador
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
                className="w-full px-4 py-3 pr-11 rounded-2xl bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 font-mono transition"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/40 hover:text-white transition"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Desbloqueado com sucesso!</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5 active:scale-95"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Desbloquear Senhas</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
