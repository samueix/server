/**
 * Configuração Central do Server Panel
 * 
 * Centraliza o endereço do Ubuntu Server e a chave de autenticação.
 * Header obrigatório: X-API-Key: troque-essa-chave-123
 */

export const CONFIG = {
  API_URL: "http://192.168.100.23:8000",
  API_KEY: "troque-essa-chave-123"
};

export const SERVER_IPV4 = "192.168.100.23";
export const SERVER_IPV6 = "2804:2d5c:a1:897e:5ecd:5bff:fe5a:7445";
export const SSH_IPV4_COMMAND = "ssh samuel@192.168.100.23";
export const SSH_IPV6_COMMAND = "ssh samuel@[2804:2d5c:a1:897e:5ecd:5bff:fe5a:7445]";
export const ADGUARD_BASE_URL = "http://192.168.100.23:8081";
export const ADGUARD_STATS_URL = "http://192.168.100.23:8081/control/stats";

const STORAGE_KEY = 'server_panel_config_v2';

export interface AppConfig {
  API_URL: string;
  API_KEY: string;
  cpuThreshold?: number;  // Default 80%
  ramThreshold?: number;  // Default 85%
  tempThreshold?: number; // Default 75°C
  adguardUrl?: string;
  serverIpv6?: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  ...CONFIG,
  cpuThreshold: 80,
  ramThreshold: 85,
  tempThreshold: 75,
  adguardUrl: ADGUARD_BASE_URL,
  serverIpv6: SERVER_IPV6
};

export function loadConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        API_URL: parsed.API_URL || CONFIG.API_URL,
        API_KEY: parsed.API_KEY || CONFIG.API_KEY,
        cpuThreshold: typeof parsed.cpuThreshold === 'number' ? parsed.cpuThreshold : 80,
        ramThreshold: typeof parsed.ramThreshold === 'number' ? parsed.ramThreshold : 85,
        tempThreshold: typeof parsed.tempThreshold === 'number' ? parsed.tempThreshold : 75,
        adguardUrl: parsed.adguardUrl || ADGUARD_BASE_URL,
        serverIpv6: parsed.serverIpv6 || SERVER_IPV6
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
