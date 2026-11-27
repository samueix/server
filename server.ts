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
import dns from 'dns';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { 
  fetchAdGuardStatus, 
  fetchAdGuardStats, 
  fetchAdGuardQueryLog, 
  getAdGuardConfig, 
  getActiveAdGuardCredentials,
  updateAdGuardConfig,
  updateAdGuardRawStats,
  clearAdGuardHistory,
  getAdGuardClearCommand,
  getAdGuardFilteringStatus,
  setAdGuardDomainBlocked,
  setAdGuardUserRules
} from './server/adguardClient.js';
import { 
  getAnalyzedDomain, 
  getAllAnalyzedDomains, 
  saveAnalyzedDomain, 
  DomainAnalysis 
} from './server/db.js';
import { analyzeDomainWithOpencode } from './server/opencode.js';
import { listDirectory, readTargetFile, createTargetFile, saveTargetFile, assertPathSecurity } from './server/fileExplorer.js';
import { getWifiInfo, triggerWifiScan, connectWifi, getFastConnectivityStatus } from './server/wifiMonitor.js';
import { 
  getTokenQuotaMetrics, 
  listOpencodeSessions, 
  getOpencodeSession, 
  createOpencodeSession, 
  updateOpencodeSessionModel,
  deleteOpencodeSession, 
  askOpencodeAgent,
  listOpencodeModels,
  sanitizeModel,
  OPENCODE_MODEL
} from './server/opencode.js';
import { getServerConfig, saveServerConfig } from './server/credentialsManager.js';
import { runShellCommand } from './server/terminalRunner.js';
import { getCameraStatus, getPublicCameras, proxyCameraRequest, proxyWebrtcOffer, ensureGo2rtcRunning, getCameraDetails, cameraPtz, cameraProbeRecordings, serveLiveMjpeg, serveLiveAudio, cameraLed, addCameraConfig, deleteCameraConfig, brandCapabilities, createCameraLiveToken, getCameraLiveToken } from './server/cameras.js';
import { mikrotikGetStatus, mikrotikTestConnection, mikrotikBlockDevice, mikrotikUnblockDevice, mikrotikRunPing, mikrotikMakeLeaseStatic, mikrotikTraceroute, mikrotikDnsLookup, mikrotikGetDnsSettings, mikrotikSetDnsServers, mikrotikGetLogs, mikrotikGetBandwidth } from './server/mikrotik.js';
import { startMikrotikMonitor, getMikrotikCached, pollMikrotikOnce } from './server/mikrotikMonitor.js';
import { listMikrotikDevices, listMikrotikEvents, listMikrotikSnapshots, setMikrotikDeviceNickname, setMikrotikDeviceIcon, addMikrotikEvent } from './server/db.js';
import { 
  getSecurityAttackStatus, 
  recordPanelFailedLogin, 
  clearSecurityHistory, 
  blockIpInUfw, 
  unblockIpInUfw 
} from './server/securityMonitor.js';
import { logAudit, getAuditLog, clearAuditLog } from './server/auditLog.js';
import { testTelegramConnection, getTelegramUpdates, sendTelegramTestMessage, notifyTelegramLoginFailure, notifyTelegramLoginSuccess, notifyTelegramIpBlock } from './server/telegramNotifier.js';
import { startTelegramBotPolling, getDetectedTelegramChats } from './server/telegramBot.js';
import { loadMetricsHistory, getMetricsHistory, addMetricPoint } from './server/metricsHistory.js';
import { loadAdGuardHistory, addAdGuardSample, getAdGuardHistory, getAdGuardHistoryMeta } from './server/adguardHistory.js';
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
  getProcessesList, 
  getUptime, 
  getOsInfo 
} from './server/systemMonitor.js';
import { getAllMonitoredServices } from './server/servicesMonitor.js';
import {
  attachBrowserWebSocket,
  getBrowserHistory,
  getBrowserState,
  issueWsTicket,
  navigateBrowser,
  pauseBrowser,
  resumeBrowser,
  resetBrowserProfile,
  forceStopBrowser,
  startBrowser,
  stopBrowser,
  takeScreenshot
} from './server/browserSession.js';

// Configuração dinâmica de porta (Cloud Run injeta PORT), fallback para 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function timingSafeCompare(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

function getExpectedAdminPass(): string | null {
  const config = getServerConfig();
  const pass = (process.env.ADMIN_PASSWORD || config.auth?.adminPass || '').trim();
  return pass.length > 0 ? pass : null;
}

function getExpectedUserPass(): string | null {
  const config = getServerConfig();
  const pass = (process.env.USER_PASSWORD || config.auth?.userPass || '').trim();
  return pass.length > 0 ? pass : null;
}

function checkAdminPass(pass?: string): boolean {
  if (!pass) return false;
  const expected = getExpectedAdminPass();
  if (!expected) return false;
  return timingSafeCompare(pass, expected);
}

function checkUserPass(pass?: string): boolean {
  if (!pass) return false;
  const expected = getExpectedUserPass();
  if (!expected) return false;
  return timingSafeCompare(pass, expected);
}

function verifyApiKey(key?: string): boolean {
  if (!key) return false;
  const expected = (process.env.API_KEY || '').trim();
  if (!expected) return false;
  return timingSafeCompare(key, expected);
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

function extractCaller(req: express.Request): { authenticated: boolean; role?: 'admin' | 'user'; username?: string } {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (apiKeyHeader && verifyApiKey(apiKeyHeader)) {
    return { authenticated: true, role: 'admin', username: 'api-admin' };
  }

  const qToken = String((req.query as any)?.token || '');
  if (qToken && verifyApiKey(qToken)) {
    return { authenticated: true, role: 'admin', username: 'token-admin' };
  }
  const qAuth = String((req.query as any)?.auth || '');
  if (qAuth) {
    try {
      const decoded = Buffer.from(qAuth, 'base64').toString('utf-8');
      const colonIdx = decoded.indexOf(':');
      const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
      const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';
      const r = verifyUserPass(u, p);
      if (r.authenticated) return r;
    } catch {}
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const colonIdx = decoded.indexOf(':');
      const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
      const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';
      return verifyUserPass(u, p);
    } catch {
      return { authenticated: false };
    }
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (verifyApiKey(token)) {
      return { authenticated: true, role: 'admin', username: 'bearer-admin' };
    }
  }

  return { authenticated: false };
}

function getAllowedOrigins(): string[] {
  const envAllowed = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const envCors = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = [...envAllowed, ...envCors].filter(origin => origin !== '*');
  if (list.length === 0) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'];
  }
  return list;
}

function isOriginAllowed(origin?: string): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins();

  try {
    const originUrl = new URL(origin);
    for (const item of allowed) {
      if (item === origin) return true;
      try {
        const itemUrl = new URL(item);
        if (itemUrl.protocol === originUrl.protocol && itemUrl.hostname === originUrl.hostname && itemUrl.port === originUrl.port) {
          return true;
        }
      } catch {}
    }
    // Loopback sempre confiável em ambiente de desenvolvimento e testes
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1' || originUrl.hostname === '[::1]') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function applyCors(res: express.Response, req?: express.Request) {
  const origin = req?.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}

