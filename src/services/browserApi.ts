import { apiFetch } from './api';
import { getAuthHeaders, notifyUnauthorized } from './authService';

export type BrowserStatus = 'stopped' | 'starting' | 'running' | 'paused' | 'error';

export interface BrowserState {
  status: BrowserStatus;
  url: string;
  title: string;
  startedAt: string | null;
  lastActionAt: string | null;
  viewport: { width: number; height: number };
  clients: number;
  paused: boolean;
  fps: number;
  error: string | null;
}

export interface BrowserHistoryEntry {
  ts: string;
  type: string;
  detail: string;
}

interface BrowserResponse {
  success: boolean;
  state: BrowserState;
  error?: string;
}

async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...getAuthHeaders(),
    ...((init.headers as Record<string, string> | undefined) || {})
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    notifyUnauthorized();
    throw new Error('Sessão expirada ou sem permissão de administrador.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || `Falha na requisição (HTTP ${response.status}).`);
  }
  return data as T;
}

export const browserApi = {
  status: async (): Promise<BrowserState> => {
    const data = await apiFetch<BrowserResponse>('/api/browser/status');
    return data.state;
  },

  start: async (): Promise<BrowserState> => {
    const data = await request<BrowserResponse>('/api/browser/start', { method: 'POST' });
    return data.state;
  },

  stop: async (): Promise<BrowserState> => {
    const data = await request<BrowserResponse>('/api/browser/stop', { method: 'POST' });
    return data.state;
  },

  pause: async (): Promise<BrowserState> => {
    const data = await request<BrowserResponse>('/api/browser/pause', { method: 'POST' });
    return data.state;
  },

  resume: async (): Promise<BrowserState> => {
    const data = await request<BrowserResponse>('/api/browser/resume', { method: 'POST' });
    return data.state;
  },

  navigate: async (url: string): Promise<BrowserState> => {
    const data = await request<BrowserResponse>('/api/browser/navigate', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    return data.state;
  },

  history: async (): Promise<BrowserHistoryEntry[]> => {
    const data = await apiFetch<{ success: boolean; history: BrowserHistoryEntry[] }>(
      '/api/browser/history'
    );
    return data.history;
  },

  ticket: async (): Promise<{ ticket: string; expiresAt: string }> => {
    return request<{ success: boolean; ticket: string; expiresAt: string }>(
      '/api/browser/ws-ticket',
      { method: 'POST' }
    );
  },

  screenshot: async (): Promise<Blob> => {
    const response = await fetch('/api/browser/screenshot', {
      headers: { ...getAuthHeaders(), Accept: 'image/jpeg' }
    });
    if (response.status === 401 || response.status === 403) {
      notifyUnauthorized();
      throw new Error('Sessão expirada ou sem permissão de administrador.');
    }
    if (!response.ok) {
      throw new Error('Falha ao capturar o screenshot.');
    }
    return response.blob();
  }
};
