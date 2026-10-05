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

let customN8nApiKey: string | null = null;
let customN8nUrl: string | null = null;

export function setN8nConfig(url?: string, apiKey?: string) {
  if (url) customN8nUrl = url.trim();
  if (apiKey !== undefined) customN8nApiKey = apiKey.trim();
  lastUnreachableN8n = 0; // reseta backoff para testar imediatamente
}

export function getN8nConfig() {
  const activeUrl = customN8nUrl || process.env.N8N_URL || 'http://127.0.0.1:5678';
  const activeKey = customN8nApiKey !== null ? customN8nApiKey : (process.env.N8N_API_KEY || '');
  return {
    url: activeUrl,
    hasApiKey: Boolean(activeKey)
  };
}

let lastUnreachableN8n = 0;
const N8N_BACKOFF_MS = 8000;

export async function fetchN8nStatus(): Promise<N8nStatusInfo> {
  const isBackingOff = Date.now() - lastUnreachableN8n < N8N_BACKOFF_MS;

  const activeUrl = customN8nUrl || process.env.N8N_URL || 'http://127.0.0.1:5678';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDkxMWM0Ny1iNTAzLTRlZGQtYmM0ZS0xZjViZWIyNmM3Y2IiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNTJiZTFiYWYtODgwNC00NzBkLThiMWYtZWUzYjEyMTgzNmRiIiwiaWF0IjoxNzkwODIwOTU0fQ.fEBgOFSjm0stmNdg9k3FgziTuZvMcPVSSHtaIJv9yTI';
  const activeKey = customN8nApiKey !== null ? customN8nApiKey : (process.env.N8N_API_KEY || defaultKey);

  const candidateUrls = Array.from(new Set([
    activeUrl.replace(/\/$/, ''),
    'http://127.0.0.1:5678',
    'http://localhost:5678',
    'http://[2804:2d5c:a2:852:5ecd:5bff:fe5a:7445]:5678',
    'http://192.168.100.23:5678'
  ]));

  if (!isBackingOff) {
    for (const baseUrl of candidateUrls) {
      try {
        // 1. Testa healthz na porta do n8n
        const healthRes = await fetch(`${baseUrl}/healthz`, {
          method: 'GET',
          signal: AbortSignal.timeout(1200)
        });

        if (healthRes.ok) {
          let workflows: N8nWorkflowItem[] = [];
          let apiConnected = false;
          let apiAuthError: string | null = null;

          // 2. Se temos chave de API configurada, tenta listar os workflows reais
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
                    triggers: wf.triggerCount ? [`${wf.triggerCount} Gatilho(s)`] : ['Trigger/Schedule'],
                    executionsCount: wf.executionCount || 0
                  }));
                }
              } else if (wfRes.status === 401 || wfRes.status === 403) {
                apiAuthError = 'Chave de API inválida ou sem permissão de leitura no n8n.';
              } else {
                apiAuthError = `O endpoint de workflows respondeu com status ${wfRes.status}.`;
              }
            } catch (err: any) {
              apiAuthError = `Falha de conexão com a API de workflows: ${err.message}`;
            }
          } else {
            apiAuthError = 'Nenhuma chave de API configurada. Crie uma em Configurações > n8n API.';
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
      } catch {}
    }
    lastUnreachableN8n = Date.now();
  }

  // Estado offline real (sem inventar que está online)
  return {
    status: 'offline',
    online: false,
    url: activeUrl,
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
