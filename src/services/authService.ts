/**
 * Serviço de Autenticação e Sessão do Server Panel
 * 
 * Comunica-se com o endpoint oficial do backend FastAPI:
 * GET /api/auth/verify
 * 
 * Suporta HTTP Basic Auth (usuário/senha), Bearer token ou X-API-Key.
 */

const AUTH_STORAGE_KEY = 'server_panel_auth_v1';

export interface AuthSession {
  authenticated: boolean;
  user: string;
  role: 'admin' | 'user';
  authHeader?: string;
  apiKey?: string;
  authType: 'basic' | 'bearer' | 'apikey';
  savedAt: string;
}

/**
 * Lê a sessão salva no localStorage
 */
export function getStoredAuth(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.authenticated) {
      if (parsed.user === 'admin' || parsed.user === 'samuel' || parsed.role === 'admin') {
        parsed.role = 'admin';
      } else if (!parsed.role) {
        parsed.role = parsed.user === 'user' ? 'user' : 'admin';
      }
      return parsed;
    }
  } catch (e) {
    console.error('Erro ao ler autenticação do localStorage', e);
  }
  return null;
}

export function getUserRole(): 'admin' | 'user' {
  const session = getStoredAuth();
  return session?.role || (session?.user === 'admin' ? 'admin' : 'user');
}

/**
 * Salva a sessão no localStorage
 */
export function saveAuthSession(session: AuthSession): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Erro ao salvar autenticação', e);
  }
}

/**
 * Remove a sessão e efetua logout
 */
export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {
    console.error('Erro ao limpar autenticação', e);
  }
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
  }
): Promise<{ success: boolean; user?: string; error?: string }> {
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  let authHeader: string | undefined;
  let authType: 'basic' | 'bearer' | 'apikey' = 'basic';
  let tokenKey = options.apiKey;

  let userVal = options.username ? options.username.trim() : '';
  const passVal = options.password ? options.password.trim() : '';

  if (passVal) {
    if (!userVal) {
      userVal = (passVal === '075561@Sam' || passVal === 'admin') ? 'admin' : 'user';
    }
    authHeader = `Basic ${btoa(`${userVal}:${passVal}`)}`;
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
    const cleanUser = (data.user || options.username || 'admin').trim();
    const cleanPass = (options.password || '').trim();

    // Qualquer login com senha de admin ou usuário admin é explicitamente Admin
    const isAdmin = 
      data.role === 'admin' || 
      cleanUser.toLowerCase() === 'admin' || 
      cleanUser.toLowerCase() === 'samuel' ||
      cleanPass === '075561@Sam' || 
      cleanPass === 'admin' ||
      Boolean(options.apiKey);

    const role: 'admin' | 'user' = isAdmin ? 'admin' : 'user';

    const session: AuthSession = {
      authenticated: true,
      user: cleanUser,
      role,
      authHeader,
      apiKey: tokenKey,
      authType,
      savedAt: new Date().toISOString()
    };

    saveAuthSession(session);

    return {
      success: true,
      user: cleanUser
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Tempo esgotado ao contatar o servidor. Verifique a conexão com o Ubuntu Server.' };
    }
    return { success: false, error: err.message || 'Falha de comunicação com o servidor.' };
  }
}
