/**
 * Configuração Central do Server Panel & AdGuard Home
 * 
 * Todas as requisições utilizam caminhos relativos para o proxy reverso do Nginx.
 * O navegador NÃO acessa as portas :8000 ou :8081 diretamente.
 * Nginx em :80 roteia:
 *   /api/         -> FastAPI :8000 (com injeção segura de X-API-Key)
 *   /adguard-api/ -> AdGuard Home :8081 (com injeção segura de autenticação)
 */

export const API = {
  server: "/api",
  adguard: "/adguard-api"
};

export const SERVER_IPV4 = "192.168.100.23";
export const SERVER_IPV6 = "2804:2d5c:a1:897e:5ecd:5bff:fe5a:7445";
export const SSH_IPV4_COMMAND = "ssh samuel@192.168.100.23";
export const SSH_IPV6_COMMAND = "ssh samuel@[2804:2d5c:a1:897e:5ecd:5bff:fe5a:7445]";

const STORAGE_KEY = 'server_panel_config_v3';

export interface AppConfig {
  cpuThreshold?: number;  // Default 80%
  ramThreshold?: number;  // Default 85%
  tempThreshold?: number; // Default 75°C
  serverIpv6?: string;
  refreshIntervalSeconds?: number; // 2 a 5s
}

export const DEFAULT_CONFIG: AppConfig = {
  cpuThreshold: 80,
  ramThreshold: 85,
  tempThreshold: 75,
  serverIpv6: SERVER_IPV6,
  refreshIntervalSeconds: 3
};

export function loadConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        cpuThreshold: typeof parsed.cpuThreshold === 'number' ? parsed.cpuThreshold : 80,
        ramThreshold: typeof parsed.ramThreshold === 'number' ? parsed.ramThreshold : 85,
        tempThreshold: typeof parsed.tempThreshold === 'number' ? parsed.tempThreshold : 75,
        serverIpv6: parsed.serverIpv6 || SERVER_IPV6,
        refreshIntervalSeconds: typeof parsed.refreshIntervalSeconds === 'number' ? parsed.refreshIntervalSeconds : 3
      };
    }
  } catch (e) {
    console.error('Erro ao ler configuração do localStorage', e);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(newConfig: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  } catch (e) {
    console.error('Erro ao salvar configuração no localStorage', e);
  }
}
