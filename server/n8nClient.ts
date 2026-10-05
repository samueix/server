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
  status: 'ok' | 'offline';
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

// Chave da API do n8n oficial fornecida pelo usuário
export const DEFAULT_N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDkxMWM0Ny1iNTAzLTRlZGQtYmM0ZS0xZjViZWIyNmM3Y2IiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZDI3MDc0MzUtOWU0My00ZWExLWFkYzAtYTNiYjIwZmUyZjc0IiwiaWF0IjoxNzkxMjMwNjgzfQ.D8oeda_ApWe9DK06D5JZc7L0ZJ2IeA4B-uyok2Poluw';
export const DEFAULT_N8N_IPV6_URL = 'http://[2804:2d5c:a2:852:5ecd:5bff:fe5a:7445]:5678';

let customN8nApiKey: string | null = null;
let customN8nUrl: string | null = null;
let cachedWorkingN8nUrl: string | null = null;

export function setN8nConfig(url?: string, apiKey?: string) {
  if (url) customN8nUrl = url.trim();
  if (apiKey !== undefined) customN8nApiKey = apiKey.trim();
  lastUnreachableN8n = 0;
  cachedWorkingN8nUrl = null;
}

export function getN8nConfig() {
  const activeUrl = customN8nUrl || process.env.N8N_URL || DEFAULT_N8N_IPV6_URL;
  const activeKey = customN8nApiKey !== null ? customN8nApiKey : (process.env.N8N_API_KEY || DEFAULT_N8N_API_KEY);
  return {
    url: activeUrl,
    hasApiKey: Boolean(activeKey)
  };
}

let lastUnreachableN8n = 0;
const N8N_BACKOFF_MS = 6000;

export async function fetchN8nStatus(): Promise<N8nStatusInfo> {
  const isBackingOff = Date.now() - lastUnreachableN8n < N8N_BACKOFF_MS;

  const activeKey = customN8nApiKey !== null ? customN8nApiKey : (process.env.N8N_API_KEY || DEFAULT_N8N_API_KEY);

  // Lista de URLs candidatas (prioriza a última que funcionou e o IPv6 do servidor)
  const candidateUrls: string[] = [];
  if (cachedWorkingN8nUrl) candidateUrls.push(cachedWorkingN8nUrl);
  if (customN8nUrl) candidateUrls.push(customN8nUrl.replace(/\/$/, ''));
  if (process.env.N8N_URL) candidateUrls.push(process.env.N8N_URL.replace(/\/$/, ''));
  
  candidateUrls.push(
    DEFAULT_N8N_IPV6_URL,
    'http://127.0.0.1:5678',
    'http://localhost:5678',
    'http://192.168.100.23:5678'
  );

  const uniqueCandidates = Array.from(new Set(candidateUrls));

  if (!isBackingOff) {
    for (const baseUrl of uniqueCandidates) {
      try {
        // 1. Testa healthz na porta do n8n (timeout ágil de 1.5s)
        const healthRes = await fetch(`${baseUrl}/healthz`, {
          method: 'GET',
          signal: AbortSignal.timeout(1500)
        });

        if (healthRes.ok) {
          cachedWorkingN8nUrl = baseUrl;
          let workflows: N8nWorkflowItem[] = [];
          let apiConnected = false;
          let apiAuthError: string | null = null;

          // 2. Tenta listar workflows com a chave de API fornecida
          if (activeKey) {
            try {
              const wfRes = await fetch(`${baseUrl}/api/v1/workflows?limit=100`, {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'X-N8N-API-KEY': activeKey,
                  'Authorization': `Bearer ${activeKey}`
                },
                signal: AbortSignal.timeout(3000)
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
                apiAuthError = 'Chave de API inválida ou sem permissão de leitura no n8n.';
              } else {
                apiAuthError = `O endpoint de workflows respondeu com status ${wfRes.status}.`;
              }
            } catch (err: any) {
              apiAuthError = `Falha ao consultar workflows: ${err.message}`;
            }
          }

          const activeCount = workflows.filter(w => w.active).length;
          return {
            status: 'ok',
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
    lastUnreachableN8n = Date.now();
  }

  return {
    status: 'offline',
    online: false,
    url: customN8nUrl || DEFAULT_N8N_IPV6_URL,
    apiConnected: false,
    apiAuthError: 'Servidor n8n não está respondendo na porta 5678.',
    hasApiKey: Boolean(activeKey),
    version: undefined,
    activeWorkflowsCount: 0,
    totalWorkflowsCount: 0,
    workflows: [],
    lastChecked: new Date().toISOString()
  };
}
