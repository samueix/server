import express from 'express';
import path from 'path';
import { 
  fetchAdGuardStatus, 
  fetchAdGuardStats, 
  fetchAdGuardQueryLog, 
  getAdGuardConfig, 
  updateAdGuardConfig,
  updateAdGuardRawStats 
} from './server/adguardClient.js';
import { 
  getAnalyzedDomain, 
  getAllAnalyzedDomains, 
  saveAnalyzedDomain, 
  DomainAnalysis 
} from './server/db.js';
import { analyzeDomainWithGemini } from './server/gemini.js';
import { 
  getOsInfo, 
  getUptime, 
  getCpuInfo, 
  getMemoryInfo, 
  getTemperatureInfo, 
  getDiskInfo, 
  getNetworkInfo, 
  getProcessesList, 
  getFullSystemSnapshot 
} from './server/systemMonitor.js';
import { getAllMonitoredServices } from './server/servicesMonitor.js';
import { measureExternalPing } from './server/pingMonitor.js';
import { fetchN8nStatus } from './server/n8nClient.js';
import { getSystemLogs } from './server/logsMonitor.js';
import fs from 'fs';

// Dynamic PORT: Ensure 3000 in AI Studio dev environment (8080 is reserved by internal proxy)
const PORT = process.env.PORT && process.env.PORT !== '8080' ? parseInt(process.env.PORT, 10) : 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check endpoints for Google Cloud Run, Docker & monitoring probes
  app.get('/api/health', (req, res) => {
    res.status(200).json({ 
      status: 'online', 
      service: 'Server Monitor & AdGuard AI', 
      port: PORT,
      timestamp: new Date().toISOString() 
    });
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'online', 
      service: 'Server Monitor & AdGuard AI', 
      port: PORT 
    });
  });

  app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  // AdGuard Configuration
  app.get('/api/adguard/config', (req, res) => {
    res.json(getAdGuardConfig());
  });

  app.post('/api/adguard/config', (req, res) => {
    const updated = updateAdGuardConfig(req.body);
    res.json({ success: true, config: updated });
  });

  // AdGuard Status
  app.get('/api/adguard/status', async (req, res) => {
    try {
      const status = await fetchAdGuardStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AdGuard Statistics
  app.get('/api/adguard/stats', async (req, res) => {
    try {
      const stats = await fetchAdGuardStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sincronização direta de dados reais do AdGuard (/control/stats)
  app.post('/api/adguard/sync', (req, res) => {
    try {
      const rawData = req.body;
      const updated = updateAdGuardRawStats(rawData);
      res.json({ success: true, stats: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Verificação de autenticação de dois usuários: admin (admin) e user (user)
  app.get('/api/auth/verify', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    const validAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const validStandardUser = process.env.USER_USERNAME || 'user';
    const validStandardPass = process.env.USER_PASSWORD || 'user';
    const validApiKey = process.env.API_KEY || '';

    // Aceita a senha informada pelo usuário (075561@Sam), admin ou a configurada no ambiente
    const isAdminPass = (p?: string): boolean => {
      if (!p) return false;
      const clean = p.trim();
      return clean === '075561@Sam' || clean === 'admin' || (Boolean(process.env.ADMIN_PASSWORD) && clean === process.env.ADMIN_PASSWORD);
    };

    let authenticatedUser: string | null = null;
    let userRole = 'user';

    // 1. Check API Key Header
    if (apiKeyHeader && validApiKey && apiKeyHeader === validApiKey) {
      authenticatedUser = 'api-client';
      userRole = 'admin';
    }

    // 2. Check Basic Auth (admin:075561@Sam, admin:admin ou user:user)
    if (!authenticatedUser && authHeader && authHeader.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        const [u, p] = decoded.split(':');
        if (isAdminPass(p) && (!u || u === 'admin' || u === validAdminUser)) {
          authenticatedUser = 'admin';
          userRole = 'admin';
        } else if (u === validStandardUser && p === validStandardPass) {
          authenticatedUser = validStandardUser;
          userRole = 'user';
        } else if (isAdminPass(p)) {
          authenticatedUser = 'admin';
          userRole = 'admin';
        }
      } catch {}
    }

    // 3. Check Bearer Token
    if (!authenticatedUser && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (validApiKey && token === validApiKey) {
        authenticatedUser = 'bearer-admin';
        userRole = 'admin';
      } else if (isAdminPass(token)) {
        authenticatedUser = 'admin';
        userRole = 'admin';
      } else if (token === validStandardPass) {
        authenticatedUser = validStandardUser;
        userRole = 'user';
      }
    }

    if (authenticatedUser) {
      return res.json({
        authenticated: true,
        user: authenticatedUser,
        role: userRole,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(401).json({
      authenticated: false,
      detail: 'Credenciais inválidas. Verifique o usuário e a senha digitados.'
    });
  });

  // Helper de validação de autenticação
  function isAuthorizedClient(req: express.Request): boolean {
    const clientAuth = req.headers['authorization'];
    const clientApiKey = req.headers['x-api-key'] as string | undefined;

    const validAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const validStandardUser = process.env.USER_USERNAME || 'user';
    const validStandardPass = process.env.USER_PASSWORD || 'user';
    const validApiKey = process.env.API_KEY || '';

    const isAdminPass = (p?: string): boolean => {
      if (!p) return false;
      const clean = p.trim();
      return clean === '075561@Sam' || clean === 'admin' || (Boolean(process.env.ADMIN_PASSWORD) && clean === process.env.ADMIN_PASSWORD);
    };

    if (clientApiKey && validApiKey && clientApiKey === validApiKey) {
      return true;
    }
    if (clientAuth && clientAuth.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(clientAuth.slice(6), 'base64').toString('utf-8');
        const [u, p] = decoded.split(':');
        if (isAdminPass(p)) {
          return true;
        }
        if ((u === validAdminUser && isAdminPass(p)) || (u === validStandardUser && p === validStandardPass)) {
          return true;
        }
      } catch {}
    }
    if (clientAuth && clientAuth.startsWith('Bearer ')) {
      const token = clientAuth.slice(7);
      if ((validApiKey && token === validApiKey) || isAdminPass(token) || token === validStandardPass) {
        return true;
      }
    }
    return false;
  }

  // Helper para verificar nível de privilégio ('admin' vs 'user')
  function getClientRole(req: express.Request): 'admin' | 'user' | null {
    const clientAuth = req.headers['authorization'];
    const clientApiKey = req.headers['x-api-key'] as string | undefined;

    const validAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const validStandardUser = process.env.USER_USERNAME || 'user';
    const validStandardPass = process.env.USER_PASSWORD || 'user';
    const validApiKey = process.env.API_KEY || '';

    const isAdminPass = (p?: string): boolean => {
      if (!p) return false;
      const clean = p.trim();
      return clean === '075561@Sam' || clean === 'admin' || (Boolean(process.env.ADMIN_PASSWORD) && clean === process.env.ADMIN_PASSWORD);
    };

    if (clientApiKey && validApiKey && clientApiKey === validApiKey) {
      return 'admin';
    }
    if (clientAuth && clientAuth.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(clientAuth.slice(6), 'base64').toString('utf-8');
        const [u, p] = decoded.split(':');
        if (isAdminPass(p)) {
          return 'admin';
        }
        if (u === validStandardUser && p === validStandardPass) {
          return 'user';
        }
      } catch {}
    }
    if (clientAuth && clientAuth.startsWith('Bearer ')) {
      const token = clientAuth.slice(7);
      if ((validApiKey && token === validApiKey) || isAdminPass(token)) {
        return 'admin';
      }
      if (token === validStandardPass) {
        return 'user';
      }
    }
    return null;
  }

  // Cache do host backend que respondeu com sucesso para eliminar latência
  let cachedWorkingBackendBase: string | null = null;

  // Tenta consultar backend FastAPI (porta 8000) se configurado ou no próprio servidor
  async function tryForwardToBackend(req: express.Request, subPath: string, queryStr: string): Promise<string | null> {
    const candidateBases: string[] = [];
    if (cachedWorkingBackendBase) {
      candidateBases.push(cachedWorkingBackendBase);
    }
    if (process.env.BACKEND_URL) {
      const envBase = process.env.BACKEND_URL.replace(/\/$/, '');
      if (!candidateBases.includes(envBase)) candidateBases.push(envBase);
    }
    // Proba backend local FastAPI padrão se estiver rodando no mesmo servidor Ubuntu
    const localFastApi = 'http://127.0.0.1:8000';
    if (!candidateBases.includes(localFastApi)) {
      candidateBases.push(localFastApi);
    }

    const validAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const validAdminPass = process.env.ADMIN_PASSWORD || 'admin';
    const validApiKey = process.env.API_KEY || '';

    const forwardHeaders: Record<string, string> = {
      'Accept': 'application/json',
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] as string } : {})
    };
    if (validApiKey) forwardHeaders['X-API-Key'] = validApiKey;
    forwardHeaders['Authorization'] = `Basic ${Buffer.from(`${validAdminUser}:${validAdminPass}`).toString('base64')}`;

    for (const base of candidateBases) {
      try {
        const response = await fetch(`${base}/api/${subPath}${queryStr}`, {
          method: req.method,
          headers: forwardHeaders,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(1500)
        });
        if (response.ok) {
          cachedWorkingBackendBase = base;
          return await response.text();
        }
      } catch {
        if (base === cachedWorkingBackendBase) cachedWorkingBackendBase = null;
      }
    }
    return null;
  }

  // -------------------------------------------------------------
  // ROTAS NATIVAS DE TELEMETRIA DO SISTEMA
  // -------------------------------------------------------------
  app.get('/api/system', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado. Faça login para acessar o painel.' });
    }
    const forwarded = await tryForwardToBackend(req, 'system', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json(getFullSystemSnapshot());
  });

  app.get('/api/cpu', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'cpu', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json(getCpuInfo());
  });

  app.get('/api/memory', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'memory', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json(getMemoryInfo());
  });

  app.get('/api/temperature', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'temperature', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json(getTemperatureInfo());
  });

  app.get('/api/disk', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'disk', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json(getDiskInfo());
  });

  app.get('/api/network', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'network', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json(getNetworkInfo());
  });

  app.get('/api/processes', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const forwarded = await tryForwardToBackend(req, 'processes', queryStr);
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    const sortBy = (req.query.sort_by as string) || 'cpu';
    const limit = Number(req.query.limit) || 30;
    return res.json(getProcessesList(sortBy, limit));
  });

  app.get('/api/services', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'services', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    return res.json({ services: getAllMonitoredServices() });
  });

  app.get('/api/adguard', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    const forwarded = await tryForwardToBackend(req, 'adguard', '');
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }
    try {
      const stats = await fetchAdGuardStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // LATÊNCIA & PING EXTERNO (Sem nenhum comando shell de terminal)
  // Mede RTT puro via socket TCP/HTTP nativo do Node.js
  // -------------------------------------------------------------
  app.get('/api/ping', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    try {
      const pingData = await measureExternalPing();
      return res.json(pingData);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // INTEGRAÇÃO N8N WORKFLOW AUTOMATION (:5678)
  // -------------------------------------------------------------
  app.get('/api/n8n/status', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    try {
      const n8nData = await fetchN8nStatus();
      return res.json(n8nData);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/n8n/workflows', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }
    try {
      const n8nData = await fetchN8nStatus();
      return res.json({ workflows: n8nData.workflows });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // LOGS DO SISTEMA EM TEMPO REAL (/var/log/syslog, Agente, Daemons)
  // Acesso exclusivo para Administrador (User tem apenas gráficos)
  // -------------------------------------------------------------
  app.get('/api/logs', async (req, res) => {
    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado. Faça login para acessar os logs do sistema.' });
    }

    const role = getClientRole(req);
    if (role === 'user') {
      return res.status(403).json({
        detail: 'Acesso restrito: O usuário comum possui acesso apenas aos gráficos. A leitura de logs do sistema (/var/log/syslog) é reservada ao perfil Administrador.'
      });
    }

    const source = (req.query.source as string) || 'syslog';
    const lines = parseInt(req.query.lines as string, 10) || 50;
    const filter = (req.query.filter as string) || '';

    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const forwarded = await tryForwardToBackend(req, 'logs', queryStr);
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }

    try {
      const logsResult = getSystemLogs(source, lines, filter);
      return res.json(logsResult);
    } catch (err: any) {
      return res.status(500).json({ error: `Falha ao obter logs do sistema: ${err.message}` });
    }
  });

  // Proxy reverso genérico para rotas não capturadas
  app.all('/api/*', async (req, res, next) => {
    const internalPaths = [
      '/api/health',
      '/api/auth/verify',
      '/api/system',
      '/api/cpu',
      '/api/memory',
      '/api/temperature',
      '/api/disk',
      '/api/network',
      '/api/processes',
      '/api/services',
      '/api/adguard',
      '/api/ping',
      '/api/n8n',
      '/api/logs',
      '/api/adguard/config',
      '/api/adguard/status',
      '/api/adguard/stats',
      '/api/adguard/sync',
      '/api/adguard/querylog',
      '/api/adguard/domains',
      '/api/adguard/analyze',
      '/api/adguard/analyze-batch',
      '/api/mac-vendor'
    ];
    if (internalPaths.some(p => req.path.startsWith(p))) {
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (!isAuthorizedClient(req)) {
      return res.status(401).json({ detail: 'Não autorizado.' });
    }

    const subPath = (req.params as any)[0] || '';
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const forwarded = await tryForwardToBackend(req, subPath, queryStr);
    if (forwarded) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(forwarded);
    }

    return res.status(404).json({ error: `Endpoint /api/${subPath} não encontrado` });
  });

  // Rota Nginx-compatible /adguard-api/* (Injeta autenticação automaticamente e libera CORS)
  app.all('/adguard-api/*', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const subPath = (req.params as any)[0] || '';
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `http://192.168.100.23:8081/control/${subPath}${queryStr}`;

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Accept': 'application/json',
          'Authorization': 'Basic c2FtdWVsOjEyMzQ1Njc4',
          ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] as string } : {})
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(3000)
      });

      const text = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch {
      if (subPath.startsWith('stats')) {
        const stats = await fetchAdGuardStats();
        return res.json(stats);
      }
      if (subPath.startsWith('status')) {
        const status = await fetchAdGuardStatus();
        return res.json(status);
      }
      if (subPath.startsWith('querylog')) {
        const logs = await fetchAdGuardQueryLog(30);
        return res.json({ data: logs });
      }
      return res.status(502).json({ error: 'AdGuard inacessível via proxy /adguard-api/' });
    }
  });

  // AdGuard Query Log
  app.get('/api/adguard/querylog', async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 30;
      const logs = await fetchAdGuardQueryLog(limit);

      // Enrich logs with cached AI analysis if available
      const enriched = logs.map((item: any) => {
        const cached = getAnalyzedDomain(item.domain);
        return {
          ...item,
          analysis: cached || undefined
        };
      });

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // All Analyzed Domains from Cache / SQLite
  app.get('/api/adguard/domains', async (req, res) => {
    try {
      // 1. Get all stored analyses
      const stored = getAllAnalyzedDomains();
      const storedMap = new Map(stored.map(item => [item.domain.toLowerCase(), item]));

      // 2. Fetch top blocked domains from AdGuard stats to ensure synchronization
      const stats = await fetchAdGuardStats();
      const topBlocked = stats.top_blocked_domains || [];

      // Merge block counts from AdGuard
      for (const item of topBlocked) {
        if (typeof item === 'object' && item !== null) {
          for (const [dom, count] of Object.entries(item)) {
            const clean = dom.toLowerCase();
            const existing = storedMap.get(clean);
            if (existing) {
              existing.block_count = count as number;
              existing.is_blocked_by_adguard = true;
            } else {
              // Not yet analyzed domain found in AdGuard!
              storedMap.set(clean, {
                domain: clean,
                organization: 'Pendente de Análise',
                category: 'Outros',
                purpose: 'Identificado na lista de bloqueios do AdGuard Home.',
                tracker: false,
                telemetry: false,
                analytics: false,
                malware: false,
                phishing: false,
                cdn: false,
                legitimate: true,
                risk: 'desconhecido',
                explanation: 'Domínio novo detectado nos registros do AdGuard Home. Clique para analisar com a IA.',
                is_blocked_by_adguard: true,
                block_count: count as number,
                source: 'cache'
              });
            }
          }
        }
      }

      const domainList = Array.from(storedMap.values()).sort(
        (a, b) => (b.block_count || 0) - (a.block_count || 0)
      );

      res.json(domainList);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Analyze a single domain with AI (Checks Cache first!)
  app.post('/api/adguard/analyze', async (req, res) => {
    try {
      const { domain, force } = req.body;
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Parâmetro domain é obrigatório.' });
      }

      const clean = domain.trim().toLowerCase();

      // Rule: Check cache first unless force=true
      if (!force) {
        const cached = getAnalyzedDomain(clean);
        if (cached && cached.organization !== 'Pendente de Análise') {
          return res.json({ cached: true, analysis: cached });
        }
      }

      console.log(`[AI Analyzer] Chamando Gemini para analisar novo domínio: ${clean}`);
      const analysis = await analyzeDomainWithGemini(clean);
      analysis.is_blocked_by_adguard = true;

      // Preserve previous block count if available
      const previous = getAnalyzedDomain(clean);
      if (previous && previous.block_count) {
        analysis.block_count = previous.block_count;
      }

      // Save to local cache / SQLite
      saveAnalyzedDomain(analysis);

      res.json({ cached: false, analysis });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Batch analyze unanalyzed domains
  app.post('/api/adguard/analyze-batch', async (req, res) => {
    try {
      const { domains, limit = 5 } = req.body;
      let targetDomains: string[] = [];

      if (Array.isArray(domains) && domains.length > 0) {
        targetDomains = domains.map(d => String(d).trim().toLowerCase());
      } else {
        // Collect unanalyzed domains from current list
        const stats = await fetchAdGuardStats();
        const topBlocked = stats.top_blocked_domains || [];
        for (const item of topBlocked) {
          if (typeof item === 'object' && item !== null) {
            for (const dom of Object.keys(item)) {
              const clean = dom.toLowerCase();
              const cached = getAnalyzedDomain(clean);
              if (!cached || cached.organization === 'Pendente de Análise') {
                targetDomains.push(clean);
              }
            }
          }
        }
      }

      const toProcess = targetDomains.slice(0, Number(limit) || 5);
      const results: DomainAnalysis[] = [];

      for (const dom of toProcess) {
        const cached = getAnalyzedDomain(dom);
        if (cached && cached.organization !== 'Pendente de Análise') {
          results.push(cached);
        } else {
          console.log(`[AI Batch Analyzer] Processando com Gemini: ${dom}`);
          const analysis = await analyzeDomainWithGemini(dom);
          analysis.is_blocked_by_adguard = true;
          saveAnalyzedDomain(analysis);
          results.push(analysis);
        }
      }

      res.json({
        processedCount: results.length,
        results
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // API DE FORNECEDORES DE MAC (api.macvendors.com)
  // Serviço externo independente para identificação de fabricante OUI
  // -------------------------------------------------------------
  const macCache = new Map<string, { vendor: string | null; isRandomized: boolean; timestamp: number }>();
  let lastMacVendorRequestTime = 0;

  // Dicionário offline para respostas ultra rápidas e alta disponibilidade
  const KNOWN_OUI_FALLBACK: Record<string, string> = {
    'FCA13E': 'Samsung Electronics Co., Ltd.',
    'FCFBFB': 'Cisco Systems, Inc',
    'B827EB': 'Raspberry Pi Foundation',
    'DCA632': 'Raspberry Pi Trading Ltd',
    'E45F01': 'Raspberry Pi Trading Ltd',
    '001A79': 'Apple, Inc.',
    '3C0630': 'Apple, Inc.',
    'ACDE48': 'Apple, Inc.',
    'F01898': 'Apple, Inc.',
    '641666': 'Intel Corporate',
    '00155D': 'Microsoft Corporation',
    '50EB71': 'TP-Link Corporation Limited',
    '58D9D5': 'TP-Link Corporation Limited',
    '18FE34': 'Espressif Inc.',
    '246F28': 'Espressif Inc.',
    '30AEA4': 'Espressif Inc.',
    '7C87CE': 'Xiaomi Communications Co Ltd',
    '68764F': 'Xiaomi Communications Co Ltd',
    '00E04C': 'Realtek Semiconductor Corp.'
  };

  app.get('/api/mac-vendor/:mac?', async (req, res) => {
    try {
      const rawMac = (req.params.mac || (req.query.mac as string) || '').trim();
      if (!rawMac) {
        return res.status(400).json({
          success: false,
          error: 'Endereço MAC não informado. Forneça o MAC na URL (ex: /api/mac-vendor/FC-A1-3E-2A-1C-33).'
        });
      }

      // Normaliza removendo pontuações: extrai caracteres hexadecimais
      const hexOnly = rawMac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      if (hexOnly.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Formato de MAC inválido. Forneça ao menos 6 dígitos hexadecimais do prefixo OUI (ex: FC-A1-3E).'
        });
      }

      const oui = hexOnly.slice(0, 6);
      const formattedOui = `${oui.slice(0, 2)}:${oui.slice(2, 4)}:${oui.slice(4, 6)}`;
      const formattedFullMac = hexOnly.length >= 12
        ? `${oui.slice(0, 2)}:${oui.slice(2, 4)}:${oui.slice(4, 6)}:${hexOnly.slice(6, 8)}:${hexOnly.slice(8, 10)}:${hexOnly.slice(10, 12)}`
        : formattedOui;

      // Detecta se é MAC Privado/Aleatório (Locally Administered)
      const firstByte = parseInt(hexOnly.slice(0, 2), 16);
      const isRandomized = Boolean(firstByte & 0x02);

      // Verifica Cache em memória (TTL 24 horas)
      const cached = macCache.get(oui);
      if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
        if (cached.vendor) {
          return res.json({
            success: true,
            found: true,
            mac: formattedFullMac,
            oui: formattedOui,
            vendor: cached.vendor,
            is_randomized: cached.isRandomized,
            cached: true,
            provider: 'api.macvendors.com (Cache Local)',
            service_notice: 'Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu.'
          });
        } else {
          return res.status(404).json({
            success: false,
            found: false,
            mac: formattedFullMac,
            oui: formattedOui,
            error: 'Fabricante não encontrado na base OUI/IEEE',
            is_randomized: cached.isRandomized,
            cached: true,
            provider: 'api.macvendors.com (Cache Local)',
            service_notice: 'Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu.'
          });
        }
      }

      // Verifica Fallback OUI
      if (KNOWN_OUI_FALLBACK[oui]) {
        const vendor = KNOWN_OUI_FALLBACK[oui];
        macCache.set(oui, { vendor, isRandomized, timestamp: Date.now() });
        return res.json({
          success: true,
          found: true,
          mac: formattedFullMac,
          oui: formattedOui,
          vendor,
          is_randomized: isRandomized,
          cached: false,
          provider: 'api.macvendors.com (Base OUI Local)',
          service_notice: 'Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu.'
        });
      }

      // Rate limit para api.macvendors.com: máximo 1 requisição por segundo
      const timeSinceLast = Date.now() - lastMacVendorRequestTime;
      if (timeSinceLast < 1050) {
        await new Promise(r => setTimeout(r, 1050 - timeSinceLast));
      }
      lastMacVendorRequestTime = Date.now();

      // Consulta a API pública de Fornecedores de MAC (api.macvendors.com)
      const targetApiUrl = `https://api.macvendors.com/${encodeURIComponent(formattedFullMac)}`;
      const response = await fetch(targetApiUrl, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'User-Agent': 'UbuntuServerMonitor/1.0'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.status === 200) {
        const vendorName = (await response.text()).trim();
        macCache.set(oui, { vendor: vendorName, isRandomized, timestamp: Date.now() });
        return res.json({
          success: true,
          found: true,
          mac: formattedFullMac,
          oui: formattedOui,
          vendor: vendorName,
          is_randomized: isRandomized,
          cached: false,
          provider: 'api.macvendors.com',
          service_notice: 'Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu.'
        });
      }

      if (response.status === 404) {
        macCache.set(oui, { vendor: null, isRandomized, timestamp: Date.now() });
        return res.status(404).json({
          success: false,
          found: false,
          mac: formattedFullMac,
          oui: formattedOui,
          error: isRandomized 
            ? 'Fabricante não encontrado: Este é um endereço MAC Privado/Aleatório (MAC Randomization do dispositivo)' 
            : 'Fabricante não encontrado na base OUI/IEEE',
          is_randomized: isRandomized,
          cached: false,
          provider: 'api.macvendors.com',
          service_notice: 'Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu.'
        });
      }

      if (response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Limite de requisições por segundo atingido na API macvendors.com (1 req/s). Aguarde um instante.',
          provider: 'api.macvendors.com'
        });
      }

      throw new Error(`Resposta da API externa: HTTP ${response.status}`);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Falha ao consultar API externa de MAC: ${err.message || 'Servidor inacessível'}`
      });
    }
  });

  // Serve public static assets (favicons, icons)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite middleware in dev; Static file serving in prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      app.get('*', (req, res) => {
        res.status(200).json({
          status: 'online',
          service: 'Server Monitor & AdGuard AI',
          port: PORT,
          message: 'Backend operacional e escutando no Cloud Run'
        });
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AdGuard AI NOC] Servidor iniciado na porta ${PORT} (0.0.0.0:${PORT})`);
  });
}

startServer();
