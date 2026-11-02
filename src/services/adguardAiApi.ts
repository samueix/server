import { DomainAnalysisResult, AdGuardQueryItem } from '../types';
import { adguardDirectClient } from './adguardDirectClient';

export interface AdGuardStatusResponse {
  connected: boolean;
  running: boolean;
  protection_enabled: boolean;
  version: string;
  language: string;
  url: string;
  error?: string;
}

export interface AdGuardStatsResponse {
  connected: boolean;
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing: number;
  num_replaced_safesearch: number;
  blocked_percentage: number;
  avg_processing_time: number;
  top_queried_domains: Array<Record<string, number>>;
  top_blocked_domains: Array<Record<string, number>>;
  top_clients: Array<Record<string, number>>;
  top_upstreams_responses: Array<Record<string, number>>;
  dns_queries: number[];
  blocked_filtering: number[];
  time_units: string;
  last_updated: string;
  error?: string;
}

class AdguardAiService {
  private getBaseUrl(): string {
    return '';
  }

  async getStatus(): Promise<AdGuardStatusResponse> {
    const directStatus = adguardDirectClient.getStatus();
    if (directStatus.state === 'CONNECTED') {
      return {
        connected: true,
        running: directStatus.protectionEnabled ?? true,
        protection_enabled: directStatus.protectionEnabled ?? true,
        version: directStatus.version || 'v0.107.54',
        language: 'pt-br',
        url: directStatus.endpoint
      };
    }

    try {
      const res = await fetch(`${this.getBaseUrl()}/api/adguard/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return {
        connected: false,
        running: true,
        protection_enabled: true,
        version: 'v0.107.54',
        language: 'pt-br',
        url: directStatus.endpoint || 'http://192.168.100.23:8081',
        error: err.message
      };
    }
  }

  async getStats(): Promise<AdGuardStatsResponse> {
    const directStatus = adguardDirectClient.getStatus();
    if (directStatus.state === 'CONNECTED') {
      return adguardDirectClient.getStats();
    }

    // Tenta obter do cliente direto se tiver dados capturados
    const directStats = adguardDirectClient.getStats();
    if (directStats && directStats.num_dns_queries >= 1424) {
      return directStats;
    }

    try {
      const res = await fetch(`${this.getBaseUrl()}/api/adguard/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return directStats;
    }
  }

  async getDomains(): Promise<DomainAnalysisResult[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/adguard/domains`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const domains: DomainAnalysisResult[] = await res.json();
      
      // Alimenta o cache do cliente direto com as análises conhecidas
      domains.forEach(d => adguardDirectClient.registerDomainAnalysis(d));
      return domains;
    } catch (err: any) {
      console.error('Erro ao buscar domínios:', err);
      return [];
    }
  }

  async getQueryLog(limit: number = 40): Promise<AdGuardQueryItem[]> {
    const directLogs = adguardDirectClient.getQueryLogs();
    if (directLogs && directLogs.length > 0) {
      return directLogs.slice(0, limit);
    }

    try {
      const res = await fetch(`${this.getBaseUrl()}/api/adguard/querylog?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      return directLogs;
    }
  }

  async analyzeDomain(domain: string, force: boolean = false): Promise<{ cached: boolean; analysis: DomainAnalysisResult }> {
    const res = await fetch(`${this.getBaseUrl()}/api/adguard/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, force })
    });
    if (!res.ok) {
      throw new Error(`Erro ao analisar domínio: HTTP ${res.status}`);
    }
    const result = await res.json();
    if (result && result.analysis) {
      adguardDirectClient.registerDomainAnalysis(result.analysis);
    }
    return result;
  }

  async analyzeBatch(domains?: string[], limit: number = 5): Promise<{ processedCount: number; results: DomainAnalysisResult[] }> {
    const res = await fetch(`${this.getBaseUrl()}/api/adguard/analyze-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains, limit })
    });
    if (!res.ok) {
      throw new Error(`Erro no batch de análise: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data && Array.isArray(data.results)) {
      data.results.forEach((r: DomainAnalysisResult) => adguardDirectClient.registerDomainAnalysis(r));
    }
    return data;
  }

  async saveConfig(cfg: { url?: string; username?: string; password?: string }): Promise<any> {
    if (cfg.url) {
      adguardDirectClient.setEndpoint(cfg.url);
    }
    if (cfg.username || cfg.password) {
      adguardDirectClient.setCredentials(cfg.username, cfg.password);
    }

    const res = await fetch(`${this.getBaseUrl()}/api/adguard/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    return await res.json();
  }
}

export const adguardAiService = new AdguardAiService();

