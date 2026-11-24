import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import dns from 'dns';
import { spawn, execFile, execSync } from 'child_process';
import { promisify } from 'util';
import type { DomainAnalysis } from './db.js';
import { getFullSystemSnapshot, getProcessesList } from './systemMonitor.js';
import { getAllMonitoredServices } from './servicesMonitor.js';
import { fetchAdGuardStats, fetchAdGuardStatus } from './adguardClient.js';

const execFileAsync = promisify(execFile);

const OPENCODE_BIN = process.env.OPENCODE_BIN || '/home/samuel/.opencode/bin/opencode';
const OPENCODE_HOME = process.env.OPENCODE_HOME || '/home/samuel';
const OPENCODE_DIR = process.env.OPENCODE_DIR || '/home/samuel/opencode';
export const OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'opencode/big-pickle';
export const OPENCODE_AGENT = process.env.OPENCODE_AGENT || 'plan';

export interface OpencodeMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
  timestamp: string;
  imageDataUrl?: string;
}

export interface OpencodeSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  opencodeSessionId?: string;
  source?: 'panel' | 'telegram' | 'api';
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  messageCount: number;
  lastMessagePreview?: string;
  messages?: OpencodeMessage[];
}

export interface TokenQuotaMetrics {
  tokensToday: number;
  tokensTotal: number;
  promptTokensTotal: number;
  completionTokensTotal: number;
  dailyTokenLimit: number;
  currentRpm: number;
  maxRpm: number;
  currentTpm: number;
  maxTpm: number;
  quotaPercentUsed: number;
  sessionsCount: number;
  modelInUse: string;
  lastActive: string;
  historyByDay: { date: string; tokens: number; promptTokens: number; completionTokens: number; requests: number }[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'opencode_sessions.json');
const TOKENS_FILE = path.join(DATA_DIR, 'opencode_tokens.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch {}

const sessionsStore: Map<string, OpencodeSession> = new Map();
const messagesStore: Map<string, OpencodeMessage[]> = new Map();

interface DailyTokenRecord {
  date: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

let dailyTokenRecords: Record<string, DailyTokenRecord> = {};

function loadPersistedData() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          if (!s.source) {
            const id = String(s.id || '');
            const title = String(s.title || '');
            s.source = (id.startsWith('tg_') || /telegram/i.test(title)) ? 'telegram' : 'panel';
          }
          sessionsStore.set(s.id, s);
        }
      }
      if (data.messages && typeof data.messages === 'object') {
        for (const [sId, msgs] of Object.entries(data.messages)) {
          messagesStore.set(sId, msgs as OpencodeMessage[]);
        }
      }
    }
  } catch (e) {
    console.warn('[Opencode] Falha ao ler sessões:', e);
  }

  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
      dailyTokenRecords = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Opencode] Falha ao ler métricas de tokens:', e);
  }
}

function persistData() {
  try {
    const sessions = Array.from(sessionsStore.values());
    const messagesObj: Record<string, OpencodeMessage[]> = {};
    for (const [k, v] of messagesStore.entries()) {
      messagesObj[k] = v;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions, messages: messagesObj }, null, 2), 'utf-8');
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(dailyTokenRecords, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Opencode] Falha ao persistir dados:', e);
  }
}

loadPersistedData();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function recordTokenUsage(promptTokens: number, completionTokens: number) {
  const todayKey = getTodayKey();
  const total = promptTokens + completionTokens;

  if (!dailyTokenRecords[todayKey]) {
    dailyTokenRecords[todayKey] = {
      date: todayKey,
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      requests: 0
    };
  }

  dailyTokenRecords[todayKey].tokens += total;
  dailyTokenRecords[todayKey].promptTokens += promptTokens;
  dailyTokenRecords[todayKey].completionTokens += completionTokens;
  dailyTokenRecords[todayKey].requests += 1;

  persistData();
}

/**
 * Sanitiza identificador de modelo para evitar injeções ou valores inesperados.
 * Aceita apenas o padrão provider/model, ex: opencode/big-pickle, anthropic/claude-3-5-sonnet
 */
