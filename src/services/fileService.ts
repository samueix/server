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

export async function createFile(dirPath: string, name: string, content: string = ''): Promise<{ success: boolean; filePath: string }> {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...getAuthHeaders()
  };
  const res = await fetch('/api/files/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({ dirPath, name, content })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ${res.status} ao criar arquivo`);
  }
  return res.json();
}

export async function saveFile(filePath: string, content: string): Promise<{ success: boolean; size: number }> {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...getAuthHeaders()
  };
  const res = await fetch('/api/files/save', {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: filePath, content })
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ${res.status} ao salvar arquivo`);
  }
  return res.json();
}