function expiredLiveHtml(){ return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#111;color:#eee;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div><h2>Link expirado</h2><p>Gere um novo link no Telegram.</p></div></body>`; }
function cameraLiveHtml(token:string, camId:string, expiresAt:number){
  const exp = new Date(expiresAt).toISOString();
  return `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Câmera Live</title>
<style>body{margin:0;background:#0b1020;color:#e5e7eb;font-family:system-ui,sans-serif} .wrap{max-width:980px;margin:0 auto;padding:12px} .top{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap} .badge{background:#1f2937;padding:8px 12px;border-radius:10px} .timer{font-size:20px;font-weight:700;color:#22c55e} .timer.warn{color:#f59e0b} .timer.bad{color:#ef4444} img{width:100%;max-height:72vh;object-fit:contain;background:#000;border-radius:12px} .grid{display:grid;grid-template-columns:repeat(3,72px);gap:8px;justify-content:center;margin-top:12px} button{padding:14px;border:0;border-radius:10px;background:#263041;color:#fff;font-size:18px;cursor:pointer} button:active{transform:scale(.98)} .muted{color:#9ca3af;font-size:13px}</style></head><body><div class=wrap>
<div class=top><div><div class=badge>Câmera: <b>${camId}</b></div><div class="muted" id=exp></div></div><div class=badge>Expira em <span id=t class=timer>--:--</span></div></div>
<div style="margin-top:12px"><img id=img src="/api/cameras/live/${token}/stream.mjpeg" alt="live"></div>
<div style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap"><button id=audBtn onclick="toggleAudio()">🔇 Ativar áudio</button><audio id=aud preload="none"></audio><span class=muted id=audSt></span></div>
<div class=grid>
  <div></div><button onclick="ptz('up')">⬆️</button><div></div>
  <button onclick="ptz('left')">⬅️</button><button onclick="ptz('stop')">⏹</button><button onclick="ptz('right')">➡️</button>
  <div></div><button onclick="ptz('down')">⬇️</button><div></div>
</div>
<p class=muted style="text-align:center">Link temporário. Ao expirar, gere outro no Telegram.</p>
</div><script>
const expAt=new Date(${JSON.stringify(exp)}).getTime();
const t=document.getElementById('t'), exp=document.getElementById('exp'); exp.textContent='Expira às '+new Date(expAt).toLocaleTimeString();
function tick(){const ms=expAt-Date.now(); if(ms<=0){t.textContent='00:00'; t.className='timer bad'; document.body.innerHTML='<div style="display:grid;place-items:center;height:100vh;font-family:sans-serif;background:#111;color:#eee"><div><h2>Link expirado</h2><p>Gere um novo link no Telegram.</p></div></div>'; return;} const s=Math.floor(ms/1000), m=Math.floor(s/60), rs=s%60; t.textContent=String(m).padStart(2,'0')+':'+String(rs).padStart(2,'0'); t.className='timer'+(ms<60000?' bad':ms<120000?' warn':''); }
tick(); setInterval(tick,1000);
async function ptz(action){ try{ await fetch('/api/cameras/live/${token}/ptz',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,speed:0.5})}); if(action!=='stop') setTimeout(()=>ptz('stop'),700);}catch(e){console.error(e)} }
let audioOn=false; async function toggleAudio(){ const a=document.getElementById('aud'), b=document.getElementById('audBtn'), st=document.getElementById('audSt'); if(audioOn){ a.pause(); a.removeAttribute('src'); a.load(); audioOn=false; b.textContent='🔇 Ativar áudio'; st.textContent=''; return; } a.src='/api/cameras/live/${token}/audio.mp3?ts='+Date.now(); try{ await a.play(); audioOn=true; b.textContent='🔊 Desativar áudio'; st.textContent='(pode ter atraso)'; }catch(e){ st.textContent='Falha ao iniciar áudio'; } }
</script></body></html>`;
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  applyCors(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const caller = extractCaller(req);
  if (!caller.authenticated) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Autenticação necessária. Credenciais de administrador requeridas.'
    });
  }

  if (caller.role !== 'admin') {
    return res.status(403).json({
      success: false,
      authenticated: true,
      error: 'Acesso negado: privilégios de administrador necessários para esta operação.'
    });
  }

  (req as any).user = caller;
  next();
}

function requireUserOrAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  applyCors(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const caller = extractCaller(req);
  if (!caller.authenticated) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Autenticação necessária. Faça login para acessar este recurso.'
    });
  }

  (req as any).user = caller;
  next();
}