export function sanitizeModel(model?: string): string | undefined {
  if (!model || typeof model !== 'string') return undefined;
  const trimmed = model.trim();
  if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

let cachedModels: { models: string[]; timestamp: number } | null = null;

/**
 * Executa a CLI do opencode com argumento 'models' para listar os modelos disponíveis
 * Faz cache em memória por 60s com fallback para [OPENCODE_MODEL]
 */
export async function listOpencodeModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModels.timestamp < 60000 && cachedModels.models.length > 0) {
    return cachedModels.models;
  }

  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  try {
    const collected = await spawnCollect(OPENCODE_BIN, ['models'], {
      env: buildChildEnv(),
      timeoutMs: 15000,
      uid: isRoot ? 1000 : undefined,
      gid: isRoot ? 1000 : undefined
    });

    const raw = (collected.stdout || '') + '\n' + (collected.stderr || '');
    // Remove códigos ANSI coloridos da saída do terminal
    const clean = raw.replace(/\x1b\[[0-9;]*m/g, '');
    const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const validModels = new Set<string>();
    // Sempre garante o modelo default
    validModels.add(OPENCODE_MODEL);

    for (const line of lines) {
      // Pega o primeiro token da linha
      const firstToken = line.split(/\s+/)[0];
      if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(firstToken)) {
        validModels.add(firstToken);
      }
    }

    const sorted = Array.from(validModels).sort((a, b) => {
      if (a === OPENCODE_MODEL) return -1;
      if (b === OPENCODE_MODEL) return 1;
      return a.localeCompare(b);
    });

    cachedModels = { models: sorted, timestamp: now };
    return sorted;
  } catch (err) {
    console.warn('[Opencode] Falha ao listar modelos via CLI, usando fallback:', err);
    return [OPENCODE_MODEL];
  }
}


// lightweight sync exec (avoid async context build complexity)
function sh(cmd: string, timeoutMs = 2500, max = 14000): string {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
    const s = String(out || '').trim();
    return s.length > max ? s.slice(0, max) + '\n...[truncado]' : s;
  } catch (e: any) {
    const s = String(e?.stdout || e?.message || '').trim();
    return s.length > max ? s.slice(0, max) : s;
  }
}

