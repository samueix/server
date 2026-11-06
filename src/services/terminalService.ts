import { getAuthHeaders } from './authService';

export interface TerminalExecResponse {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  executionTimeMs: number;
  error?: string;
}

export async function executeTerminalCommand(command: string, cwd?: string): Promise<TerminalExecResponse> {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...getAuthHeaders()
  };
  const res = await fetch('/api/terminal/exec', {
    method: 'POST',
    headers,
    body: JSON.stringify({ command, cwd })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro HTTP ${res.status}`);
  }
  return res.json();
}
