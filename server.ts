import fs from 'fs';
import dotenv from 'dotenv';

// Carrega .env prioritariamente, com fallback para .env.local ou .env.example
if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env.example')) {
  dotenv.config({ path: '.env.example' });
} else {
  dotenv.config();
}

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import net from 'net';
import { 
  fetchAdGuardStatus, 
  fetchAdGuardStats, 
  fetchAdGuardQueryLog, 
  getAdGuardConfig, 
  updateAdGuardConfig,
  updateAdGuardRawStats,
  clearAdGuardHistory,
  getAdGuardClearCommand
} from './server/adguardClient.js';
import { 
  getAnalyzedDomain, 
  getAllAnalyzedDomains, 
  saveAnalyzedDomain, 
  DomainAnalysis 
} from './server/db.js';
import { analyzeDomainWithGemini } from './server/gemini.js';
import { listDirectory, readTargetFile, createTargetFile, saveTargetFile } from './server/fileExplorer.js';
import { runShellCommand } from './server/terminalRunner.js';
import { getServerConfig, saveServerConfig } from './server/credentialsManager.js';
import { getSecurityAttackStatus, recordPanelFailedLogin } from './server/securityMonitor.js';
import { 
  fetchN8nStatus as fetchN8nFallback, 
  setN8nConfig as setN8nConfigFallback,
  toggleN8nWorkflow as toggleN8nWorkflowFallback 
} from './server/n8nClient.js';
import { getSystemLogs as getSystemLogsFallback } from './server/logsMonitor.js';
import { 
  getFullSystemSnapshot, 
  getCpuInfo, 
  getMemoryInfo, 
  getDiskInfo, 
  getNetworkInfo, 
  getTemperatureInfo, 
  getProcessesList 
} from './server/systemMonitor.js';
import { getAllMonitoredServices } from './server/servicesMonitor.js';