function fmtBytes(b: number) {
  if (!Number.isFinite(b)) return String(b);
  const u = ['B','KB','MB','GB','TB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

async function buildServerContextBlock(): Promise<string> {
  try {
    const snapshot: any = getFullSystemSnapshot();
    const cpu = snapshot.cpu || {};
    const mem = snapshot.memory?.ram || snapshot.memory || snapshot.memoria || {};
    const disk = snapshot.disk?.root || snapshot.disk || snapshot.disco || {};
    const uptime = snapshot.uptime || {};
    const net = snapshot.network || snapshot.rede || {};
    const temp = snapshot.temperature || snapshot.temperatura || {};
    const services = (typeof getAllMonitoredServices === 'function' ? getAllMonitoredServices() : []) as any[];
    const procInfo = getProcessesList('cpu', 0); // all
    const processes = Array.isArray(procInfo?.processes) ? procInfo.processes : [];
    const byCpu = [...processes].sort((a: any, b: any) => (b.cpu_percent||0) - (a.cpu_percent||0)).slice(0, 25);
    const byMem = [...processes].sort((a: any, b: any) => (b.memory_percent||b.mem_percent||0) - (a.memory_percent||a.mem_percent||0)).slice(0, 25);

    // docker
    let dockerPs = sh("docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1 | head -n 30", 3500, 8000);
    let dockerImages = sh("docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' 2>&1 | head -n 20", 3500, 6000);

    // adguard
    let adguardBlock = '(indisponível)';
    try {
      const [agStatus, agStats] = await Promise.all([fetchAdGuardStatus().catch(() => null), fetchAdGuardStats().catch(() => null)]);
      const topClients = Array.isArray(agStats?.top_clients) ? agStats.top_clients.slice(0, 8).map((c: any) => {
        const name = Object.keys(c || {})[0] || 'desconhecido';
        const val = c?.[name] ?? 0;
        return `${name}: ${val}`;
      }) : [];
      const topBlocked = Array.isArray(agStats?.top_blocked_domains) ? agStats.top_blocked_domains.slice(0, 8).map((d: any) => {
        const name = Object.keys(d || {})[0] || 'dominio';
        const val = d?.[name] ?? 0;
        return `${name}: ${val}`;
      }) : [];
      adguardBlock = [
        `Conectado: ${agStats?.connected ? 'sim' : 'não'}${agStats?.stale ? ' (stale/cache)' : ''}`,
        `Proteção: ${agStatus?.protection_enabled ? 'ativa' : 'inativa/desconhecida'} | Versão: ${agStatus?.version || 'N/D'}`,
        `Consultas DNS (total): ${agStats?.num_dns_queries ?? 0}`,
        `Bloqueados (total): ${agStats?.num_blocked_filtering ?? 0}`,
        `Bloqueio: ${agStats?.blocked_percentage ?? 0}%`,
        `Safebrowsing substituídos: ${agStats?.num_replaced_safebrowsing ?? 0} | Safesearch: ${agStats?.num_replaced_safesearch ?? 0}`,
        `Tempo médio processamento: ${agStats?.avg_processing_time ?? 0}`,
        `Top clientes: ${topClients.length ? topClients.join('; ') : 'N/D'}`,
        `Top domínios bloqueados: ${topBlocked.length ? topBlocked.join('; ') : 'N/D'}`,
        `Última atualização: ${agStats?.last_updated || 'N/D'}`,
        agStats?.error ? `Erro: ${agStats.error}` : null,
      ].filter(Boolean).join('\n');
    } catch (e: any) {
      adguardBlock = `Erro ao coletar AdGuard: ${e?.message || e}`;
    }

    // network/listeners/dns
    const ipA = sh("ip -br a 2>&1 | head -n 40", 2500, 6000);
    const routes = sh("ip route 2>&1 | head -n 40", 2500, 4000);
    const listening = sh("ss -tulpn 2>&1 | head -n 60", 3500, 9000);
    const resolv = sh("cat /etc/resolv.conf 2>&1 | head -n 40", 1500, 2000);
    const mounts = sh("df -hT 2>&1 | head -n 40", 2500, 6000);
    const uptimeCmd = sh("uptime -p 2>&1; echo ---; who -b 2>&1", 2000, 1200);

    // failed services quick view
    const failed = sh("systemctl --failed --no-pager --plain 2>&1 | head -n 30", 3000, 4000);

    const cpuPct = cpu.usage_percent ?? cpu.uso_percentual ?? cpu.percent ?? 'N/D';
    const load = cpu.load_average || cpu.load || {};
    const memTotal = mem.total_gb ?? mem.total ?? 'N/D';
    const memUsed = mem.used_gb ?? mem.usada ?? 'N/D';
    const memAvail = mem.available_gb ?? mem.disponivel ?? 'N/D';
    const memPct = mem.usage_percent ?? mem.uso_percentual ?? mem.percent ?? 'N/D';
    const diskTotal = disk.total_gb ?? disk.total ?? 'N/D';
    const diskUsed = disk.used_gb ?? disk.usado ?? 'N/D';
    const diskFree = disk.free_gb ?? disk.livre ?? 'N/D';
    const diskPct = disk.usage_percent ?? disk.uso_percentual ?? disk.percent ?? 'N/D';

    const osInfo = snapshot.system || snapshot.sistema || {};
    const hostname = os.hostname();

    const svcLines = services.slice(0, 60).map((s: any) => {
      const st = s.status || s.estado || (s.active ? 'ONLINE' : 'OFFLINE');
      const name = s.name || s.nome || s.service || 'svc';
      const desc = s.descricao || s.description || '';
      const port = s.porta || s.port || '';
      return `- ${name}: ${st}${port ? ` (porta ${port})` : ''}${desc ? ` — ${desc}` : ''}`;
    }).join('\n');

    const procLine = (p: any) => {
      const cmd = String(p.comando || p.command || p.cmd || p.name || '').replace(/\s+/g, ' ').slice(0, 140);
      return `- PID ${p.pid} | ${p.user || p.usuario || '?'} | CPU ${(p.cpu_percent ?? p.cpu ?? 0)}% | MEM ${(p.memory_percent ?? p.mem ?? 0)}% | ${p.status || ''} | ${p.tempo_execucao || p.time || ''} | ${cmd}`;
    };
    const topCpu = byCpu.map(procLine).join('\n') || '- (indisponível)';
    const topMem = byMem.map(procLine).join('\n') || '- (indisponível)';

    const procCompact = (p: any) => {
      const cmd = String(p.comando || p.command || p.cmd || p.name || '').replace(/\s+/g, ' ').slice(0, 90);
      return `${p.pid}\t${p.user || p.usuario || '?'}\t${(p.cpu_percent ?? p.cpu ?? 0)}\t${(p.memory_percent ?? p.mem ?? 0)}\t${p.status || ''}\t${cmd}`;
    };
    let allProcsText = processes.map(procCompact).join('\n');
    if (allProcsText.length > 12000) {
      allProcsText = allProcsText.slice(0, 12000) + `\n...[lista truncada, total ${processes.length} processos]`;
    }

    const parts = [
      '[CONTEXTO REAL DO SERVIDOR - coletado agora]',
      `Host: ${hostname}`,
      `SO: ${osInfo.os || osInfo.distro || os.type()} ${osInfo.os_version || osInfo.version || ''} | Kernel: ${osInfo.kernel || os.release()} | Arch: ${osInfo.arch || os.arch()}`,
      `Uptime: ${uptime.uptime_human || uptimeCmd.split('\n')[0] || 'N/D'}`,
      `CPU: ${cpuPct}% | Load: ${JSON.stringify(load)} | Cores: ${cpu.cores_logical || cpu.nucleos_logicos || os.cpus()?.length || 'N/D'}`,
      `Memória: usado ${memUsed}/${memTotal} GB (${memPct}%), disponível ${memAvail} GB`,
      `Disco (/): usado ${diskUsed}/${diskTotal} GB (${diskPct}%), livre ${diskFree} GB`,
      `Rede (primária): ${JSON.stringify({ primary: net.primary_interface || net.primaryInterface, ip: net.primary_ip || net.primaryIp, ipv6: net.primary_ipv6 || net.primaryIpv6, down_bps: net.download_bytes_sec, up_bps: net.upload_bytes_sec })}`,
      `Temperatura: ${JSON.stringify(temp?.temperatura_c ?? temp?.cpu_temp ?? temp?.sensores ?? temp)}`,
      `Processos: total ${procInfo.count ?? processes.length} (running ${procInfo.running ?? '?'}, sleeping ${procInfo.sleeping ?? '?'})`,
      '\n[Top processos por CPU]',
      topCpu,
      '\n[Top processos por Memória]',
      topMem,
      `\n[Todos os processos (PID\tUSER\tCPU%\tMEM%\tSTAT\tCMD) - total ${processes.length}]`,
      allProcsText || '- (indisponível)',
      '\n[Serviços monitorados]',
      svcLines || '- (nenhum)',
      '\n[Serviços com falha (systemctl --failed)]',
      failed || '(nenhum ou indisponível)',
      '\n[Interfaces de rede (ip -br a)]',
      ipA || '(indisponível)',
      '\n[Rotas (ip route)]',
      routes || '(indisponível)',
      '\n[Portas em escuta (ss -tulpn)]',
      listening || '(indisponível)',
      '\n[DNS (/etc/resolv.conf)]',
      resolv || '(indisponível)',
      '\n[Montagens/Discos (df -hT)]',
      mounts || '(indisponível)',
      '\n[Docker containers]',
      dockerPs || '(docker indisponível ou sem containers)',
      '\n[Docker images]',
      dockerImages || '(indisponível)',
      '\n[AdGuard Home]',
      adguardBlock,
      '\n[Recursos visuais]',
      'Captura de tela: você pode enviar uma imagem no chat ao usuário incluindo o marcador [SCREENSHOT] na resposta (o sistema anexará automaticamente um screenshot JPEG do Navegador Remoto do painel, se houver sessão ativa em /api/browser/screenshot). Também funciona quando o usuário pedir foto/print/captura/tela. Não há DISPLAY gráfico local.',
      '[/CONTEXTO REAL DO SERVIDOR]'
    ];
    const block = parts.join('\n');
    // hard cap to keep prompt reasonable
    return block.length > 36000 ? block.slice(0, 36000) + '\n...[contexto truncado]' : block;
  } catch (e: any) {
    return `[CONTEXTO REAL DO SERVIDOR]\nFalha ao coletar contexto: ${e?.message || e}\n[/CONTEXTO REAL DO SERVIDOR]`;
  }
}

interface OpencodeRunResult {
  text: string;
  sessionId?: string;
  promptTokens: number;
  completionTokens: number;
  error?: string;
}

function buildChildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  const passthrough = [
    'PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SHELL', 'TMPDIR',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME'
  ];
  for (const key of passthrough) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('OPENCODE_') && value) env[key] = value;
  }
  env.HOME = OPENCODE_HOME;
  env.USER = 'samuel';
  env.LOGNAME = 'samuel';
  env.PATH = `${OPENCODE_HOME}/.opencode/bin:/usr/local/bin:/usr/bin:/bin`;
  return env;
}

