import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const MASTER_PASSWORD = '075561@Sam';
const VAULT_STORAGE_KEY = 'server_monitor_vault_session';

interface SecurityVaultContextType {
  isUnlocked: boolean;
  unlock: (password: string) => boolean;
  lock: () => void;
  requestUnlock: (reason?: string, onSuccess?: () => void) => void;
  isModalOpen: boolean;
  modalReason: string;
  closeModal: () => void;
}

const SecurityVaultContext = createContext<SecurityVaultContextType | undefined>(undefined);

export const SecurityVaultProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      // Se já estiver logado como administrador, libera o cofre automaticamente
      const auth = localStorage.getItem('server_panel_auth_v1');
      if (auth) {
        const parsedAuth = JSON.parse(auth);
        if (parsedAuth?.authenticated && (parsedAuth?.role === 'admin' || parsedAuth?.user === 'admin')) {
          return true;
        }
      }

      const saved = sessionStorage.getItem(VAULT_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        // Expire after 30 minutes
        if (Date.now() - data.unlockedAt < 30 * 60 * 1000) {
          return true;
        }
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
    return false;
  });

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalReason, setModalReason] = useState<string>('Acesso a dados confidenciais');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const unlock = (password: string): boolean => {
    if (password === MASTER_PASSWORD) {
      setIsUnlocked(true);
      try {
        sessionStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify({ unlockedAt: Date.now() }));
      } catch {
        // Ignore
      }
      setIsModalOpen(false);
      if (pendingCallback) {
        pendingCallback();
        setPendingCallback(null);
      }
      return true;
    }
    return false;
  };

  const lock = () => {
    setIsUnlocked(false);
    try {
      sessionStorage.removeItem(VAULT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const requestUnlock = (reason: string = 'Acesso a credenciais de infraestrutura', onSuccess?: () => void) => {
    if (isUnlocked) {
      if (onSuccess) onSuccess();
      return;
    }
    setModalReason(reason);
    if (onSuccess) {
      setPendingCallback(() => onSuccess);
    } else {
      setPendingCallback(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPendingCallback(null);
  };

  return (
    <SecurityVaultContext.Provider
      value={{
        isUnlocked,
        unlock,
        lock,
        requestUnlock,
        isModalOpen,
        modalReason,
        closeModal
      }}
    >
      {children}
    </SecurityVaultContext.Provider>
  );
};

export const useSecurityVault = (): SecurityVaultContextType => {
  const context = useContext(SecurityVaultContext);
  if (!context) {
    throw new Error('useSecurityVault deve ser utilizado dentro de SecurityVaultProvider');
  }
  return context;
};
