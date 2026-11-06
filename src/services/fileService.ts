import { FileExplorerResponse, FileReadResponse } from '../types';
import { getAuthHeaders } from './authService';

export async function fetchDirectory(path?: string): Promise<FileExplorerResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const headers = {
    'Accept': 'application/json',
    ...getAuthHeaders()
  };
  const res = await fetch(`/api/files/list${query}`, { headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ${res.status} ao carregar diretório`);
  }
  return res.json();
}

export async function fetchFileContent(filePath: string): Promise<FileReadResponse> {
  const query = `?path=${encodeURIComponent(filePath)}`;
  const headers = {
    'Accept': 'application/json',
    ...getAuthHeaders()
  };
  const res = await fetch(`/api/files/read${query}`, { headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ${res.status} ao ler arquivo`);
  }
  return res.json();
}
