import { getServerConfig } from './credentialsManager.js';

export interface N8nWorkflowItem {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  nodesCount?: number;
  triggers?: string[];
  executionsCount?: number;
}

export interface N8nStatusInfo {
  status: 'ok' | 'warning' | 'offline' | 'unconfigured';
  online: boolean;
  url: string;
  apiConnected: boolean;
  apiAuthError?: string | null;
  hasApiKey: boolean;
  version?: string;
  activeWorkflowsCount: number;
  totalWorkflowsCount: number;
  workflows: N8nWorkflowItem[];
  lastChecked: string;
}

export const DEFAULT_N8N_URL = 'http://192.168.100.23:5678';
export const DEFAULT_N8N_IPV6_URL = 'http://[2804:2d5c:a2:512d:5ecd:5bff:fe5a:7445]:5678';

let customN8nApiKey: string | null = null;
let customN8nUrl: string | null = null;
let cachedWorkingN8nUrl: string | null = null;

export function setN8nConfig(url?: string, apiKey?: string) {
  if (url && url.trim()) {
    customN8nUrl = url.trim().replace(/\/$/, '');
  }
  if (apiKey !== undefined) {
    customN8nApiKey = apiKey.trim();
  }
  cachedWorkingN8nUrl = null;
}

function resolveN8nConfig(): { activeUrl: string; activeKey: string } {
  let cfg: any = null;
  try {
    cfg = getServerConfig();
  } catch {
    cfg = null;
  }
  const activeUrl =
    customN8nUrl ||
    process.env.N8N_URL ||
    cfg?.n8n?.url ||
    DEFAULT_N8N_URL;
  const activeKey =
    customN8nApiKey !== null
      ? customN8nApiKey
      : (process.env.N8N_API_KEY || cfg?.n8n?.apiKey || '');
  return { activeUrl: String(activeUrl).trim(), activeKey: String(activeKey || '').trim() };
}

export function getN8nConfig() {
  const { activeUrl, activeKey } = resolveN8nConfig();
  return {
    url: activeUrl,
    hasApiKey: Boolean(activeKey)
  };
}

export async function fetchN8nStatus(): Promise<N8nStatusInfo> {
  const { activeUrl, activeKey } = resolveN8nConfig();

  // Lista de URLs prioritárias locais e rápidas
  const candidateUrls: string[] = [];
  if (cachedWorkingN8nUrl) candidateUrls.push(cachedWorkingN8nUrl);
  if (customN8nUrl) candidateUrls.push(customN8nUrl.replace(/\/$/, ''));
  if (process.env.N8N_URL) candidateUrls.push(process.env.N8N_URL.replace(/\/$/, ''));
  
  candidateUrls.push(
    'http://127.0.0.1:5678',
    'http://localhost:5678',
    'http://192.168.100.23:5678',
    DEFAULT_N8N_IPV6_URL
  );

  const uniqueCandidates = Array.from(new Set(candidateUrls));

  for (const baseUrl of uniqueCandidates) {
    const isIpv6 = baseUrl.includes('[') || baseUrl.includes('2804:');
    const timeoutMs = isIpv6 ? 600 : 900;

    try {
      // 1. Testa se o serviço n8n está online na porta 5678 via /healthz
      const healthRes = await fetch(`${baseUrl}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (healthRes.ok) {
        cachedWorkingN8nUrl = baseUrl;
        let workflows: N8nWorkflowItem[] = [];
        let apiConnected = false;
        let apiAuthError: string | null = null;

        // 2. Se possuir chave de API, consulta a lista de workflows da API pública do n8n
        if (activeKey) {
          try {
            const wfRes = await fetch(`${baseUrl}/api/v1/workflows?limit=100`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'X-N8N-API-KEY': activeKey,
                'Authorization': `Bearer ${activeKey}`
              },
              signal: AbortSignal.timeout(2500)
            });

            if (wfRes.ok) {
              const data = await wfRes.json();
              apiConnected = true;
              if (Array.isArray(data.data)) {
                workflows = data.data.map((wf: any) => ({
                  id: String(wf.id),
                  name: wf.name || 'Fluxo sem título',
                  active: Boolean(wf.active),
                  createdAt: wf.createdAt || new Date().toISOString(),
                  updatedAt: wf.updatedAt || new Date().toISOString(),
                  tags: Array.isArray(wf.tags) ? wf.tags.map((t: any) => t.name || t) : [],
                  nodesCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
                  triggers: wf.triggerCount ? [`${wf.triggerCount} Gatilho(s)`] : ['Manual/Trigger'],
                  executionsCount: wf.executionCount || 0
                }));
              }
            } else if (wfRes.status === 401 || wfRes.status === 403) {
              apiAuthError = 'Chave de API inválida no n8n. Verifique em Settings > n8n API.';
            } else {
              apiAuthError = `Endpoint de workflows respondeu com status ${wfRes.status}.`;
            }
          } catch (err: any) {
            apiAuthError = `Falha ao conectar com a API de workflows: ${err.message}`;
          }
        }

        const activeCount = workflows.filter(w => w.active).length;
        return {
          status: apiConnected ? 'ok' : (activeKey ? 'warning' : 'unconfigured'),
          online: true,
          url: baseUrl,
          apiConnected,
          apiAuthError,
          hasApiKey: Boolean(activeKey),
          version: '1.78.1',
          activeWorkflowsCount: activeCount,
          totalWorkflowsCount: workflows.length,
          workflows,
          lastChecked: new Date().toISOString()
        };
      }
    } catch {
      if (baseUrl === cachedWorkingN8nUrl) {
        cachedWorkingN8nUrl = null;
      }
    }
  }

  // Fallback quando a porta 5678 estiver offline
  return {
    status: 'offline',
    online: false,
    url: activeUrl,
    apiConnected: false,
    apiAuthError: 'O serviço n8n não está ativo na porta 5678.',
    hasApiKey: Boolean(activeKey),
    version: undefined,
    activeWorkflowsCount: 0,
    totalWorkflowsCount: 0,
    workflows: [],
    lastChecked: new Date().toISOString()
  };
}

export async function toggleN8nWorkflow(workflowId: string, active: boolean): Promise<{ success: boolean; message: string }> {
  const resolved = resolveN8nConfig();
  const activeKey = resolved.activeKey;
  const baseUrl = cachedWorkingN8nUrl || resolved.activeUrl || 'http://127.0.0.1:5678';

  if (!activeKey) {
    return { success: false, message: 'Chave de API do n8n não configurada.' };
  }

  try {
    const action = active ? 'activate' : 'deactivate';
    const res = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/${action}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-N8N-API-KEY': activeKey,
        'Authorization': `Bearer ${activeKey}`
      },
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      return { success: true, message: `Fluxo ${active ? 'ativado' : 'desativado'} com sucesso.` };
    }
    return { success: false, message: `O n8n respondeu com erro HTTP ${res.status}.` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Erro ao conectar ao n8n.' };
  }
}
