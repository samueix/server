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
    user: process.env.VAULT_SSH_USER || 'samuel',
    password: '',
    sshPort: 22,
    description: 'Usuário padrão do sistema operacional Ubuntu Server'
  },
  adguard: {
    url: process.env.ADGUARD_URL || 'http://127.0.0.1:8081',
    username: process.env.ADGUARD_USERNAME || 'samuel',
    password: '',
    description: 'Configuração da API local do AdGuard Home DNS'
  },
  auth: {
    adminUser: process.env.ADMIN_USERNAME || 'admin',
    adminPass: '',
    userUser: process.env.USER_USERNAME || 'user',
    userPass: '',
    description: 'Credenciais de acesso ao Server Panel'
  },
  n8n: {
    url: process.env.N8N_URL || 'http://127.0.0.1:5678',
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
  let fileData: Partial<ServerConfigData> = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      fileData = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[credentialsManager] Erro ao ler server-config.json, usando padrão:', err);
  }

  // Interpolação prioritária: variáveis de ambiente sobrepõem senhas no disco com fallback seguro
  const DEFAULT_FALLBACK_PASS = '075561@Sam';
  const adminPass = fileData.auth?.adminPass || process.env.ADMIN_PASSWORD || DEFAULT_FALLBACK_PASS;
  const userPass = fileData.auth?.userPass || process.env.USER_PASSWORD || DEFAULT_FALLBACK_PASS;
  const adguardPass = fileData.adguard?.password || process.env.ADGUARD_PASSWORD || '';
  const adguardUrl = fileData.adguard?.url || process.env.ADGUARD_URL || DEFAULT_CONFIG.adguard.url;
  const adguardUser = fileData.adguard?.username || process.env.ADGUARD_USERNAME || DEFAULT_CONFIG.adguard.username;

  return {
    ...DEFAULT_CONFIG,
    ...fileData,
    ubuntu: {
      ...DEFAULT_CONFIG.ubuntu,
      ...(fileData.ubuntu || {}),
      user: fileData.ubuntu?.user || process.env.VAULT_SSH_USER || DEFAULT_CONFIG.ubuntu.user
    },
    adguard: {
      ...DEFAULT_CONFIG.adguard,
      ...(fileData.adguard || {}),
      url: adguardUrl,
      username: adguardUser,
      password: adguardPass
    },
    auth: {
      ...DEFAULT_CONFIG.auth,
      ...(fileData.auth || {}),
      adminUser: fileData.auth?.adminUser || process.env.ADMIN_USERNAME || 'admin',
      adminPass,
      userUser: fileData.auth?.userUser || process.env.USER_USERNAME || 'user',
      userPass
    },
    n8n: {
      ...DEFAULT_CONFIG.n8n,
      ...(fileData.n8n || {}),
      url: fileData.n8n?.url || process.env.N8N_URL || DEFAULT_CONFIG.n8n.url,
      apiKey: fileData.n8n?.apiKey || process.env.N8N_API_KEY || ''
    },
    customVariables: Array.isArray(fileData.customVariables) ? fileData.customVariables : DEFAULT_CONFIG.customVariables
  };
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
