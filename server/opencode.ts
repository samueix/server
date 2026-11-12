import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import type { DomainAnalysis } from './db.js';

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
  timestamp: string;
}

export interface OpencodeSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  opencodeSessionId?: string;
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

export function createOpencodeSession(title?: string, model?: string): OpencodeSession {
  const id = 'sess_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const effectiveModel = sanitizeModel(model) || OPENCODE_MODEL;
  const newSession: OpencodeSession = {
    id,
    title: title || 'Nova Sessão com Opencode',
    createdAt: now,
    updatedAt: now,
    model: effectiveModel,
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
  model?: string
): Promise<{ reply: OpencodeMessage; session: OpencodeSession; metrics: TokenQuotaMetrics }> {
  let session = sessionId ? sessionsStore.get(sessionId) : undefined;
  if (!session) {
    session = createOpencodeSession(userPrompt.slice(0, 36) + '...', model);
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

  const result = await runOpencode(userPrompt, {
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