// Inicialização do servidor com fallback padrão para ambiente sem arquivo .env manual
const defaultAdminPass = '075561@Sam';
const defaultUserPass = '075561@Sam';

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

  // Limpar histórico e estatísticas do AdGuard
  app.post('/api/adguard/clear-history', async (req, res) => {
    try {
      const result = await clearAdGuardHistory();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Retornar o comando de shell para limpar histórico no Ubuntu
  app.get('/api/adguard/clear-command', (req, res) => {
    res.json({ shellCommand: getAdGuardClearCommand() });
  });

  function timingSafeCompare(a?: string, b?: string): boolean {
    if (!a || !b) return false;
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  function checkAdminPass(pass?: string): boolean {
    if (!pass) return false;
    const config = getServerConfig();
    const expected = config.auth?.adminPass || process.env.ADMIN_PASSWORD || defaultAdminPass;
    return timingSafeCompare(pass, expected);
  }

  function checkUserPass(pass?: string): boolean {
    if (!pass) return false;
    const config = getServerConfig();
    const expected = config.auth?.userPass || process.env.USER_PASSWORD || defaultUserPass;
    return timingSafeCompare(pass, expected);
  }

  function verifyApiKey(key?: string): boolean {
    if (!key || !process.env.API_KEY) return false;
    return timingSafeCompare(key, process.env.API_KEY);
  }

  function verifyUserPass(user?: string, pass?: string): { authenticated: boolean; role?: 'admin' | 'user'; username?: string } {
    if (!user || !pass) return { authenticated: false };
    const config = getServerConfig();
    const validAdminUser = (config.auth?.adminUser || process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const validStandardUser = (config.auth?.userUser || process.env.USER_USERNAME || 'user').trim().toLowerCase();
    const uClean = user.trim().toLowerCase();

    if (uClean === validAdminUser && checkAdminPass(pass)) {
      return { authenticated: true, role: 'admin', username: config.auth?.adminUser || 'admin' };
    }
    if (uClean === validStandardUser && checkUserPass(pass)) {
      return { authenticated: true, role: 'user', username: config.auth?.userUser || 'user' };
    }
    return { authenticated: false };
  }

  // Função centralizada para CORS configurável via ALLOWED_ORIGIN (padrão: mesma origem do painel, sem cabeçalho CORS)
  function applyCors(res: express.Response) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN?.trim();
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }
  }

  // Rate limiting de tentativas de login por IP (5 tentativas incorretas em 5 minutos -> HTTP 429)
  const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

  // Verificação de autenticação de dois usuários: admin e user
  app.get('/api/auth/verify', async (req, res) => {
    applyCors(res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rateLimit = failedLoginAttempts.get(clientIp);

    if (rateLimit && now < rateLimit.resetAt && rateLimit.count >= 5) {
      const waitSeconds = Math.ceil((rateLimit.resetAt - now) / 1000);
      return res.status(429).json({
        authenticated: false,
        detail: `Muitas tentativas consecutivas incorretas. Por segurança, aguarde ${waitSeconds}s antes de tentar novamente.`
      });
    }

    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    let authenticatedUser: string | null = null;
    let userRole = 'user';

    // 1. Check API Key Header
    if (apiKeyHeader && verifyApiKey(apiKeyHeader)) {
      authenticatedUser = 'api-client';
      userRole = 'admin';
    }

    // 2. Check Basic Auth (exige usuário E senha)
    if (!authenticatedUser && authHeader && authHeader.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        const colonIdx = decoded.indexOf(':');
        const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
        const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';

        const result = verifyUserPass(u, p);
        if (result.authenticated && result.role && result.username) {
          authenticatedUser = result.username;
          userRole = result.role;
        }
      } catch {}
    }

    // 3. Check Bearer Token (chave de API)
    if (!authenticatedUser && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (verifyApiKey(token)) {
        authenticatedUser = 'bearer-admin';
        userRole = 'admin';
      }
    }

    if (authenticatedUser) {
      // Sucesso: reseta histórico de falhas do IP
      failedLoginAttempts.delete(clientIp);
      return res.json({
        authenticated: true,
        user: authenticatedUser,
        role: userRole,
        timestamp: new Date().toISOString()
      });
    }

    // Falha: incrementa contador de tentativas com janela de 5 minutos
    recordPanelFailedLogin(clientIp, 'tentativa_web');
    if (!rateLimit || now > rateLimit.resetAt) {
      failedLoginAttempts.set(clientIp, { count: 1, resetAt: now + 300000 });
    } else {
      rateLimit.count += 1;
    }

    return res.status(401).json({
      authenticated: false,
      detail: 'Credenciais inválidas. Verifique o usuário e a senha digitados.'
    });
  });

  // Rate limiting de desbloqueio do cofre (5 tentativas consecutivas incorretas em 5 min -> HTTP 429)
  const failedVaultAttempts = new Map<string, { count: number; resetAt: number }>();

  // Endpoint seguro de desbloqueio do cofre (valida VAULT_PASSWORD em tempo constante no servidor)
  app.post('/api/vault/unlock', (req, res) => {
    applyCors(res);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rateLimit = failedVaultAttempts.get(clientIp);

    if (rateLimit && now < rateLimit.resetAt && rateLimit.count >= 5) {
      const waitSeconds = Math.ceil((rateLimit.resetAt - now) / 1000);
      return res.status(429).json({
        ok: false,
        error: `Muitas tentativas incorretas no cofre. Por segurança, aguarde ${waitSeconds}s.`
      });
    }

    // 1. Exige que a requisição venha de um usuário autenticado no painel
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    let callerRole: 'admin' | 'user' | null = null;
    if (apiKeyHeader && verifyApiKey(apiKeyHeader)) {
      callerRole = 'admin';
    } else if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        const colonIdx = decoded.indexOf(':');
        const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
        const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';
        const result = verifyUserPass(u, p);
        if (result.authenticated && result.role) {
          callerRole = result.role;
        }
      } catch {}
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (verifyApiKey(token)) {
        callerRole = 'admin';
      }
    }

    if (!callerRole) {
      return res.status(401).json({
        ok: false,
        error: 'Acesso negado: Autentique-se no painel antes de desbloquear o cofre.'
      });
    }

    const vaultPassword = process.env.VAULT_PASSWORD || defaultAdminPass;

    const inputPassword = req.body?.password;
    if (!inputPassword || typeof inputPassword !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Senha mestre não informada.'
      });
    }

    const isMatch = timingSafeCompare(inputPassword, vaultPassword);
    if (isMatch) {
      failedVaultAttempts.delete(clientIp);
      if (callerRole === 'admin') {
        return res.json({
          ok: true,
          success: true,
          sshUser: process.env.VAULT_SSH_USER || 'samuel',
          sshPassword: process.env.VAULT_SSH_PASSWORD || defaultAdminPass
        });
      } else {
        // Operador: desbloqueia o cofre mas sem credenciais de infraestrutura
        return res.json({
          ok: true,
          success: true,
          sshUser: null,
          sshPassword: null
        });
      }
    }

    // Falha: incrementa contador de tentativas
    if (!rateLimit || now > rateLimit.resetAt) {
      failedVaultAttempts.set(clientIp, { count: 1, resetAt: now + 300000 });
    } else {
      rateLimit.count += 1;
    }

    return res.status(403).json({
      ok: false,
      error: 'Senha mestre incorreta. Acesso negado.'
    });
  });

  // Função ultra-rápida e resiliente para teste de Ping/Latência TCP sem risco de crash no Node.js
  const measureTcpPing = (host: string, port: number, timeoutMs = 800): Promise<number | null> => {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      let isSettled = false;

      // Handler preventivo constante para garantir que destruições de socket nunca causem 'unhandled error'
      socket.on('error', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          try {
            socket.destroy();
          } catch {}
          resolve(null);
        }
      });

      const cleanup = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          try {
            socket.destroy();
          } catch {}
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      socket.connect(port, host, () => {
        const latency = Date.now() - start;
        cleanup();
        resolve(latency);
      });

      socket.on('timeout', () => {
        cleanup();
        resolve(null);
      });
    });
  };

  // Endpoint de Ping do servidor para a internet (sem comandos externos e com resposta instantânea)
  app.get('/api/ping', async (req, res) => {
    applyCors(res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    try {
      const targets = [
        { id: 'cloudflare', name: 'Cloudflare DNS', host: '1.1.1.1', port: 53, type: 'external' as const, httpProbe: 'https://1.1.1.1/cdn-cgi/trace' },
        { id: 'google', name: 'Google Public DNS', host: '8.8.8.8', port: 53, type: 'external' as const, httpProbe: 'https://dns.google/resolve?name=example.com' },
        { id: 'quad9', name: 'Quad9 DNS Seguro', host: '9.9.9.9', port: 53, type: 'external' as const, httpProbe: 'https://dns.quad9.net' },
        { id: 'nicbr', name: 'NIC.br / PTT Brasil', host: '200.160.2.3', port: 53, type: 'external' as const, httpProbe: 'https://registro.br' },
        { id: 'gateway', name: 'Gateway Local (Roteador)', host: '192.168.100.1', port: 80, type: 'local' as const, httpProbe: null }
      ];

      const results = await Promise.all(
        targets.map(async (t) => {
          const timeout = t.type === 'local' ? 350 : 800;
          let pingMs = await measureTcpPing(t.host, t.port, timeout);

          // Fallback HTTP instantâneo se porta 53 TCP for bloqueada por firewall/operadora
          if (pingMs === null && t.httpProbe) {
            try {
              const hStart = Date.now();
              const httpRes = await fetch(t.httpProbe, {
                method: 'HEAD',
                signal: AbortSignal.timeout(800)
              });
              if (httpRes.ok || httpRes.status < 500) {
                pingMs = Date.now() - hStart;
              }
            } catch {}
          }

          let quality: 'EXCELENTE' | 'BOM' | 'MEDIO' | 'ALTO' | 'FALHA' = 'FALHA';
          if (pingMs !== null) {
            if (pingMs <= 20) quality = 'EXCELENTE';
            else if (pingMs <= 50) quality = 'BOM';
            else if (pingMs <= 100) quality = 'MEDIO';
            else quality = 'ALTO';
          }

          return {
            id: t.id,
            name: t.name,
            host: t.host,
            port: t.port,
            type: t.type,
            pingMs,
            status: (pingMs !== null ? 'ONLINE' : 'OFFLINE') as 'ONLINE' | 'OFFLINE',
            quality
          };
        })
      );

      const validPings = results.filter(r => r.pingMs !== null && r.type === 'external').map(r => r.pingMs as number);
      const avgMs = validPings.length > 0 
        ? Math.round(validPings.reduce((a, b) => a + b, 0) / validPings.length) 
        : null;

      let overallStatus: 'EXCELENTE' | 'BOM' | 'ALTO' | 'DESCONECTADO' = 'DESCONECTADO';
      if (avgMs !== null) {
        if (avgMs <= 25) overallStatus = 'EXCELENTE';
        else if (avgMs <= 60) overallStatus = 'BOM';
        else overallStatus = 'ALTO';
      }

      return res.json({
        success: true,
        timestamp: new Date().toISOString(),
        average_ms: avgMs,
        overall_status: overallStatus,
        targets: results,
        notice: 'Medição em tempo real de latência de rede nativa sem comandos shell ou bloqueio de threads.'
      });
    } catch (err: any) {
      console.error('Erro no ping:', err);
      return res.status(500).json({
        success: false,
        error: err.message,
        average_ms: null,
        overall_status: 'DESCONECTADO',
        targets: []
      });
    }
  });

  // Rotas nativas do n8n Workflow Automation
  app.get('/api/n8n/status', async (req, res) => {
    applyCors(res);
    try {
      const status = await fetchN8nFallback();
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/n8n/config', async (req, res) => {
    applyCors(res);
    try {
      setN8nConfigFallback(req.body?.url, req.body?.apiKey);
      const updatedStatus = await fetchN8nFallback();
      return res.json({
        success: true,
        message: 'Configuração do n8n atualizada com sucesso.',
        status: updatedStatus
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/n8n/workflows/:id/toggle', async (req, res) => {
    applyCors(res);
    try {
      const id = req.params.id;
      const active = Boolean(req.body?.active);
      const result = await toggleN8nWorkflowFallback(id, active);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Rotas do Explorador de Arquivos (Somente Leitura)
  app.get('/api/files/list', async (req, res) => {
    applyCors(res);
    try {
      const targetPath = (req.query.path as string) || '';
      const data = await listDirectory(targetPath);
      return res.json(data);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/files/read', async (req, res) => {
    applyCors(res);
    try {
      const targetPath = req.query.path as string;
      if (!targetPath) {
        return res.status(400).json({ error: 'Parâmetro path é obrigatório.' });
      }
      const data = await readTargetFile(targetPath);
      return res.json(data);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Criar novo arquivo de texto (Bloco de Notas)
  app.post('/api/files/create', async (req, res) => {
    applyCors(res);
    try {
      const { dirPath, name, content } = req.body || {};
      if (!dirPath || !name) {
        return res.status(400).json({ error: 'dirPath e name são obrigatórios.' });
      }
      const result = await createTargetFile(dirPath, name, content || '');
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Salvar edições em arquivo de texto (Bloco de Notas)
  app.post('/api/files/save', async (req, res) => {
    applyCors(res);
    try {
      const { path: filePath, content } = req.body || {};
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'path e content são obrigatórios.' });
      }
      const result = await saveTargetFile(filePath, content);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Rotas de Credenciais e Variáveis de Sistema (sem .env)
  app.get('/api/credentials', (req, res) => {
    applyCors(res);
    const config = getServerConfig();
    return res.json(config);
  });

  app.post('/api/credentials', (req, res) => {
    applyCors(res);
    try {
      const updated = saveServerConfig(req.body);
      return res.json({ success: true, message: 'Configurações salvas em server-config.json com sucesso.', config: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Rota de Auditoria e Detecção de Ataques / Tentativas de Invasão (múltiplos aliases resilientes)
  app.get(['/api/security/attack-monitor', '/api/security', '/api/security/status'], async (req, res) => {
    applyCors(res);
    try {
      const status = await getSecurityAttackStatus();
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Rota de Execução de Comandos Shell no Terminal
  app.post('/api/terminal/exec', async (req, res) => {
    applyCors(res);
    try {
      const { command, cwd } = req.body || {};
      if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'Comando não fornecido.' });
      }
      const result = await runShellCommand(command, cwd);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Cache do host FastAPI que respondeu com sucesso para eliminar latência de probing
  let cachedWorkingBackendBase: string | null = null;

  // Proxy reverso para o backend FastAPI do Ubuntu Server (/api/system, /api/cpu, /api/network, etc.)
  app.all('/api/*', async (req, res, next) => {
    // Rotas tratadas internamente pelo server.ts
    const internalPaths = [
      '/api/health',
      '/api/auth/verify',
      '/api/vault/unlock',
      '/api/adguard/config',
      '/api/adguard/status',
      '/api/adguard/stats',
      '/api/adguard/sync',
      '/api/adguard/querylog',
      '/api/adguard/domains',
      '/api/adguard/analyze',
      '/api/adguard/analyze-batch',
      '/api/mac-vendor',
      '/api/ping',
      '/api/n8n',
      '/api/files',
      '/api/terminal',
      '/api/credentials',
      '/api/security'
    ];
    if (internalPaths.some(p => req.path.startsWith(p))) {
      return next();
    }

    applyCors(res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const subPath = (req.params as any)[0] || '';
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    
    // 1. Validação de segurança no proxy: verifica se o cliente possui credenciais válidas
    const clientAuth = req.headers['authorization'];
    const clientApiKey = req.headers['x-api-key'] as string | undefined;

    let isAuthorizedClient = false;
    let clientRole = 'user';

    if (clientApiKey && verifyApiKey(clientApiKey)) {
      isAuthorizedClient = true;
      clientRole = 'admin';
    } else if (clientAuth && clientAuth.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(clientAuth.slice(6), 'base64').toString('utf-8');
        const colonIdx = decoded.indexOf(':');
        const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
        const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';

        const result = verifyUserPass(u, p);
        if (result.authenticated && result.role) {
          isAuthorizedClient = true;
          clientRole = result.role;
        }
      } catch {}
    } else if (clientAuth && clientAuth.startsWith('Bearer ')) {
      const token = clientAuth.slice(7);
      if (verifyApiKey(token)) {
        isAuthorizedClient = true;
        clientRole = 'admin';
      }
    }

    // Se o cliente não estiver autenticado nem como admin nem como user
    if (!isAuthorizedClient) {
      return res.status(401).json({
        detail: 'Não autorizado. Faça login com usuário e senha para acessar o painel.'
      });
    }

    // Admin obrigatório para toda a lista de prefixos admin (logs, n8n, vault e rotas sensíveis futuras)
    const ADMIN_PREFIXES = ['logs', 'n8n', 'vault'];
    const requiresAdmin = ADMIN_PREFIXES.some(prefix => subPath === prefix || subPath.startsWith(prefix + '/'));
    if (requiresAdmin && clientRole !== 'admin') {
      return res.status(403).json({
        detail: 'Acesso restrito: Apenas a conta Administrador possui permissão para acessar este recurso.'
      });
    }

    // 2. Constrói os cabeçalhos para o backend FastAPI no Ubuntu Server
    // Repassa o papel real do cliente via X-Client-Role (aceito pelo FastAPI apenas em loopback 127.0.0.1)
    const forwardHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'X-Client-Role': clientRole,
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] as string } : {})
    };

    const validApiKey = process.env.API_KEY || '';
    if (clientAuth) {
      forwardHeaders['Authorization'] = clientAuth;
    } else if (validApiKey) {
      forwardHeaders['X-API-Key'] = validApiKey;
    }

    // Lista de candidatos de backend FastAPI
    const candidateBases: string[] = [];
    if (cachedWorkingBackendBase) {
      candidateBases.push(cachedWorkingBackendBase);
    }
    if (process.env.BACKEND_URL) {
      const envBase = process.env.BACKEND_URL.replace(/\/$/, '');
      if (!candidateBases.includes(envBase)) candidateBases.push(envBase);
    }
    const defaultBases = [
      'http://127.0.0.1:8000',
      'http://localhost:8000',
      'http://[::1]:8000',
      'http://192.168.100.23:8000',
      'http://[2804:2d5c:a2:512d:5ecd:5bff:fe5a:7445]:8000'
    ];
    for (const dBase of defaultBases) {
      if (!candidateBases.includes(dBase)) candidateBases.push(dBase);
    }

    let backendResponded = false;
    for (let i = 0; i < candidateBases.length; i++) {
      const base = candidateBases[i];
      const targetUrl = `${base}/api/${subPath}${queryStr}`;
      const timeoutMs = base === cachedWorkingBackendBase ? 2500 : 300;

      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: forwardHeaders,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs)
        });

        const text = await response.text();

        // Ignora respostas 401/403 do control-plane ou erros de autorização que não pertencem ao FastAPI
        if (text.includes('Unauthorized:') || text.includes('Authorization header') || response.status === 401 || response.status === 403 || response.status === 404) {
          continue;
        }

        if (response.ok) {
          // Sucesso de conexão! Salva base funcional no cache
          cachedWorkingBackendBase = base;

          res.status(response.status);
          res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
          res.send(text);
          backendResponded = true;
          break;
        }
      } catch {
        // Se a base em cache falhou, invalida para tentar os outros candidatos
        if (base === cachedWorkingBackendBase) {
          cachedWorkingBackendBase = null;
        }
      }
    }

    if (backendResponded) return;

    // Resposta nativa / fallback completo do servidor local quando o backend remoto não estiver disponível
    if (subPath === 'system') {
      return res.json(getFullSystemSnapshot());
    }
    if (subPath === 'cpu') {
      return res.json(getCpuInfo());
    }
    if (subPath === 'memory') {
      return res.json(getMemoryInfo());
    }
    if (subPath === 'disk') {
      return res.json(getDiskInfo());
    }
    if (subPath === 'temperature') {
      return res.json(getTemperatureInfo());
    }
    if (subPath === 'network') {
      return res.json(getNetworkInfo());
    }
    if (subPath === 'processes') {
      const sortBy = (req.query.sort as string) || 'cpu';
      const limit = parseInt((req.query.limit as string) || '30', 10);
      const resData = getProcessesList(sortBy, limit);
      const procsList = Array.isArray(resData) ? resData : (resData.processes || []);
      return res.json({
        success: true,
        count: procsList.length,
        processos: {
          count: procsList.length,
          processos: procsList
        },
        data: procsList,
        items: procsList,
        processes: procsList
      });
    }
    if (subPath === 'services') {
      const services = getAllMonitoredServices();
      return res.json({
        success: true,
        count: services.length,
        services,
        servicos: services
      });
    }
    if (subPath.startsWith('security')) {
      const status = await getSecurityAttackStatus();
      return res.json(status);
    }
    if (subPath.startsWith('n8n')) {
      if (subPath === 'n8n/config' && req.method === 'POST') {
        setN8nConfigFallback(req.body?.url, req.body?.apiKey);
        const st = await fetchN8nFallback();
        return res.json({ success: true, message: 'Configuração salva no nó fallback.', status: st });
      }
      const st = await fetchN8nFallback();
      return res.json(st);
    }
    if (subPath.startsWith('logs')) {
      const source = (req.query.source as string) || 'syslog';
      const lines = parseInt((req.query.lines as string) || '50', 10);
      const filter = (req.query.filter as string) || '';
      const logsResult = getSystemLogsFallback(source, lines, filter);
      return res.json(logsResult);
    }

    // Se nenhuma rota coincidir
    return res.status(404).json({
      detail: `Endpoint /api/${subPath} não encontrado.`
    });
  });

  // Rota Nginx-compatible /adguard-api/* (Injeta autenticação automaticamente e libera CORS)
  app.all('/adguard-api/*', async (req, res) => {
    applyCors(res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const rawSub = (req.params as any)[0] || '';
    const cleanSub = rawSub.replace(/^control\//, '');
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    
    // Lista de endpoints candidatos agnósticos a IP (loopback IPv4 e IPv6)
    const candidateUrls = [
      `http://127.0.0.1:8081/control/${cleanSub}${queryStr}`,
      `http://[::1]:8081/control/${cleanSub}${queryStr}`,
      `http://localhost:8081/control/${cleanSub}${queryStr}`
    ];

    const adgCfg = getAdGuardConfig();
    const adgUser = process.env.ADGUARD_USERNAME || adgCfg.username || '';
    const adgPass = process.env.ADGUARD_PASSWORD || adgCfg.password || '';
    const adgAuthHeader = (adgUser && adgPass) ? `Basic ${Buffer.from(`${adgUser}:${adgPass}`).toString('base64')}` : undefined;

    let responded = false;
    for (const targetUrl of candidateUrls) {
      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'Accept': 'application/json',
            ...(adgAuthHeader ? { 'Authorization': adgAuthHeader } : {}),
            ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] as string } : {})
          },
          body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(2000)
        });

        if (response.ok || response.status < 500) {
          const text = await response.text();
          res.status(response.status);
          res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
          res.send(text);
          responded = true;
          break;
        }
      } catch {
        // Tenta o próximo candidato local
      }
    }

    if (responded) return;

    // Erro real 502 sem dados falsos ou simulados
    return res.status(502).json({
      error: 'AdGuard Home inacessível na porta 8081',
      source: 'adguard_daemon',
      stale: false
    });
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