export function createApp() {
  const app = express();
  loadMetricsHistory();
  loadAdGuardHistory();

  // Persist metrics history (best-effort, every 60s)
  setInterval(() => {
    try {
      const cpu = getCpuInfo();
      const mem = getMemoryInfo();
      const disk = getDiskInfo();
      const temp = getTemperatureInfo();
      const net = getNetworkInfo();
      const tempVal = (temp && (temp as any).temperatura_c != null) ? Number((temp as any).temperatura_c) : (Array.isArray((temp as any)?.sensores) && (temp as any).sensores[0]?.temperatura_c != null ? Number((temp as any).sensores[0].temperatura_c) : null);
      addMetricPoint({
        ts: Date.now(),
        cpu: Number((cpu as any)?.usage_percent ?? (cpu as any)?.uso_percentual ?? 0),
        ram: Number((mem as any)?.ram?.usage_percent ?? (mem as any)?.usage_percent ?? (mem as any)?.uso_percentual ?? 0),
        disk: Number((disk as any)?.root?.percent ?? (disk as any)?.percent ?? (disk as any)?.uso_percentual ?? 0),
        temp: tempVal,
        netRx: Number((net as any)?.total?.rx_bytes ?? 0),
        netTx: Number((net as any)?.total?.tx_bytes ?? 0),
      });
    } catch {}
  }, 60000).unref?.();

  app.use(express.json({ limit: '1mb' }));

  // Middleware de Cabeçalhos de Segurança e Validação Estrita de CORS
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const origin = req.headers.origin;
    if (origin) {
      if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
    }

    if (req.method === 'OPTIONS') {
      if (origin && !isOriginAllowed(origin)) {
        return res.status(403).json({ error: 'Origem CORS não autorizada.' });
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept');
      return res.status(204).end();
    }

    next();
  });

  // Health check endpoints for Google Cloud Run, Docker & monitoring probes
  app.get('/api/health', (req, res) => {
    let cpuPercent = 0;
    let ramPercent = 0;
    let tempC: number | null = null;
    let uptimeHuman = '';
    let uptimeSeconds = 0;
    let ipv4 = '';
    let ipv6 = '';
    let primaryInterface = '';
    let osName = 'Linux';
    let osVersion = '';

    try {
      const cpuInfo = getCpuInfo();
      cpuPercent = cpuInfo.uso_percentual || 0;
    } catch {}

    try {
      const memInfo = getMemoryInfo();
      ramPercent = memInfo.uso_percentual || memInfo.ram?.usage_percent || 0;
    } catch {}

    try {
      const t = getTemperatureInfo();
      if (t && t.disponivel && typeof t.temperatura_c === 'number') tempC = t.temperatura_c;
    } catch {}

    try {
      const u = getUptime();
      uptimeHuman = u.uptime_human || '';
      uptimeSeconds = u.uptime_seconds || 0;
    } catch {}

    try {
      const netInfo = getNetworkInfo();
      if (netInfo.primary_ip && netInfo.primary_ip !== '127.0.0.1') {
        ipv4 = netInfo.primary_ip;
      }
      if (netInfo.primary_ipv6) {
        ipv6 = netInfo.primary_ipv6;
      }
      if (netInfo.primary_interface) {
        primaryInterface = netInfo.primary_interface;
      }
    } catch {}

    try {
      const osInfo = getOsInfo();
      osName = osInfo.os || osName;
      osVersion = osInfo.os_version || '';
    } catch {}

    let conn = {
      connection_type: 'unknown' as 'wifi' | 'ethernet' | 'unknown',
      interface: primaryInterface,
      link_speed_mbps: null as number | null,
      wifi_signal_dbm: null as number | null,
      wifi_signal_percent: null as number | null,
      wifi_signal_quality: null as string | null
    };
    try {
      conn = getFastConnectivityStatus(primaryInterface);
    } catch {}

    res.status(200).json({ 
      status: 'online', 
      service: 'Server Monitor & AdGuard AI', 
      port: PORT,
      timestamp: new Date().toISOString(),
      telemetry: {
        cpu_percent: cpuPercent,
        ram_percent: ramPercent,
        temp_c: tempC,
        uptime_human: uptimeHuman,
        uptime_seconds: uptimeSeconds,
        ipv4,
        ipv6,
        primary_interface: conn.interface || primaryInterface,
        connection_type: conn.connection_type,
        link_speed_mbps: conn.link_speed_mbps,
        wifi_signal_dbm: conn.wifi_signal_dbm,
        wifi_signal_percent: conn.wifi_signal_percent,
        wifi_signal_quality: conn.wifi_signal_quality,
        os: osName,
        os_version: osVersion
      }
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

  // AdGuard Configuration (GET/POST exigem privilégio administrativo - pode conter credenciais)
  app.get('/api/adguard/config', requireAdminAuth, (req, res) => {
    res.json(getAdGuardConfig());
  });

  app.post('/api/adguard/config', requireAdminAuth, (req, res) => {
    const updated = updateAdGuardConfig(req.body);
    res.json({ success: true, config: updated });
  });

  // MikroTik (leitura, diagnósticos e controle de dispositivos)
  app.get('/api/mikrotik/status', requireUserOrAdminAuth, async (_req, res) => {
    try { const live = await mikrotikGetStatus(); res.json({ ...live, devices: listMikrotikDevices(), events: listMikrotikEvents(50), snapshots: listMikrotikSnapshots(60) }); }
    catch (e:any) { const cached = getMikrotikCached(); if (cached) return res.json({ ...cached, stale:true, error:e?.message }); res.status(500).json({ ok:false, error: e?.message || String(e) }); }
  });
  app.get('/api/mikrotik/test', requireAdminAuth, async (_req, res) => { try { res.json(await mikrotikTestConnection()); } catch (e:any) { res.status(500).json({ ok:false, error: e?.message || String(e) }); } });
  app.post('/api/mikrotik/poll', requireAdminAuth, async (_req,res)=>{ try { res.json({ ok:true, data: await pollMikrotikOnce() }); } catch(e:any){ res.status(500).json({ok:false,error:e?.message||String(e)});} });
  app.get('/api/mikrotik/devices', requireUserOrAdminAuth, (_req,res)=> res.json({ ok:true, devices:listMikrotikDevices() }));
  app.get('/api/mikrotik/events', requireUserOrAdminAuth, (req,res)=> res.json({ ok:true, events:listMikrotikEvents(Math.min(500, Number(req.query.limit)||100)) }));
  app.get('/api/mikrotik/snapshots', requireUserOrAdminAuth, (req,res)=> res.json({ ok:true, snapshots:listMikrotikSnapshots(Math.min(500, Number(req.query.limit)||120)) }));
  app.post('/api/mikrotik/devices/:mac/nickname', requireAdminAuth, (req,res)=>{ try { const actor = (req as any).user?.username || 'admin'; const role = (req as any).user?.role || 'admin'; setMikrotikDeviceNickname(req.params.mac, String(req.body?.nickname||'')); logAudit({ actor, action: 'mikrotik.nickname', target: req.params.mac, details: String(req.body?.nickname||''), status:'success', role, ip:req.ip||'' }); res.json({ok:true}); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/devices/:mac/icon', requireAdminAuth, (req,res)=>{ try { const actor = (req as any).user?.username || 'admin'; const role = (req as any).user?.role || 'admin'; setMikrotikDeviceIcon(req.params.mac, String(req.body?.icon||'')); logAudit({ actor, action: 'mikrotik.icon', target: req.params.mac, details: String(req.body?.icon||''), status:'success', role, ip:req.ip||'' }); res.json({ok:true}); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/devices/:mac/block', requireAdminAuth, async (req,res)=>{ try { const actor = (req as any).user?.username || 'admin'; const role = (req as any).user?.role || 'admin'; const r=await mikrotikBlockDevice(req.params.mac); addMikrotikEvent({ event_type:'block', mac:req.params.mac, details:'Bloqueado via painel' }); logAudit({ actor, action:'mikrotik.block', target:req.params.mac, details:'block', status:'success', role, ip:req.ip||'' }); res.json(r); } catch(e:any){ res.status(500).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/devices/:mac/unblock', requireAdminAuth, async (req,res)=>{ try { const actor = (req as any).user?.username || 'admin'; const role = (req as any).user?.role || 'admin'; const r=await mikrotikUnblockDevice(req.params.mac); addMikrotikEvent({ event_type:'unblock', mac:req.params.mac, details:'Desbloqueado via painel' }); logAudit({ actor, action:'mikrotik.unblock', target:req.params.mac, details:'unblock', status:'success', role, ip:req.ip||'' }); res.json(r); } catch(e:any){ res.status(500).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/ping', requireAdminAuth, async (req,res)=>{ try { const r=await mikrotikRunPing(String(req.body?.target||''), Number(req.body?.count||4)); res.json(r); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/traceroute', requireAdminAuth, async (req,res)=>{ try { res.json(await mikrotikTraceroute(String(req.body?.target||''))); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/dns', requireAdminAuth, async (req,res)=>{ try { res.json(await mikrotikDnsLookup(String(req.body?.name||''))); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)});} });
  app.get('/api/mikrotik/dns-settings', requireUserOrAdminAuth, async (_req,res)=>{ try { res.json(await mikrotikGetDnsSettings()); } catch(e:any){ res.status(500).json({ok:false,error:e?.message||String(e)});} });
  app.post('/api/mikrotik/dns-settings', requireAdminAuth, async (req,res)=>{
    try {
      const actor = (req as any).user?.username || 'admin';
      const role = (req as any).user?.role || 'admin';
      const servers = Array.isArray(req.body?.servers) ? req.body.servers.map((s:any)=>String(s)) : String(req.body?.servers||'').split(',').map(s=>s.trim()).filter(Boolean);
      const r = await mikrotikSetDnsServers(servers, { dhcpDns: String(req.body?.dhcpDns||''), applyDhcp: req.body?.applyDhcp !== false });
      addMikrotikEvent({ event_type:'dns_config', details:`DNS do roteador -> ${servers.join(',')}` });
      logAudit({ actor, action:'mikrotik.dns_config', target:'dns', details:`servers=${servers.join(',')} previous=${r.previous?.servers||''}`, status:'success', role, ip:req.ip||'' });
      res.json(r);
    } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)}); }
  });
  app.get('/api/mikrotik/logs', requireUserOrAdminAuth, async (req,res)=>{ try { res.json(await mikrotikGetLogs(Number(req.query.lines)||100, String(req.query.filter||''))); } catch(e:any){ res.status(500).json({ok:false,error:e?.message||String(e)});} });
  let mikrotikBandwidthCache: { at: number; payload: any } | null = null;
  app.get('/api/mikrotik/bandwidth', requireUserOrAdminAuth, async (_req,res)=>{
    try {
      if (mikrotikBandwidthCache && Date.now() - mikrotikBandwidthCache.at < 3000) return res.json(mikrotikBandwidthCache.payload);
      const ips = listMikrotikDevices().map((d:any)=>d.ip || d.last_ip).filter(Boolean);
      const payload = await mikrotikGetBandwidth(ips);
      mikrotikBandwidthCache = { at: Date.now(), payload };
      res.json(payload);
    } catch(e:any){ res.status(500).json({ok:false,error:e?.message||String(e)}); }
  });
  app.post('/api/mikrotik/devices/:mac/make-static', requireAdminAuth, async (req,res)=>{ try { const actor = (req as any).user?.username || 'admin'; const role = (req as any).user?.role || 'admin'; const r=await mikrotikMakeLeaseStatic(req.params.mac, String(req.body?.address||''), String(req.body?.comment||'')); addMikrotikEvent({ event_type:'dhcp_static', mac:req.params.mac, ip:req.body?.address, details:'Lease tornado estático' }); logAudit({ actor, action:'mikrotik.dhcp_static', target:req.params.mac, details:String(req.body?.address||''), status:'success', role, ip:req.ip||'' }); res.json(r); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)});} });

  // Câmeras (ao vivo, sem gravação no servidor)
  app.get('/api/cameras', requireUserOrAdminAuth, async (_req, res) => {
    try { res.json(await getCameraStatus()); } catch (e:any) { res.status(500).json({ ok:false, error: e?.message || String(e) }); }
  });
  app.get('/api/cameras/config', requireAdminAuth, (_req, res) => {
    try { res.json({ ok:true, cameras: getPublicCameras().map(c=>({...c})) }); } catch (e:any) { res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.post('/api/cameras/config', requireAdminAuth, async (req, res) => {
    try {
      const cam = addCameraConfig(req.body || {});
      res.json({ ok:true, camera: cam, capabilities: brandCapabilities((cam as any)?.brand || 'generic') });
    } catch (e:any) { res.status(400).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.delete('/api/cameras/:id/config', requireAdminAuth, async (req, res) => {
    try { res.json(deleteCameraConfig(req.params.id)); }
    catch (e:any) { res.status(400).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.post('/api/cameras/start', requireAdminAuth, async (_req, res) => {
    res.json(await ensureGo2rtcRunning());
  });
  app.get('/api/cameras/:id/details', requireUserOrAdminAuth, async (req, res) => {
    try { res.json(await getCameraDetails(req.params.id)); }
    catch (e:any) { res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.post('/api/cameras/:id/ptz', requireAdminAuth, async (req, res) => {
    try { const action = String(req.body?.action || ''); const speed = Number(req.body?.speed); res.json(await cameraPtz(req.params.id, action, Number.isFinite(speed)?speed:undefined)); }
    catch (e:any) { res.status(400).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.get('/api/cameras/:id/recordings', requireUserOrAdminAuth, async (req, res) => {
    try { res.json(await cameraProbeRecordings(req.params.id)); }
    catch (e:any) { res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.post('/api/cameras/:id/led', requireAdminAuth, async (req, res) => {
    try { const mode = String(req.body?.mode || 'auto'); res.json(await cameraLed(req.params.id, mode as any)); }
    catch (e:any) { res.status(400).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.get(['/api/cameras/:id/audio.wav','/api/cameras/:id/audio.mp3'], requireUserOrAdminAuth, async (req,res) => {
    await serveLiveAudio(req, res, req.params.id);
  });
  // Proxy de mídia: somente leitura, autenticado
  app.get('/api/cameras/:id/stream/:kind/frame.jpeg', requireUserOrAdminAuth, async (req,res) => {
    await proxyCameraRequest(req, res, req.params.id, req.params.kind === 'sub' ? 'sub' : 'main', 'frame.jpeg');
  });
  app.get('/api/cameras/:id/stream/:kind/stream.mjpeg', requireUserOrAdminAuth, async (req,res) => {
    await serveLiveMjpeg(req, res, req.params.id, req.params.kind === 'sub' ? 'sub' : 'main');
  });
  app.post('/api/cameras/:id/webrtc/:kind', requireUserOrAdminAuth, async (req,res) => {
    await proxyWebrtcOffer(req, res, req.params.id, req.params.kind === 'sub' ? 'sub' : 'main');
  });
  app.get('/api/cameras/:id/stream/:kind/stream.mp4', requireUserOrAdminAuth, async (req,res) => {
    await proxyCameraRequest(req, res, req.params.id, req.params.kind === 'sub' ? 'sub' : 'main', 'stream.mp4');
  });

  // Token temporário de câmera (5 min) - sem auth, token no path
  app.get('/api/cameras/live/:token', async (req,res) => {
    const rec = getCameraLiveToken(req.params.token);
    if (!rec) { res.status(410).send(expiredLiveHtml()); return; }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(cameraLiveHtml(req.params.token, rec.camId, rec.expiresAt));
  });
  app.get('/api/cameras/live/:token/stream.mjpeg', async (req,res) => {
    const rec = getCameraLiveToken(req.params.token);
    if (!rec) { res.status(410).json({ ok:false, error:'Link expirado ou inválido.' }); return; }
    await serveLiveMjpeg(req, res, rec.camId, rec.kind);
  });
  app.get('/api/cameras/live/:token/frame.jpeg', async (req,res) => {
    const rec = getCameraLiveToken(req.params.token);
    if (!rec) { res.status(410).json({ ok:false, error:'Link expirado ou inválido.' }); return; }
    await proxyCameraRequest(req, res, rec.camId, rec.kind, 'frame.jpeg');
  });
  app.get('/api/cameras/live/:token/audio.mp3', async (req,res) => {
    const rec = getCameraLiveToken(req.params.token);
    if (!rec) { res.status(410).json({ ok:false, error:'Link expirado ou inválido.' }); return; }
    await serveLiveAudio(req, res, rec.camId);
  });
  app.post('/api/cameras/live/:token/ptz', async (req,res) => {
    const rec = getCameraLiveToken(req.params.token);
    if (!rec) { res.status(410).json({ ok:false, error:'Link expirado ou inválido.' }); return; }
    try { const action = String(req.body?.action||''); const speed = Number(req.body?.speed); const r = await cameraPtz(rec.camId, action, Number.isFinite(speed)?speed:0.5); res.json(r); } catch(e:any){ res.status(400).json({ok:false,error:e?.message||String(e)}); }
  });

  // AdGuard Status
  app.get('/api/adguard/status', requireUserOrAdminAuth, async (req, res) => {
    try {
      const status = await fetchAdGuardStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AdGuard Statistics
  app.get('/api/adguard/stats', requireUserOrAdminAuth, async (req, res) => {
    try {
      const stats = await fetchAdGuardStats();
      if (stats && (stats.connected || stats.online) && !stats.stale) {
        addAdGuardSample(Number(stats.num_dns_queries || 0), Number(stats.num_blocked_filtering || 0));
      }
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/adguard/history', requireUserOrAdminAuth, async (req, res) => {
    const now = Date.now();
    const maxWindowMs = 7 * 24 * 3600 * 1000;
    const fromQ = Number(req.query.from);
    const toQ = Number(req.query.to);
    const end = Number.isFinite(toQ) ? Math.min(now, toQ) : now;
    const defaultStart = end - 24 * 3600 * 1000;
    let start = Number.isFinite(fromQ) ? fromQ : defaultStart;
    start = Math.max(end - maxWindowMs, Math.min(start, end - 60 * 1000));
    const bucketMs = 60 * 1000; // fixed 1 min

    let rawPoints = getAdGuardHistory(maxWindowMs);
    if (rawPoints.length === 0) {
      try {
        const stats = await fetchAdGuardStats();
        const dq = Array.isArray(stats?.dns_queries) ? stats.dns_queries : [];
        const db = Array.isArray(stats?.blocked_filtering) ? stats.blocked_filtering : [];
        const n = Math.min(dq.length, db.length);
        if (n > 0) {
          const hourMs = 3600 * 1000;
          for (let i = 0; i < n; i++) {
            const q = Math.max(0, Number(dq[i]) || 0);
            const b = Math.max(0, Number(db[i]) || 0);
            const hourEnd = now - (n - 1 - i) * hourMs;
            for (let k = 1; k <= 60; k++) {
              const ts = hourEnd - (60 - k) * 60 * 1000;
              const dq1 = q / 60; const db1 = b / 60;
              rawPoints.push({ ts, totalQueries: 0, totalBlocked: 0, deltaQueries: dq1, deltaBlocked: Math.min(db1, dq1) });
            }
          }
        }
      } catch {}
    }

    const buckets = Math.max(1, Math.ceil((end - start) / bucketMs));
    const agg = Array.from({ length: buckets }, (_, i) => ({ ts: start + (i + 1) * bucketMs, deltaQueries: 0, deltaBlocked: 0 }));
    for (const p of rawPoints) {
      const ts = Number(p.ts);
      if (!Number.isFinite(ts) || ts <= start || ts > end) continue;
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((ts - start - 1) / bucketMs)));
      const dq = Math.max(0, Number(p.deltaQueries) || 0);
      const db = Math.max(0, Number(p.deltaBlocked) || 0);
      agg[idx].deltaQueries += dq;
      agg[idx].deltaBlocked += Math.min(db, dq);
    }
    // Downsample for transport/render safety
    const maxPoints = 2000;
    let points = agg;
    if (agg.length > maxPoints) {
      const step = Math.ceil(agg.length / maxPoints);
      const ds = [];
      for (let i = 0; i < agg.length; i += step) {
        const chunk = agg.slice(i, i + step);
        ds.push({
          ts: chunk[chunk.length - 1].ts,
          deltaQueries: chunk.reduce((s, c) => s + c.deltaQueries, 0),
          deltaBlocked: chunk.reduce((s, c) => s + c.deltaBlocked, 0),
        });
      }
      points = ds;
    }
    res.json({ success: true, from: start, to: end, bucket: '1m', intervalMs: bucketMs, points, meta: getAdGuardHistoryMeta() });
  });

  // Sincronização direta de dados reais do AdGuard (/control/stats) - administrativo
  app.post('/api/adguard/sync', requireAdminAuth, (req, res) => {
    try {
      const rawData = req.body;
      const updated = updateAdGuardRawStats(rawData);
      res.json({ success: true, stats: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Limpar histórico e estatísticas do AdGuard - administrativo
  app.post('/api/adguard/clear-history', requireAdminAuth, async (req, res) => {
    try {
      const result = await clearAdGuardHistory();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Retornar o comando de shell para limpar histórico no Ubuntu
  app.get('/api/adguard/clear-command', requireAdminAuth, (req, res) => {
    res.json({ shellCommand: getAdGuardClearCommand() });
  });

  // Filtragem AdGuard: listar regras de usuário e bloquear/desbloquear domínio (admin)
  app.get('/api/adguard/filtering/status', requireUserOrAdminAuth, async (req, res) => {
    try {
      const data = await getAdGuardFilteringStatus();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/adguard/filtering/block', requireAdminAuth, async (req, res) => {
    try {
      const domain = String(req.body?.domain || '').trim();
      const blocked = req.body?.blocked !== false;
      if (!domain) return res.status(400).json({ error: 'Domínio é obrigatório.' });
      const result = await setAdGuardDomainBlocked(domain, blocked);
      const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: blocked?'adguard_block_domain':'adguard_unblock_domain', target: domain, details: `${blocked?'Bloqueio':'Desbloqueio'} de domínio no AdGuard`, status: 'success' });
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/adguard/filtering/set-rules', requireAdminAuth, async (req, res) => {
    try {
      const rules = Array.isArray(req.body?.rules) ? req.body.rules : null;
      if (!rules) return res.status(400).json({ error: 'Lista de regras inválida.' });
      const result = await setAdGuardUserRules(rules);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Rate limiting de tentativas de login por IP (5 tentativas incorretas em 5 minutos -> HTTP 429)
  const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

  // Verificação de autenticação de dois usuários: admin e user
  app.get('/api/auth/verify', async (req, res) => {
    applyCors(res, req);
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
      logAudit({ actor: authenticatedUser, role: userRole, ip: clientIp, action: 'login', target: 'panel', details: 'Login bem-sucedido', status: 'success' });
      void notifyTelegramLoginSuccess(authenticatedUser, userRole, clientIp);
      return res.json({
        authenticated: true,
        user: authenticatedUser,
        role: userRole,
        timestamp: new Date().toISOString()
      });
    }

    // Falha: incrementa contador de tentativas com janela de 5 minutos
    let attemptedUser = 'desconhecido';
    try {
      if (authHeader && authHeader.startsWith('Basic ')) {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
        const colonIdx = decoded.indexOf(':');
        attemptedUser = (colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded).trim() || 'desconhecido';
      } else if (!authHeader && !apiKeyHeader) {
        attemptedUser = 'sem_credenciais';
      }
    } catch {}
    recordPanelFailedLogin(clientIp, attemptedUser);
    logAudit({ actor: attemptedUser, role: 'unknown', ip: clientIp, action: 'login_failed', target: 'panel', details: `Tentativa de login falhou (usuário: ${attemptedUser})`, status: 'failure', meta: { attemptedUser } });
    void notifyTelegramLoginFailure(clientIp, attemptedUser);
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
    applyCors(res, req);
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

    const vaultPassword = (process.env.VAULT_PASSWORD || getExpectedAdminPass() || '').trim();
    if (!vaultPassword) {
      return res.status(503).json({
        ok: false,
        error: 'Cofre desabilitado por segurança: nenhuma senha mestra configurada em VAULT_PASSWORD.'
      });
    }

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
          sshPassword: process.env.VAULT_SSH_PASSWORD || ''
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

  const measureIcmpPing = async (host: string): Promise<number | null> => {
    return new Promise((resolve) => {
      if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
        return resolve(null);
      }
      execFile('ping', ['-c', '1', '-W', '1', host], { timeout: 1200 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(null);
        }
        const match = stdout.match(/time[=<]([0-9.]+)\s*ms/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          return resolve(Math.round(val));
        }
        resolve(null);
      });
    });
  };

  // Endpoint de Ping do servidor para a internet (com resolução híbrida TCP/ICMP/HTTP de alta confiabilidade)
  app.get('/api/ping', async (req, res) => {
    applyCors(res, req);
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

          // Se for gateway local e porta 80 falhou, tenta porta 53 ou 443 antes do ICMP
          if (pingMs === null && t.type === 'local') {
            pingMs = await measureTcpPing(t.host, 53, 300);
            if (pingMs === null) {
              pingMs = await measureTcpPing(t.host, 443, 300);
            }
          }

          // Fallback via ICMP ping nativo do sistema
          if (pingMs === null) {
            pingMs = await measureIcmpPing(t.host);
          }

          // Fallback HTTP instantâneo se porta 53 TCP e ICMP forem bloqueados
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

  // Traceroute progressivo (stream SSE): envia cada salto assim que descoberto (multi-probe + rDNS)
  app.get('/api/trace/stream', async (req, res) => {
    applyCors(res, req);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const rawHost = String(req.query.host || '').trim();
    const host = rawHost.slice(0, 253);
    if (!host || !/^[a-zA-Z0-9._:-]+$/.test(host)) {
      res.write(`event: trace-error\ndata: ${JSON.stringify({ error: 'Host inválido' })}\n\n`);
      return res.end();
    }
    const maxHops = Math.max(1, Math.min(30, parseInt(String(req.query.maxHops || '30'), 10) || 30));
    const probes = Math.max(1, Math.min(5, parseInt(String(req.query.probes || '3'), 10) || 3));

    let closed = false;
    req.on('close', () => { closed = true; });

    const send = (event: string, data: any) => {
      if (closed) return;
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
    };

    const rdnsCache = new Map<string, string | null>();
    const resolveRdns = async (ip: string): Promise<string | null> => {
      if (!ip || ip === '???') return null;
      if (rdnsCache.has(ip)) return rdnsCache.get(ip) || null;
      try {
        const names = await Promise.race([
          dns.promises.reverse(ip),
          new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 900))
        ]) as string[];
        const name = (names && names[0]) ? String(names[0]) : null;
        rdnsCache.set(ip, name);
        return name;
      } catch {
        rdnsCache.set(ip, null);
        return null;
      }
    };

    try {
      for (let ttl = 1; ttl <= maxHops && !closed; ttl++) {
        const samples: number[] = [];
        let hopIp: string | null = null;
        let reached = false;
        let sent = 0;

        for (let p = 0; p < probes && !closed; p++) {
          sent++;
          const t0 = Date.now();
          let stdout = '';
          let stderr = '';
          try {
            const r = await execFileAsync('ping', ['-c', '1', '-W', '1', '-n', '-t', String(ttl), host], { timeout: 2200 });
            stdout = r.stdout || '';
            stderr = r.stderr || '';
          } catch (e: any) {
            stdout = e?.stdout || '';
            stderr = e?.stderr || '';
          }
          const out = `${stdout}\n${stderr}`;

          const replyM = out.match(/\d+\s+bytes\s+from\s+([^:\s]+).*time[=<]([0-9.]+)\s*ms/i);
          const exM = out.match(/From\s+([^\s]+)[\s\S]*?(Time to live exceeded|Time exceeded)/i);
          const unreachM = !exM ? out.match(/From\s+([^\s]+)[\s\S]*?(Destination|Unreachable)/i) : null;

          if (replyM) {
            hopIp = replyM[1];
            samples.push(parseFloat(replyM[2]));
            reached = true;
          } else if (exM || unreachM) {
            const ip = (exM || unreachM)![1].replace(/:$/, '');
            hopIp = ip;
            samples.push(Math.max(1, Date.now() - t0));
          } else {
            // timeout: no sample
          }
        }

        const valid = samples.filter(v => Number.isFinite(v));
        const lossCount = Math.max(0, sent - valid.length);
        const lossPct = sent > 0 ? Math.round((lossCount / sent) * 100) : 100;
        const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
        const best = valid.length ? Math.min(...valid) : 0;
        const wrst = valid.length ? Math.max(...valid) : 0;
        const last = valid.length ? valid[valid.length - 1] : 0;
        const stdev = valid.length > 1 ? Math.sqrt(valid.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / valid.length) : 0;
        const ip = hopIp || '???';
        const rdns = ip !== '???' ? await resolveRdns(ip) : null;

        const hopData: any = {
          count: ttl,
          host: ip,
          rdns: rdns || undefined,
          loss: lossPct,
          sent,
          last: Math.round(last * 100) / 100,
          avg: Math.round(avg * 100) / 100,
          best: Math.round(best * 100) / 100,
          wrst: Math.round(wrst * 100) / 100,
          stdev: Math.round(stdev * 100) / 100,
        };
        if (ip === '???' || lossPct >= 100) hopData.timeout = true;
        if (reached) hopData.reached = true;
        send('hop', hopData);

        if (reached) { send('done', { hops: ttl, reached: true }); break; }
        if (ttl === maxHops) send('done', { hops: ttl, reached: false });
      }
    } catch (e: any) {
      send('trace-error', { error: e?.message || 'Falha no rastreamento' });
    } finally {
      if (!closed) { try { res.end(); } catch {} }
    }
  });

  // Traceroute/MTR em tempo real (path trace com latência por salto) - dados reais via mtr
  app.get('/api/trace', async (req, res) => {
    applyCors(res, req);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const rawHost = String(req.query.host || '').trim();
    const host = rawHost.slice(0, 253);
    // validação estrita para evitar injeção (execFile já usa argv, mas reforça)
    if (!host || !/^[a-zA-Z0-9._:-]+$/.test(host)) {
      return res.status(400).json({ success: false, error: 'Host inválido', host: rawHost, hops: [] });
    }

    try {
      const cycles = Math.max(1, Math.min(5, parseInt(String(req.query.cycles || '3'), 10) || 3));
      const args = ['-r', '-c', String(cycles), '-n', '-j', host];
      const { stdout } = await execFileAsync('mtr', args, { timeout: 30000, maxBuffer: 1024 * 1024 });
      let parsed: any = null;
      try { parsed = JSON.parse(stdout); } catch { parsed = null; }
      const hubs = Array.isArray(parsed?.report?.hubs) ? parsed.report.hubs : [];
      const hops = hubs.map((h: any) => ({
        count: Number(h.count) || 0,
        host: String(h.host ?? '???'),
        loss: Number(h['Loss%'] ?? h.Loss ?? 0),
        sent: Number(h.Snt ?? 0),
        last: Number(h.Last ?? 0),
        avg: Number(h.Avg ?? 0),
        best: Number(h.Best ?? 0),
        wrst: Number(h.Wrst ?? 0),
        stdev: Number(h.StDev ?? 0),
      }));
      return res.json({
        success: true,
        host,
        timestamp: new Date().toISOString(),
        hops,
        cycles,
        source: 'mtr'
      });
    } catch (err: any) {
      // fallback: tenta tracepath se mtr falhar
      try {
        const { stdout } = await execFileAsync('tracepath', ['-n', host], { timeout: 20000, maxBuffer: 1024 * 1024 });
        const lines = String(stdout).split('\n').map(l => l.trim()).filter(Boolean);
        const hops: any[] = [];
        for (const line of lines) {
          const m = line.match(/^(\d+)[:?]?\s+(\S+)(?:\s+([0-9.]+)ms)?/);
          if (!m) continue;
          const hopHost = m[2] === 'no' && line.includes('no reply') ? '???' : m[2];
          const ms = m[3] ? parseFloat(m[3]) : 0;
          const isNo = hopHost === '???' || line.includes('no reply');
          hops.push({ count: parseInt(m[1], 10), host: hopHost, loss: isNo ? 100 : 0, sent: 1, last: ms, avg: ms, best: ms, wrst: ms, stdev: 0 });
        }
        return res.json({ success: true, host, timestamp: new Date().toISOString(), hops, cycles: 1, source: 'tracepath', warning: err?.message || 'mtr indisponível, usando tracepath' });
      } catch (err2: any) {
        return res.status(500).json({ success: false, host, timestamp: new Date().toISOString(), hops: [], error: err?.message || 'Falha ao executar trace', fallbackError: err2?.message });
      }
    }
  });

  // Wi-Fi status, signal, neighbors and reconnect info
  app.get('/api/wifi', requireAdminAuth, (_req, res) => {
    try {
      return res.json(getWifiInfo());
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Falha ao obter dados Wi-Fi' });
    }
  });

  app.post('/api/wifi/scan', requireAdminAuth, (_req, res) => {
    try {
      const result = triggerWifiScan('wlo1');
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Falha ao iniciar scan Wi-Fi' });
    }
  });

  app.post('/api/wifi/connect', requireAdminAuth, (req, res) => {
    try {
      const { ssid, password } = req.body || {};
      const result = connectWifi(String(ssid || ''), String(password ?? ''));
      const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'wifi_connect', target: String(ssid||''), details: result.success ? 'Conexão Wi-Fi solicitada' : `Falha Wi-Fi: ${result.message||''}`, status: result.success?'success':'failure' });
      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Falha ao conectar Wi-Fi' });
    }
  });

  // Rotas nativas do n8n Workflow Automation
  app.get('/api/n8n/status', async (req, res) => {
    applyCors(res, req);
    try {
      const status = await fetchN8nFallback();
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/n8n/config', requireAdminAuth, async (req, res) => {
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

  app.post('/api/n8n/workflows/:id/toggle', requireAdminAuth, async (req, res) => {
    try {
      const id = req.params.id;
      const active = Boolean(req.body?.active);
      const result = await toggleN8nWorkflowFallback(id, active);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Controle do container n8n (Docker) - iniciar/parar para economizar RAM
  app.post('/api/n8n/start', requireAdminAuth, async (req, res) => {
    applyCors(res, req);
    const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const startContainer = async () => execFileAsync('docker', ['start', 'n8n'], { timeout: 30000 });
    try {
      try {
        await startContainer();
      } catch (err: any) {
        const raw = String(err?.stderr || err?.message || '');
        if (/docker daemon|Cannot connect to the Docker daemon|Is the docker daemon running/i.test(raw)) {
          await execFileAsync('systemctl', ['start', 'docker'], { timeout: 30000 });
          await new Promise(r => setTimeout(r, 1500));
          await startContainer();
        } else {
          throw err;
        }
      }
      const status = await fetchN8nFallback();
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'n8n_start', target: 'n8n', details: 'Container n8n iniciado', status: 'success' });
      return res.json({ success: true, message: 'Container n8n iniciado.', status });
    } catch (err: any) {
      const msg = String(err?.stderr || err?.message || 'Falha ao iniciar n8n').slice(0, 300);
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'n8n_start', target: 'n8n', details: msg, status: 'failure' });
      return res.status(500).json({ success: false, error: msg });
    }
  });

  app.post('/api/n8n/stop', requireAdminAuth, async (req, res) => {
    applyCors(res, req);
    const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    try {
      await execFileAsync('docker', ['update', '--restart=no', 'n8n'], { timeout: 15000 }).catch(() => ({}));
      await execFileAsync('docker', ['stop', 'n8n'], { timeout: 30000 });
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'n8n_stop', target: 'n8n', details: 'Container n8n parado para economizar RAM', status: 'success' });
      return res.json({ success: true, message: 'Container n8n parado (restart desativado para economizar RAM).' });
    } catch (err: any) {
      const msg = String(err?.stderr || err?.message || 'Falha ao parar n8n').slice(0, 300);
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'n8n_stop', target: 'n8n', details: msg, status: 'failure' });
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // Rotas do Explorador de Arquivos (Protegidas exclusivamente para administradores)
  app.get('/api/files/list', requireAdminAuth, async (req, res) => {
    try {
      const targetPath = (req.query.path as string) || '';
      const data = await listDirectory(targetPath);
      return res.json(data);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/files/read', requireAdminAuth, async (req, res) => {
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
  app.post('/api/files/create', requireAdminAuth, async (req, res) => {
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
  app.post('/api/files/save', requireAdminAuth, async (req, res) => {
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

  // Obter stream binário de arquivo/foto diretamente
  app.get('/api/files/raw', requireAdminAuth, async (req, res) => {
    try {
      const targetPath = req.query.path as string;
      if (!targetPath) {
        return res.status(400).send('Caminho não fornecido.');
      }
      const resolved = assertPathSecurity(targetPath);
      if (!fs.existsSync(resolved)) {
        return res.status(404).send('Arquivo não encontrado.');
      }
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) {
        return res.status(400).send('Diretório não suportado.');
      }
      return res.sendFile(resolved);
    } catch (err: any) {
      return res.status(400).send(err.message);
    }
  });

  // Rotas do Opencode & AI Tokens
  app.get('/api/opencode/models', requireAdminAuth, async (req, res) => {
    try {
      const models = await listOpencodeModels();
      return res.json({ models, defaultModel: OPENCODE_MODEL });
    } catch (err: any) {
      return res.status(500).json({ error: err.message, models: [OPENCODE_MODEL], defaultModel: OPENCODE_MODEL });
    }
  });

  app.get('/api/opencode/tokens', requireAdminAuth, (req, res) => {
    try {
      const metrics = getTokenQuotaMetrics();
      return res.json(metrics);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/opencode/sessions', requireAdminAuth, (req, res) => {
    try {
      const sessions = listOpencodeSessions();
      return res.json(sessions);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/opencode/sessions/:id', requireAdminAuth, (req, res) => {
    try {
      const data = getOpencodeSession(req.params.id);
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/opencode/sessions/new', requireAdminAuth, (req, res) => {
    try {
      const title = (req.body?.title as string) || '';
      const model = (req.body?.model as string) || undefined;
      const session = createOpencodeSession(title, model);
      return res.json(session);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/opencode/sessions/:id', requireAdminAuth, (req, res) => {
    try {
      const { model } = req.body || {};
      const validModel = sanitizeModel(model);
      if (!validModel) {
        return res.status(400).json({ error: 'Modelo inválido. Use o formato provedor/modelo.' });
      }
      const updated = updateOpencodeSessionModel(req.params.id, validModel);
      if (!updated) {
        return res.status(404).json({ error: 'Sessão não encontrada.' });
      }
      return res.json({ success: true, session: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/opencode/sessions/:id', requireAdminAuth, (req, res) => {
    try {
      const deleted = deleteOpencodeSession(req.params.id);
      return res.json({ success: deleted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/opencode/chat', requireAdminAuth, async (req, res) => {
    try {
      const { sessionId, prompt, model } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt é obrigatório.' });
      }
      const result = await askOpencodeAgent(sessionId || '', prompt, model);

      // Anexa screenshot do navegador remoto quando solicitado (foto/print/tela) ou quando o agente incluir [SCREENSHOT]
      try {
        const wants = /(\bfoto\b|\bprint\b|screenshot|captura|printscreen|\btela\b|\bimagem\b|\bscreen\b)/i.test(prompt);
        const marked = /\[(SCREENSHOT|CAPTURA)\]/i.test(result?.reply?.content || '');
        if (wants || marked) {
          try {
            const buf = await takeScreenshot();
            if (buf && buf.length > 0) {
              result.reply.imageDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
              // remove marcador do texto visível
              if (result.reply.content) {
                result.reply.content = result.reply.content.replace(/\s*\[(SCREENSHOT|CAPTURA)\]\s*/gi, '\n').trim();
              }
            } else if (wants && result.reply && !/\[SCREENSHOT\]/i.test(result.reply.content || '')) {
              // sem imagem disponível: mantém resposta do agente
            }
          } catch (e: any) {
            if (wants && result.reply) {
              const reason = e?.message || 'sessão do navegador remoto inativa';
              result.reply.content = (result.reply.content || '') + `\n\n[Captura indisponível: ${reason}. Inicie o Navegador Remoto no painel para permitir screenshots.]`;
            }
          }
        }
      } catch {}

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Rotas de Credenciais e Variáveis de Sistema (Protegidas exclusivamente para administradores)
  app.get('/api/credentials', requireAdminAuth, (req, res) => {
    const config = getServerConfig();
    return res.json(config);
  });

  app.post('/api/credentials', requireAdminAuth, (req, res) => {
    try {
      const updated = saveServerConfig(req.body);
      const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'credentials_update', target: 'server-config', details: 'Credenciais/configurações atualizadas', status: 'success' });
      return res.json({ success: true, message: 'Configurações salvas em server-config.json com sucesso.', config: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });


  // Histórico de tentativas de login do painel (IP, usuário tentado, localidade)
  app.get('/api/security/login-attempts', requireAdminAuth, async (req, res) => {
    try {
      const { getPanelFailedAttempts, resolveIpLocation } = await import('./server/securityMonitor.js');
      const attempts = getPanelFailedAttempts(200);
      const enriched = await Promise.all(attempts.map(async (a) => {
        let loc: any = null;
        try { loc = await resolveIpLocation(a.ip); } catch {}
        return { ...a, location: loc };
      }));
      return res.json({ attempts: enriched });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
  // Auditoria persistente de ações sensíveis
  app.get('/api/audit', requireAdminAuth, (req, res) => {
    try {
      const limit = Math.min(1000, Math.max(1, parseInt((req.query.limit as string) || '200', 10) || 200));
      return res.json({ entries: getAuditLog(limit) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/audit/clear', requireAdminAuth, (req, res) => {
    try {
      const caller = extractCaller(req);
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      clearAuditLog();
      logAudit({ actor: caller.username || 'admin', role: caller.role || 'admin', ip, action: 'audit_clear', target: 'audit', details: 'Log de auditoria limpo', status: 'info' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });


  // Docker: visão de containers (status/uso básico)
  app.get('/api/docker/containers', requireAdminAuth, async (_req, res) => {
    try {
      const { execFile } = await import('child_process');
      const util = await import('util');
      const execFileAsync = util.promisify(execFile);
      let ps = '';
      try {
        const r = await execFileAsync('docker', ['ps', '-a', '--format', '{{json .}}'], { timeout: 8000 });
        ps = r.stdout || '';
      } catch (e: any) {
        return res.json({ available: false, error: e?.stderr || e?.message || 'Docker indisponível', containers: [] });
      }
      const containers = ps.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      // try stats (no-stream) best effort
      let statsMap: Record<string, any> = {};
      try {
        const r = await execFileAsync('docker', ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 10000 });
        (r.stdout||'').split('\n').filter(Boolean).forEach(l => { try { const j=JSON.parse(l); if(j.ID||j.Name) statsMap[j.ID||j.Name]=j; } catch {} });
      } catch {}
      return res.json({ available: true, containers, stats: statsMap, timestamp: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ available: false, error: err.message, containers: [] });
    }
  });

  app.post('/api/docker/containers/:id/restart', requireAdminAuth, async (req, res) => {
    try {
      const id = String(req.params.id||'').replace(/[^a-zA-Z0-9_.-]/g,'');
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const { execFile } = await import('child_process');
      const util = await import('util');
      const execFileAsync = util.promisify(execFile);
      await execFileAsync('docker', ['restart', id], { timeout: 30000 });
      const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'docker_restart', target: id, details: 'Container reiniciado', status: 'success' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.stderr || err.message });
    }
  });

  // SMART / saúde do disco (best-effort)
  app.get('/api/system/smart', requireAdminAuth, async (_req, res) => {
    try {
      const { execFile } = await import('child_process');
      const util = await import('util');
      const execFileAsync = util.promisify(execFile);
      let devices: string[] = [];
      try {
        const r = await execFileAsync('lsblk', ['-dn', '-o', 'NAME,TYPE'], { timeout: 5000 });
        devices = (r.stdout||'').split('\n').map(l=>l.trim().split(/\s+/)).filter(p=>p[1]==='disk').map(p=>'/dev/'+p[0]);
      } catch {}
      const results: any[] = [];
      for (const dev of devices.slice(0,4)) {
        try {
          const r = await execFileAsync('smartctl', ['-H', '-A', '-i', dev], { timeout: 8000 });
          results.push({ device: dev, ok: true, output: (r.stdout||'').slice(0,8000) });
        } catch (e: any) {
          // try with sudo -n
          try {
            const r2 = await execFileAsync('sudo', ['-n', 'smartctl', '-H', '-A', '-i', dev], { timeout: 8000 });
            results.push({ device: dev, ok: true, output: (r2.stdout||'').slice(0,8000) });
          } catch (e2: any) {
            results.push({ device: dev, ok: false, error: (e2?.stderr||e2?.message||e?.stderr||e?.message||'indisponível').slice(0,500) });
          }
        }
      }
      return res.json({ devices: results, available: results.some(r=>r.ok), timestamp: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Atualizações do sistema e containers (best-effort)
  app.get('/api/system/updates', requireAdminAuth, async (_req, res) => {
    try {
      const { execFile } = await import('child_process');
      const util = await import('util');
      const execFileAsync = util.promisify(execFile);
      let apt: any = { available: false };
      try {
        // do not apt update (privileged/slow), read upgradable list
        const r = await execFileAsync('apt', ['list', '--upgradable'], { timeout: 15000 });
        const lines = (r.stdout||'').split('\n').filter(l=>l.includes('/'));
        apt = { available: true, count: lines.length, packages: lines.slice(0,50) };
      } catch (e: any) {
        apt = { available: false, error: (e?.stderr||e?.message||'').slice(0,200) };
      }
      let dockerImages: any = { available: false };
      try {
        const r = await execFileAsync('docker', ['images', '--format', '{{json .}}'], { timeout: 8000 });
        const imgs = (r.stdout||'').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
        dockerImages = { available: true, images: imgs.slice(0,50) };
      } catch (e: any) {
        dockerImages = { available: false, error: (e?.stderr||e?.message||'').slice(0,200) };
      }
      return res.json({ apt, dockerImages, timestamp: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // AdGuard: listas de filtros e upstreams (relatórios/gestão básica)
  app.get('/api/adguard/filters', requireUserOrAdminAuth, async (_req, res) => {
    try {
      const st = await getAdGuardFilteringStatus();
      return res.json(st);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Rota de Auditoria e Detecção de Ataques / Tentativas de Invasão (múltiplos aliases resilientes)
  app.get(['/api/security/attack-monitor', '/api/security', '/api/security/status'], requireUserOrAdminAuth, async (req, res) => {
    try {
      const status = await getSecurityAttackStatus();
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Limpar histórico de auditoria e falhas
  app.post('/api/security/clear-history', requireAdminAuth, async (req, res) => {
    try {
      const result = await clearSecurityHistory();
      const caller = extractCaller(req); const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      logAudit({ actor: caller.username||'admin', role: caller.role||'admin', ip, action: 'security_clear_history', target: 'security', details: 'Histórico de segurança limpo', status: 'info' });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Bloquear IP no UFW via interface
  app.post('/api/security/block-ip', requireAdminAuth, async (req, res) => {
    try {
      const { ip } = req.body || {};
      if (!ip) return res.status(400).json({ error: 'IP não fornecido.' });
      const result = await blockIpInUfw(ip);
      void notifyTelegramIpBlock(String(ip), 'block', result?.message);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Desbloquear IP no UFW via interface
  app.post('/api/security/unblock-ip', requireAdminAuth, async (req, res) => {
    try {
      const { ip } = req.body || {};
      if (!ip) return res.status(400).json({ error: 'IP não fornecido.' });
      const result = await unblockIpInUfw(ip);
      void notifyTelegramIpBlock(String(ip), 'unblock', result?.message);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // Telegram: status, teste e detecção de chat (admin)
  app.get('/api/telegram/status', requireAdminAuth, async (_req, res) => {
    try {
      const me = await testTelegramConnection();
      const cfg = getServerConfig() as any;
      const t = cfg.telegram || {};
      return res.json({
        ok: true,
        configured: !!(t.botToken),
        enabled: t.enabled === true,
        chatId: t.chatId || '',
        aiModel: t.aiModel || 'google/gemini-3.5-flash',
        notifyOnLoginFailure: t.notifyOnLoginFailure !== false,
        notifyOnLoginSuccess: t.notifyOnLoginSuccess === true,
        notifyOnBlockIp: t.notifyOnBlockIp !== false,
        bot: me.ok ? me.bot : null,
        connection: me.ok ? 'ok' : (me.error || 'not_configured')
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Falha ao consultar Telegram.' });
    }
  });

  app.post('/api/telegram/test', requireAdminAuth, async (_req, res) => {
    try {
      const result = await sendTelegramTestMessage();
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Falha ao testar Telegram.' });
    }
  });

  app.get('/api/telegram/updates', requireAdminAuth, async (_req, res) => {
    try {
      const botChats = typeof getDetectedTelegramChats === 'function' ? getDetectedTelegramChats() : [];
      const result = await getTelegramUpdates(30);
      const chats = [...botChats, ...(((result as any).chats) || [])];
      const map = new Map<string, any>();
      for (const c of chats) {
        if (c && c.id != null) map.set(String(c.id), c);
      }
      return res.json({ ok: result.ok !== false, chats: Array.from(map.values()), data: result.data, error: result.error });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Falha ao buscar updates do Telegram.' });
    }
  });

  // ===== Terminal & Shell (admin, execução completa) =====
  app.post('/api/terminal/exec', requireAdminAuth, async (req, res) => {
    try {
      const command = typeof req.body?.command === 'string' ? req.body.command : '';
      const cwd = typeof req.body?.cwd === 'string' ? req.body.cwd : undefined;
      if (!command.trim()) {
        return res.status(400).json({ success: false, error: 'Comando vazio.' });
      }
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const result = await runShellCommand(command, cwd, clientIp);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Falha ao executar comando.' });
    }
  });

  // Cache do host FastAPI que respondeu com sucesso para eliminar latência de probing
  let cachedWorkingBackendBase: string | null = null;

  // ===== Navegador Remoto (Chromium + Playwright/CDP) =====
  app.get('/api/browser/status', requireAdminAuth, (_req, res) => {
    res.json({ success: true, state: getBrowserState() });
  });

  app.post('/api/browser/start', requireAdminAuth, async (_req, res) => {
    try {
      const state = await startBrowser();
      res.json({ success: true, state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao iniciar o navegador.' });
    }
  });

  app.post('/api/browser/stop', requireAdminAuth, async (_req, res) => {
    try {
      await stopBrowser();
      res.json({ success: true, state: getBrowserState() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao parar o navegador.' });
    }
  });

  app.post('/api/browser/pause', requireAdminAuth, (_req, res) => {
    res.json({ success: true, state: pauseBrowser() });
  });

  app.post('/api/browser/resume', requireAdminAuth, (_req, res) => {
    res.json({ success: true, state: resumeBrowser() });
  });

  app.post('/api/browser/navigate', requireAdminAuth, async (req, res) => {
    try {
      const state = await navigateBrowser(String(req.body?.url || ''));
      res.json({ success: true, state });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Falha ao navegar.' });
    }
  });

  app.get('/api/browser/screenshot', requireAdminAuth, async (_req, res) => {
    try {
      const buffer = await takeScreenshot();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Falha ao capturar screenshot.' });
    }
  });

  app.get('/api/browser/history', requireAdminAuth, (_req, res) => {
    res.json({ success: true, history: getBrowserHistory() });
  });

  app.post('/api/browser/ws-ticket', requireAdminAuth, (_req, res) => {
    res.json({ success: true, ...issueWsTicket() });
  });

  app.post('/api/browser/reset-profile', requireAdminAuth, async (_req, res) => {
    try {
      const state = await resetBrowserProfile();
      res.json({ success: true, state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao limpar perfil do navegador.' });
    }
  });

  app.post('/api/browser/force-stop', requireAdminAuth, async (_req, res) => {
    try {
      const state = await forceStopBrowser();
      res.json({ success: true, state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Falha ao forçar desligamento do navegador.' });
    }
  });

  app.get('/api/services', requireUserOrAdminAuth, (_req, res) => {
    const services = getAllMonitoredServices();
    return res.json({ success: true, count: services.length, services, servicos: services });
  });

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
      '/api/credentials',
      '/api/security',
      '/api/telegram',
      '/api/terminal',
      '/api/browser',
      '/api/mikrotik',
      '/api/cameras'
    ];
    if (internalPaths.some(p => req.path.startsWith(p))) {
      return next();
    }

    applyCors(res, req);
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

    // Autentica no backend FastAPI com a chave de serviço do painel.
    // As credenciais do usuário são válidas apenas para o painel, não para o backend.
    const backendApiKey = process.env.BACKEND_API_KEY || process.env.API_KEY || '';
    if (backendApiKey) {
      forwardHeaders['X-API-Key'] = backendApiKey;
    } else if (clientAuth) {
      forwardHeaders['Authorization'] = clientAuth;
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
      const sortBy = (req.query.sort_by as string) || (req.query.sort as string) || 'cpu';
      const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) || '30', 10) || 30));
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
      const lines = Math.min(2000, Math.max(1, parseInt((req.query.lines as string) || '50', 10) || 50));
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
  app.all('/adguard-api/*', requireUserOrAdminAuth, async (req, res) => {
    applyCors(res, req);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const method = req.method.toUpperCase();
    const isReadMethod = method === 'GET' || method === 'HEAD';
    if (!isReadMethod) {
      const caller = (req as any).user;
      if (caller?.role !== 'admin') {
        return res.status(403).json({
          error: 'Acesso negado: privilégios de administrador necessários para operações de escrita no AdGuard.'
        });
      }
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

    const adgCfg = getActiveAdGuardCredentials();
    const adgUser = adgCfg.username || '';
    const adgPass = adgCfg.password || '';
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
  app.get('/api/adguard/querylog', requireUserOrAdminAuth, async (req, res) => {
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
  app.get('/api/adguard/domains', requireUserOrAdminAuth, async (req, res) => {
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
  app.post('/api/adguard/analyze', requireAdminAuth, async (req, res) => {
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

      console.log(`[AI Analyzer] Chamando Opencode para analisar novo domínio: ${clean}`);
      const analysis = await analyzeDomainWithOpencode(clean);
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
  app.post('/api/adguard/analyze-batch', requireAdminAuth, async (req, res) => {
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
          console.log(`[AI Batch Analyzer] Processando com Opencode: ${dom}`);
          const analysis = await analyzeDomainWithOpencode(dom);
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

  app.get('/api/mac-vendor/:mac?', requireUserOrAdminAuth, async (req, res) => {
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

      // Rate limit para api.macvendors.com (endpoint anônimo): máximo 1 requisição por segundo
      const timeSinceLast = Date.now() - lastMacVendorRequestTime;
      if (timeSinceLast < 1100) {
        await new Promise(r => setTimeout(r, 1100 - timeSinceLast));
      }
      lastMacVendorRequestTime = Date.now();

      // Consulta a API pública de Fornecedores de MAC (api.macvendors.com)
      const targetApiUrl = `https://api.macvendors.com/${encodeURIComponent(formattedFullMac)}`;
      const response = await fetch(targetApiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain, */*',
          'User-Agent': 'ServerPanel/1.0 (+https://samuelserver.duckdns.org)'
        },
        signal: AbortSignal.timeout(7000)
      });

      if (response.status === 200) {
        const vendorName = (await response.text()).trim();
        if (!vendorName) {
          throw new Error('Resposta vazia da API macvendors.com');
        }
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
        const errText = (await response.text().catch(() => '')).trim();
        macCache.set(oui, { vendor: null, isRandomized, timestamp: Date.now() });
        return res.status(404).json({
          success: false,
          found: false,
          mac: formattedFullMac,
          oui: formattedOui,
          error: isRandomized
            ? 'Fabricante não encontrado: este é um endereço MAC privado/aleatório (locally administered).'
            : (errText || 'Fabricante não encontrado na base OUI/IEEE'),
          is_randomized: isRandomized,
          cached: false,
          provider: 'api.macvendors.com',
          service_notice: 'Este serviço é externo (API de Terceiros / Web Cloud) e não faz parte dos daemons nativos do Ubuntu.'
        });
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        return res.status(429).json({
          success: false,
          error: `Limite de requisições atingido na API macvendors.com${retryAfter ? ` (Retry-After: ${retryAfter}s)` : ' (1 req/s, 1000/dia sem chave)'}. Aguarde e tente novamente.`,
          retry_after: retryAfter ? Number(retryAfter) : undefined,
          provider: 'api.macvendors.com'
        });
      }

      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(`Resposta da API externa: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Falha ao consultar API externa de MAC: ${err.message || 'Servidor inacessível'}`
      });
    }
  });

  return app;
}

export async function startServer() {
  const app = createApp();

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

  return new Promise<any>((resolve) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[AdGuard AI NOC] Servidor iniciado na porta ${PORT} (0.0.0.0:${PORT})`);
      attachBrowserWebSocket(server);
      try { startTelegramBotPolling(); } catch (e) { console.warn('[telegram] falha ao iniciar polling:', e); }
      try { startMikrotikMonitor(15000); } catch (e) { console.warn('[mikrotik] falha ao iniciar monitor:', e); }
      resolve(server);
    });
  });
}

const isDirectRun = Boolean(
  process.argv[1] && (
    process.argv[1].endsWith('server.ts') || 
    process.argv[1].endsWith('server.js') ||
    process.argv[1].endsWith('server.cjs')
  )
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  startServer();
}


