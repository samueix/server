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
import fs from 'fs';

// Dynamic PORT from environment (Cloud Run injects PORT), fallback to 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

  // Proxy reverso para o backend FastAPI do Ubuntu Server (/api/system, /api/cpu, /api/network, etc.)
  app.all('/api/*', async (req, res, next) => {
    // Rotas tratadas internamente pelo server.ts
    const internalPaths = [
      '/api/health',
      '/api/adguard/config',
      '/api/adguard/status',
      '/api/adguard/stats',
      '/api/adguard/sync',
      '/api/adguard/querylog',
      '/api/adguard/domains',
      '/api/adguard/analyze',
      '/api/adguard/analyze-batch'
    ];
    if (internalPaths.includes(req.path)) {
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const subPath = (req.params as any)[0] || '';
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    
    // Constrói os cabeçalhos a encaminhar, preservando autenticação enviada pelo cliente
    const forwardHeaders: Record<string, string> = {
      'Accept': 'application/json',
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] as string } : {})
    };

    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'] as string;
    }
    if (req.headers['x-api-key']) {
      forwardHeaders['X-API-Key'] = req.headers['x-api-key'] as string;
    }

    // Se nenhuma credencial veio do frontend, usa fallback configurado no ambiente
    if (!forwardHeaders['Authorization'] && !forwardHeaders['X-API-Key']) {
      if (process.env.API_KEY) {
        forwardHeaders['X-API-Key'] = process.env.API_KEY;
      } else {
        const adminUser = process.env.ADMIN_USERNAME || 'admin';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin';
        forwardHeaders['Authorization'] = `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString('base64')}`;
      }
    }

    // Tenta conectar no backend FastAPI via loopback IPv4/IPv6, IP LAN ou IPv6 global
    const targetUrls: string[] = [];
    if (process.env.BACKEND_URL) {
      targetUrls.push(`${process.env.BACKEND_URL.replace(/\/$/, '')}/api/${subPath}${queryStr}`);
    }
    targetUrls.push(
      `http://127.0.0.1:8000/api/${subPath}${queryStr}`,
      `http://localhost:8000/api/${subPath}${queryStr}`,
      `http://[::1]:8000/api/${subPath}${queryStr}`,
      `http://192.168.100.23:8000/api/${subPath}${queryStr}`,
      `http://[2804:2d5c:a1:a6aa:5ecd:5bff:fe5a:7445]:8000/api/${subPath}${queryStr}`
    );

    for (const targetUrl of targetUrls) {
      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: forwardHeaders,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(2500)
        });

        const text = await response.text();
        res.status(response.status);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        return res.send(text);
      } catch {
        // Tenta próxima URL
      }
    }

    // Se o backend estiver offline na rede, retorna 503 para o frontend detectar offline sem inventar dados
    return res.status(503).json({
      status: 'OFFLINE',
      detail: 'Servidor Ubuntu offline ou inacessível na porta :8000'
    });
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

  try {
    const server = app.listen(PORT, '::', () => {
      console.log(`[AdGuard AI NOC] Servidor iniciado na porta ${PORT} (dual-stack IPv4/IPv6 [::]:${PORT})`);
    });
    server.on('error', (err: any) => {
      if (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') {
        console.warn(`[AdGuard AI NOC] IPv6 não suportado, escutando em 0.0.0.0:${PORT}`);
        app.listen(PORT, '0.0.0.0', () => {
          console.log(`[AdGuard AI NOC] Servidor iniciado na porta ${PORT} (0.0.0.0:${PORT})`);
        });
      }
    });
  } catch {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[AdGuard AI NOC] Servidor iniciado na porta ${PORT} (0.0.0.0:${PORT})`);
    });
  }
}

startServer();
