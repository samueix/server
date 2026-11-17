/**
 * Serviço de Autenticação e Sessão do Server Panel
 * 
 * Comunica-se com o endpoint oficial do backend FastAPI:
 * GET /api/auth/verify
 * 
 * Suporta HTTP Basic Auth (usuário/senha), Bearer token ou X-API-Key.
 */

const AUTH_STORAGE_KEY = 'server_panel_auth_v1';
const REMEMBER_KEY = 'server_panel_remember_v1';

export interface AuthSession {
  authenticated: boolean;
  user: string;
  role: 'admin' | 'user';
  authHeader?: string;
  apiKey?: string;
  authType: 'basic' | 'bearer' | 'apikey';
  savedAt: string;
  expiresAt?: number; // epoch ms, 10 min inactivity
  remember?: boolean;
}

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutos

export function getRememberPreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1';
  } catch { return false; }
}

export function setRememberPreference(remember: boolean): void {
  try {
    if (remember) localStorage.setItem(REMEMBER_KEY, '1');
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {}
}

export function isSessionExpired(session: AuthSession | null): boolean {
  if (!session) return true;
  if (session.expiresAt && Date.now() > session.expiresAt) return true;
  return false;
}

function getActiveStorageForSession(session: any): Storage {
  // sessão "lembrada" persiste em localStorage; caso contrário sessionStorage
  if (session && session.remember) return localStorage;
  // compat: se preferência global de lembrar está ativa e sessão veio do localStorage, manter
  return sessionStorage;
}

export function touchAuthSession(): void {
  const s = getStoredAuthInternal();
  if (s && s.authenticated) {
    s.expiresAt = Date.now() + SESSION_TTL_MS;
    try {
      const storage = s.remember ? localStorage : sessionStorage;
      storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
    } catch {}
  }
}

function getStoredAuthInternal(): AuthSession | null {
  try {
    // 1) sessionStorage primeiro (sessão atual)
    let raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    let fromRemembered = false;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.authenticated) return parsed;
    }
    // 2) sessão lembrada (localStorage) apenas se preferência estiver ativa
    if (getRememberPreference()) {
      raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.authenticated) {
          parsed.remember = true;
          // mantém em localStorage e espelha em sessionStorage para uso rápido
          try { sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed)); } catch {}
          return parsed;
        }
      }
    } else {
      // sem preferência de lembrar, limpa resquícios antigos
      try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
    }
  } catch (e) {}
  return null;
}

/**
 * Lê a sessão salva (sessionStorage ou sessão lembrada)
 */
export function getStoredAuth(): AuthSession | null {
  const s = getStoredAuthInternal();
  if (!s) return null;
  if (isSessionExpired(s)) {
    clearAuthSession();
    return null;
  }
  return s;
}

/**
 * Salva a sessão (sessionStorage por padrão; localStorage se "lembrar sessão")
 */
export function saveAuthSession(session: AuthSession, remember = false): void {
  try {
    if (!session.expiresAt) session.expiresAt = Date.now() + SESSION_TTL_MS;
    session.remember = remember;
    setRememberPreference(remember);
    const payload = JSON.stringify(session);
    // limpa ambos e grava no destino correto
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, payload);
      sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
    }
  } catch (e) {
    console.error('Erro ao salvar autenticação', e);
  }
}

/**
 * Remove a sessão e efetua logout
 */
export function clearAuthSession(): void {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    // não remove REMEMBER_KEY para manter a preferência do usuário no formulário
  } catch (e) {
    console.error('Erro ao limpar autenticação', e);
  }
}

let isHandling401 = false;
/**
 * Emite evento de 401 (sessão expirada) uma única vez para evitar loop
 */
export function notifyUnauthorized(message = 'Sessão expirada. Faça login novamente.'): void {
  if (isHandling401) return;
  isHandling401 = true;
  clearAuthSession();
  window.dispatchEvent(new CustomEvent('server-panel:unauthorized', { detail: { message } }));
  setTimeout(() => {
    isHandling401 = false;
  }, 3000);
}

/**
 * Retorna os headers de autenticação a serem injetados em requisições HTTP
 */
export function getAuthHeaders(): Record<string, string> {
  const session = getStoredAuth();
  if (!session) return {};

  const headers: Record<string, string> = {};

  if (session.authHeader) {
    headers['Authorization'] = session.authHeader;
  }
  if (session.apiKey) {
    headers['X-API-Key'] = session.apiKey;
  }

  return headers;
}

/**
 * Executa verificação de credenciais no endpoint GET /api/auth/verify
 */
export async function verifyCredentialsWithServer(
  options: {
    username?: string;
    password?: string;
    apiKey?: string;
    remember?: boolean;
  }
): Promise<{ success: boolean; user?: string; role?: 'admin' | 'user'; error?: string }> {
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  let authHeader: string | undefined;
  let authType: 'basic' | 'bearer' | 'apikey' = 'basic';
  let tokenKey = options.apiKey;

  if (options.username && options.password) {
    authHeader = `Basic ${btoa(`${options.username}:${options.password}`)}`;
    headers['Authorization'] = authHeader;
    authType = 'basic';
  } else if (options.apiKey) {
    authHeader = `Bearer ${options.apiKey}`;
    headers['Authorization'] = authHeader;
    headers['X-API-Key'] = options.apiKey;
    authType = 'apikey';
  } else {
    return { success: false, error: 'Informe usuário e senha ou uma chave de API.' };
  }

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000)
    });

    if (res.status === 401 || res.status === 403) {
      return { success: false, error: 'Credenciais inválidas. Verifique o usuário e a senha.' };
    }

    if (!res.ok) {
      return { 
        success: false, 
        error: `O servidor respondeu com erro HTTP ${res.status}. Verifique se o backend está ativo.` 
      };
    }

    const data = await res.json();
    const rawRole = (data.role || '').toString().trim().toLowerCase();
    const username = data.user || options.username || (rawRole === 'admin' ? 'admin' : 'user');
    const role: 'admin' | 'user' = rawRole === 'admin' || (!rawRole && username.trim().toLowerCase() === 'admin') ? 'admin' : 'user';

    const session: AuthSession = {
      authenticated: true,
      user: username,
      role,
      authHeader,
      apiKey: tokenKey,
      authType,
      savedAt: new Date().toISOString(),
      expiresAt: Date.now() + SESSION_TTL_MS
    };

    saveAuthSession(session, Boolean(options.remember));

    return {
      success: true,
      user: username,
      role
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Tempo esgotado ao contatar o servidor. Verifique a conexão com o Ubuntu Server.' };
    }
    return { success: false, error: err.message || 'Falha de comunicação com o servidor.' };
  }
}
