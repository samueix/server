import { getAuthHeaders } from './authService';
import { SystemLogsResponse, SystemLogEntry } from '../types';

export type LogSource = 'syslog' | 'agent' | 'panel' | 'adguard' | 'auth' | 'dmesg';

export async function fetchSystemLogs(
  source: LogSource = 'syslog',
  lines: number = 50,
  filter: string = '',
  signal?: AbortSignal
): Promise<SystemLogsResponse> {
  const params = new URLSearchParams({
    source,
    lines: String(lines),
    filter: filter.trim()
  });

  const response = await fetch(`/api/logs?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...getAuthHeaders()
    },
    signal
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Acesso restrito: Apenas a conta Administrador possui permissão para visualizar logs do sistema.');
    }
    if (response.status === 401) {
      throw new Error('Sessão expirada ou não autenticada. Faça login novamente.');
    }
    throw new Error(`Falha ao carregar logs (HTTP ${response.status})`);
  }

  const data: SystemLogsResponse = await response.json();
  return data;
}
