import React, { createContext, useContext, useState, ReactNode } from 'react';
import { getAuthHeaders } from '../services/authService';

const VAULT_STORAGE_KEY = 'server_monitor_vault_session';

interface SecurityVaultContextType {
  isUnlocked: boolean;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  requestUnlock: (reason?: string, onSuccess?: () => void) => void;
  isModalOpen: boolean;
  modalReason: string;
  closeModal: () => void;
  sshUser: string | null;
  sshPassword: string | null;
}

const SecurityVaultContext = createContext<SecurityVaultContextType | undefined>(undefined);

export const SecurityVaultProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      const auth = sessionStorage.getItem('server_panel_auth_v1') || localStorage.getItem('server_panel_auth_v1');
      if (auth) {
        const parsedAuth = JSON.parse(auth);
        if (parsedAuth?.authenticated && (parsedAuth?.role === 'admin' || parsedAuth?.user === 'admin')) {
          return true;
        }
      }

      const saved = sessionStorage.getItem(VAULT_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        // Expira após 30 minutos
        if (Date.now() - data.unlockedAt < 30 * 60 * 1000) {
          return true;
        }
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
    return false;
  });

  const [sshUser, setSshUser] = useState<string | null>(null);
  const [sshPassword, setSshPassword] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalReason, setModalReason] = useState<string>('Acesso a dados confidenciais');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const unlock = async (password: string): Promise<boolean> => {
    try {
      const authHeaders = getAuthHeaders();
      const res = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(4000)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error('Muitas tentativas incorretas. Aguarde alguns minutos.');
        }
        if (res.status === 401) {
          throw new Error('Sessão expirada. Faça login novamente.');
        }
        return false;
      }

      const data = await res.json();
      if (data.ok || data.success) {
        setIsUnlocked(true);
        // Guarda unicamente no estado React da sessão do cofre (nunca em storage, nunca em log)
        setSshUser(data.sshUser || null);
        setSshPassword(data.sshPassword || null);
        try {
          sessionStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify({ unlockedAt: Date.now() }));
        } catch {}
        setIsModalOpen(false);
        if (pendingCallback) {
          pendingCallback();
          setPendingCallback(null);
        }
        return true;
      }
      return false;
    } catch (err: any) {
      if (err.message && err.message.includes('Muitas tentativas')) {
        throw err;
      }
      return false;
    }
  };

  const lock = () => {
    setIsUnlocked(false);
    setSshUser(null);
    setSshPassword(null);
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
        closeModal,
        sshUser,
        sshPassword
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