interface CollectedOutput {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
}

function spawnCollect(
  bin: string,
  args: string[],
  opts: { env: Record<string, string | undefined>; timeoutMs: number; uid?: number; gid?: number }
): Promise<CollectedOutput> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;

    const child = spawn(bin, args, {
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      uid: opts.uid,
      gid: opts.gid
    });

    const finish = (code: number | null, error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, error });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null, `Tempo limite de ${opts.timeoutMs}ms excedido ao executar o opencode.`);
    }, opts.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code) => finish(code));
  });
}

async function runOpencode(
  prompt: string,
  opts: { sessionId?: string; timeoutMs?: number; model?: string } = {}
): Promise<OpencodeRunResult> {
  const chosenModel = sanitizeModel(opts.model) || OPENCODE_MODEL;
  const args = ['run', '--format', 'json', '--dir', OPENCODE_DIR, '--agent', OPENCODE_AGENT];
  if (chosenModel) args.push('--model', chosenModel);
  if (opts.sessionId) args.push('-s', opts.sessionId);
  args.push(prompt);

  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const timeoutMs = opts.timeoutMs ?? 180000;

  const collected = await spawnCollect(OPENCODE_BIN, args, {
    env: buildChildEnv(),
    timeoutMs,
    uid: isRoot ? 1000 : undefined,
    gid: isRoot ? 1000 : undefined
  });

  const stdout = collected.stdout;
  const stderr = collected.stderr;

  if ((collected.error || collected.code !== 0) && !stdout.trim()) {
    return {
      text: '',
      promptTokens: 0,
      completionTokens: 0,
      error: stderr || collected.error || 'Falha ao executar o opencode.'
    };
  }

  const texts: string[] = [];
  let sessionId: string | undefined;
  let promptTokens = 0;
  let completionTokens = 0;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const evt = JSON.parse(trimmed);
      if (evt.sessionID && !sessionId) sessionId = evt.sessionID;
      if (evt.part?.sessionID && !sessionId) sessionId = evt.part.sessionID;
      if (evt.type === 'text' && evt.part?.text) {
        texts.push(String(evt.part.text));
      }
      if (evt.type === 'step_finish' && evt.part?.tokens) {
        promptTokens += Number(evt.part.tokens.input || 0);
        completionTokens += Number(evt.part.tokens.output || 0);
      }
      if (evt.type === 'message' && evt.part?.tokens) {
        promptTokens += Number(evt.part.tokens.input || 0);
        completionTokens += Number(evt.part.tokens.output || 0);
      }
    } catch {}
  }

  let text = texts.join('\n').trim();
  if (!text) {
    // fallback: remove linhas JSON de eventos e coleta texto restante
    const nonJson = stdout.split(/\r?\n/).filter(l => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith('{') && t.endsWith('}')) {
        try { JSON.parse(t); return false; } catch { return true; }
      }
      return true;
    }).join('\n').trim();
    text = nonJson || '';
  }

  return {
    text,
    sessionId,
    promptTokens,
    completionTokens,
    error: text ? undefined : (stderr || 'Resposta vazia do opencode.')
  };
}

