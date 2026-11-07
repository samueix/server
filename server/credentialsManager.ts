import fs from 'fs';
import path from 'path';

export interface CustomVariable {
  id: string;
  key: string;
  value: string;
  description: string;
}

export interface ServerConfigData {
  ubuntu: {
    user: string;
    password?: string;
    sshPort: number;
    description?: string;
  };
  adguard: {
    url: string;
    username: string;
    password?: string;
    description?: string;
  };
  auth: {
    adminUser: string;
    adminPass: string;
    userUser: string;
    userPass: string;
    description?: string;
  };
  n8n: {
    url: string;
    apiKey?: string;
    description?: string;
  };
  customVariables: CustomVariable[];
}

const CONFIG_PATH = path.resolve(process.cwd(), 'server-config.json');

const DEFAULT_CONFIG: ServerConfigData = {
  ubuntu: {
    user: 'samuel',
    password: '',
    sshPort: 22,
    description: 'Usuário padrão do sistema operacional Ubuntu Server'
  },
  adguard: {
    url: 'http://127.0.0.1:8081',
    username: 'admin',
    password: '',
    description: 'Configuração da API local do AdGuard Home DNS'
  },
  auth: {
    adminUser: 'admin',
    adminPass: '075561@Sam',
    userUser: 'user',
    userPass: '075561@Sam',
    description: 'Credenciais de acesso ao Server Panel'
  },
  n8n: {
    url: 'http://127.0.0.1:5678',
    apiKey: '',
    description: 'Chave de API e endpoint do n8n Workflow Automation'
  },
  customVariables: [
    {
      id: 'var_1',
      key: 'PORTA_FASTAPI',
      value: '8000',
      description: 'Porta do serviço Python FastAPI local'
    },
    {
      id: 'var_2',
      key: 'IP_LOCAL_PADRAO',
      value: '192.168.100.23',
      description: 'IP fixo do servidor na rede local'
    }
  ]
};

export function getServerConfig(): ServerConfigData {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        ubuntu: { ...DEFAULT_CONFIG.ubuntu, ...(parsed.ubuntu || {}) },
        adguard: { ...DEFAULT_CONFIG.adguard, ...(parsed.adguard || {}) },
        auth: { ...DEFAULT_CONFIG.auth, ...(parsed.auth || {}) },
        n8n: { ...DEFAULT_CONFIG.n8n, ...(parsed.n8n || {}) },
        customVariables: Array.isArray(parsed.customVariables) ? parsed.customVariables : DEFAULT_CONFIG.customVariables
      };
    }
  } catch (err) {
    console.warn('[credentialsManager] Erro ao ler server-config.json, usando padrão:', err);
  }
  return DEFAULT_CONFIG;
}

export function saveServerConfig(data: Partial<ServerConfigData>): ServerConfigData {
  const current = getServerConfig();
  const merged: ServerConfigData = {
    ...current,
    ...data,
    ubuntu: { ...current.ubuntu, ...(data.ubuntu || {}) },
    adguard: { ...current.adguard, ...(data.adguard || {}) },
    auth: { ...current.auth, ...(data.auth || {}) },
    n8n: { ...current.n8n, ...(data.n8n || {}) },
    customVariables: Array.isArray(data.customVariables) ? data.customVariables : current.customVariables
  };

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err: any) {
    throw new Error(`Falha ao salvar server-config.json: ${err.message}`);
  }

  return merged;
}
