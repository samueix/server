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
  version?: string;
  activeWorkflowsCount: number;
  totalWorkflowsCount: number;
  workflows: N8nWorkflowItem[];
  lastChecked: string;
}

const N8N_URL = process.env.N8N_URL || 'http://127.0.0.1:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNDkxMWM0Ny1iNTAzLTRlZGQtYmM0ZS0xZjViZWIyNmM3Y2IiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNTJiZTFiYWYtODgwNC00NzBkLThiMWYtZWUzYjEyMTgzNmRiIiwiaWF0IjoxNzkwODIwOTU0fQ.fEBgOFSjm0stmNdg9k3FgziTuZvMcPVSSHtaIJv9yTI';

let lastUnreachableN8n = 0;
const N8N_BACKOFF_MS = 15000;

export async function fetchN8nStatus(): Promise<N8nStatusInfo> {
  const isBackingOff = Date.now() - lastUnreachableN8n < N8N_BACKOFF_MS;

  const candidateUrls = Array.from(new Set([
    N8N_URL.replace(/\/$/, ''),
    'http://127.0.0.1:5678',
    'http://localhost:5678',
    'http://192.168.100.23:5678'
  ]));

  if (!isBackingOff) {
    for (const baseUrl of candidateUrls) {
      try {
        // 1. Testa healthz
        const healthRes = await fetch(`${baseUrl}/healthz`, {
          method: 'GET',
          signal: AbortSignal.timeout(900)
        });

        if (healthRes.ok) {
          let workflows: N8nWorkflowItem[] = [];
          let apiConnected = false;

          // 2. Tenta listar workflows reais da API do n8n com a chave
          try {
            const wfRes = await fetch(`${baseUrl}/api/v1/workflows?limit=50`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'X-N8N-API-KEY': N8N_API_KEY
              },
              signal: AbortSignal.timeout(1500)
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
                  triggers: wf.triggerCount ? [`${wf.triggerCount} Gatilho(s)`] : ['Webhook/Schedule'],
                  executionsCount: wf.executionCount || 0
                }));
              }
            }
          } catch {}

          const activeCount = workflows.filter(w => w.active).length;
          return {
            status: 'ok',
            online: true,
            url: baseUrl,
            apiConnected,
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

  // Estado zerado limpo (sem dados falsos inventados)
  return {
    status: 'offline',
    online: false,
    url: N8N_URL,
    apiConnected: false,
    version: undefined,
    activeWorkflowsCount: 0,
    totalWorkflowsCount: 0,
    workflows: [],
    lastChecked: new Date().toISOString()
  };
}