export function getTokenQuotaMetrics(): TokenQuotaMetrics {
  const todayKey = getTodayKey();
  const todayRecord = dailyTokenRecords[todayKey] || { tokens: 0, promptTokens: 0, completionTokens: 0, requests: 0 };

  let totalAllTime = 0;
  let totalPromptAllTime = 0;
  let totalCompletionAllTime = 0;
  for (const r of Object.values(dailyTokenRecords)) {
    totalAllTime += r.tokens || 0;
    totalPromptAllTime += r.promptTokens || 0;
    totalCompletionAllTime += r.completionTokens || 0;
  }

  const dailyTokenLimit = 4000000;
  const maxRpm = 15;
  const maxTpm = 1000000;

  const quotaPercent = Math.min(100, parseFloat(((todayRecord.tokens / dailyTokenLimit) * 100).toFixed(2)));

  const historyByDay = Object.values(dailyTokenRecords)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)
    .map(r => ({
      date: r.date,
      tokens: r.tokens,
      promptTokens: r.promptTokens || 0,
      completionTokens: r.completionTokens || 0,
      requests: r.requests
    }));

  return {
    tokensToday: todayRecord.tokens,
    tokensTotal: totalAllTime,
    promptTokensTotal: totalPromptAllTime,
    completionTokensTotal: totalCompletionAllTime,
    dailyTokenLimit,
    currentRpm: Math.min(maxRpm, todayRecord.requests > 0 ? 1 : 0),
    maxRpm,
    currentTpm: todayRecord.tokens % 50000,
    maxTpm,
    quotaPercentUsed: quotaPercent,
    sessionsCount: sessionsStore.size,
    modelInUse: OPENCODE_MODEL,
    lastActive: new Date().toLocaleTimeString('pt-BR'),
    historyByDay
  };
}

export function listOpencodeSessions(): OpencodeSession[] {
  return Array.from(sessionsStore.values()).sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getOpencodeSession(id: string): { session: OpencodeSession | null; messages: OpencodeMessage[] } {
  const session = sessionsStore.get(id) || null;
  const messages = messagesStore.get(id) || [];
  return { session, messages };
}

export function createOpencodeSession(
  title?: string,
  model?: string,
  source: 'panel' | 'telegram' | 'api' = 'panel'
): OpencodeSession {
  const id = 'sess_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const effectiveModel = sanitizeModel(model) || OPENCODE_MODEL;
  const newSession: OpencodeSession = {
    id,
    title: title || (source === 'telegram' ? 'Sessão Telegram' : 'Nova Sessão com Opencode'),
    createdAt: now,
    updatedAt: now,
    model: effectiveModel,
    source,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    messageCount: 0,
    lastMessagePreview: ''
  };

  sessionsStore.set(id, newSession);
  messagesStore.set(id, []);
  persistData();

  return newSession;
}

export function updateOpencodeSessionModel(id: string, model: string): OpencodeSession | null {
  const session = sessionsStore.get(id);
  if (!session) return null;
  const validModel = sanitizeModel(model);
  if (!validModel) return null;
  session.model = validModel;
  session.updatedAt = new Date().toISOString();
  sessionsStore.set(id, session);
  persistData();
  return session;
}

export function deleteOpencodeSession(id: string): boolean {
  const existed = sessionsStore.delete(id);
  messagesStore.delete(id);
  persistData();
  return existed;
}

export async function askOpencodeAgent(
  sessionId: string,
  userPrompt: string,
  model?: string,
  source: 'panel' | 'telegram' | 'api' = 'panel'
): Promise<{ reply: OpencodeMessage; session: OpencodeSession; metrics: TokenQuotaMetrics }> {
  let session = sessionId ? sessionsStore.get(sessionId) : undefined;
  if (!session) {
    session = createOpencodeSession(userPrompt.slice(0, 36) + '...', model, source);
  } else if (!session.source) {
    session.source = source;
  }

  const effectiveModel = sanitizeModel(model) || session.model || OPENCODE_MODEL;
  if (session.model !== effectiveModel) {
    session.model = effectiveModel;
  }

  const userMsgId = 'msg_' + crypto.randomUUID().slice(0, 8);
  const userMsg: OpencodeMessage = {
    id: userMsgId,
    sessionId: session.id,
    role: 'user',
    content: userPrompt,
    timestamp: new Date().toISOString()
  };

  const msgs = messagesStore.get(session.id) || [];
  msgs.push(userMsg);
  messagesStore.set(session.id, msgs);

  const contextBlock = await buildServerContextBlock();
  const promptWithContext = `${contextBlock}

[PERGUNTA DO USUÁRIO]
${userPrompt}
[/PERGUNTA DO USUÁRIO]

Responda com base no contexto real acima quando a pergunta for sobre este servidor/sistema/processos/rede/serviços. Seja direto e cite dados concretos (PIDs, %, nomes, portas) quando relevante.`;

  const result = await runOpencode(promptWithContext, {
    sessionId: session.opencodeSessionId,
    model: effectiveModel
  });

  let assistantReplyText = result.text;
  if (!assistantReplyText) {
    assistantReplyText = `[Opencode] Não foi possível obter resposta do agente.\n\n${result.error || 'Serviço temporariamente indisponível.'}`;
  }

  if (result.sessionId) {
    session.opencodeSessionId = result.sessionId;
  }

  const promptTokens = result.promptTokens || Math.max(15, Math.ceil(userPrompt.length / 4));
  const completionTokens = result.completionTokens || Math.ceil(assistantReplyText.length / 4);
  const totalTokensForTurn = promptTokens + completionTokens;
  recordTokenUsage(promptTokens, completionTokens);

  const assistantMsg: OpencodeMessage = {
    id: 'msg_' + crypto.randomUUID().slice(0, 8),
    sessionId: session.id,
    role: 'assistant',
    content: assistantReplyText,
    reasoning: `Processado pelo opencode (${effectiveModel}, agente ${OPENCODE_AGENT}).`,
    tokensUsed: totalTokensForTurn,
    promptTokens,
    completionTokens,
    model: effectiveModel,
    timestamp: new Date().toISOString()
  };

  msgs.push(assistantMsg);
  messagesStore.set(session.id, msgs);

  session.updatedAt = new Date().toISOString();
  session.totalPromptTokens += promptTokens;
  session.totalCompletionTokens += completionTokens;
  session.totalTokens += totalTokensForTurn;
  session.messageCount = msgs.length;
  session.lastMessagePreview = assistantReplyText.slice(0, 60) + '...';
  if (session.messageCount <= 2 && userPrompt.trim()) {
    session.title = userPrompt.length > 40 ? userPrompt.slice(0, 37) + '...' : userPrompt;
  }
  sessionsStore.set(session.id, session);
  persistData();

  return {
    reply: assistantMsg,
    session,
    metrics: getTokenQuotaMetrics()
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export async function analyzeDomainWithOpencode(domain: string): Promise<DomainAnalysis> {
  const cleanDomain = domain.trim().toLowerCase();

  const fallback: DomainAnalysis = {
    domain: cleanDomain,
    organization: 'Desconhecida (opencode indisponível)',
    category: 'Desconhecido',
    purpose: 'Análise automática indisponível no momento.',
    tracker: false,
    telemetry: false,
    analytics: false,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: true,
    risk: 'desconhecido',
    explanation: 'Não foi possível obter análise do opencode para este domínio.',
    source: 'ai'
  };

  const prompt = `Você é um analista sênior de segurança de redes e DNS (NOC).
Analise o domínio bloqueado pelo AdGuard Home: "${cleanDomain}".
Responda SOMENTE com um objeto JSON válido, sem markdown, com os campos:
organization, category, purpose, tracker, telemetry, analytics, malware, phishing, cdn, legitimate, risk, explanation.
Os campos tracker, telemetry, analytics, malware, phishing, cdn e legitimate devem ser booleanos.
risk deve ser exatamente um de: "baixo", "médio", "alto", "crítico", "desconhecido".
Não invente informações; se não souber, use "Desconhecida"/"Desconhecido" e risk "desconhecido".`;

  const result = await runOpencode(prompt, { timeoutMs: 120000 });
  if (!result.text) return fallback;

  const jsonText = extractJsonObject(result.text);
  if (!jsonText) {
    return { ...fallback, explanation: result.text.slice(0, 500) };
  }

  try {
    const parsed = JSON.parse(jsonText);
    const risk = ['baixo', 'médio', 'alto', 'crítico', 'desconhecido'].includes(parsed.risk)
      ? parsed.risk
      : 'desconhecido';

    return {
      domain: cleanDomain,
      organization: String(parsed.organization || 'Desconhecida'),
      category: String(parsed.category || 'Desconhecido'),
      purpose: String(parsed.purpose || 'Não informado'),
      tracker: parsed.tracker === true,
      telemetry: parsed.telemetry === true,
      analytics: parsed.analytics === true,
      malware: parsed.malware === true,
      phishing: parsed.phishing === true,
      cdn: parsed.cdn === true,
      legitimate: parsed.legitimate !== false,
      risk,
      explanation: String(parsed.explanation || 'Análise gerada pelo opencode.'),
      source: 'ai'
    };
  } catch {
    return { ...fallback, explanation: result.text.slice(0, 500) };
  }
}
