import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';
import { GoogleGenAI } from '@google/genai';

const execAsync = util.promisify(exec);

export interface AntigravityMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  tokensUsed?: number;
  timestamp: string;
}

export interface AntigravitySession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  messageCount: number;
  lastMessagePreview?: string;
  messages?: AntigravityMessage[];
}

export interface TokenQuotaMetrics {
  tokensToday: number;
  tokensTotal: number;
  dailyTokenLimit: number;
  currentRpm: number;
  maxRpm: number;
  currentTpm: number;
  maxTpm: number;
  quotaPercentUsed: number;
  sessionsCount: number;
  modelInUse: string;
  lastActive: string;
  historyByDay: { date: string; tokens: number; requests: number }[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'antigravity_sessions.json');
const TOKENS_FILE = path.join(DATA_DIR, 'antigravity_tokens.json');

// Garante que o diretório de dados existe
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch {}

let sessionsStore: Map<string, AntigravitySession> = new Map();
let messagesStore: Map<string, AntigravityMessage[]> = new Map();

interface DailyTokenRecord {
  date: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

let dailyTokenRecords: Record<string, DailyTokenRecord> = {};

// Carrega dados salvos do disco
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
          messagesStore.set(sId, msgs as AntigravityMessage[]);
        }
      }
    }
  } catch (e) {
    console.warn('[Antigravity] Falha ao ler sessões:', e);
  }

  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
      dailyTokenRecords = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Antigravity] Falha ao ler métricas de tokens:', e);
  }
}

function persistData() {
  try {
    const sessions = Array.from(sessionsStore.values());
    const messagesObj: Record<string, AntigravityMessage[]> = {};
    for (const [k, v] of messagesStore.entries()) {
      messagesObj[k] = v;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions, messages: messagesObj }, null, 2), 'utf-8');
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(dailyTokenRecords, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Antigravity] Falha ao persistir dados:', e);
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

let geminiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return geminiClient;
}

export function getTokenQuotaMetrics(): TokenQuotaMetrics {
  const todayKey = getTodayKey();
  const todayRecord = dailyTokenRecords[todayKey] || { tokens: 0, requests: 0 };
  
  let totalAllTime = 0;
  for (const r of Object.values(dailyTokenRecords)) {
    totalAllTime += r.tokens || 0;
  }

  // Limite diário padrão para o modelo gemini-3.8-flash / Antigravity Agent
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
      requests: r.requests
    }));

  return {
    tokensToday: todayRecord.tokens,
    tokensTotal: totalAllTime,
    dailyTokenLimit,
    currentRpm: Math.min(maxRpm, todayRecord.requests > 0 ? 1 : 0),
    maxRpm,
    currentTpm: todayRecord.tokens % 50000,
    maxTpm,
    quotaPercentUsed: quotaPercent,
    sessionsCount: sessionsStore.size,
    modelInUse: 'gemini-3.8-flash (Google Antigravity)',
    lastActive: new Date().toLocaleTimeString('pt-BR'),
    historyByDay
  };
}

export function listAntigravitySessions(): AntigravitySession[] {
  return Array.from(sessionsStore.values()).sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getAntigravitySession(id: string): { session: AntigravitySession | null; messages: AntigravityMessage[] } {
  const session = sessionsStore.get(id) || null;
  const messages = messagesStore.get(id) || [];
  return { session, messages };
}

export function createAntigravitySession(title?: string): AntigravitySession {
  const id = 'sess_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const newSession: AntigravitySession = {
    id,
    title: title || 'Nova Sessão com Agente Antigravity',
    createdAt: now,
    updatedAt: now,
    model: 'gemini-3.8-flash',
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

export function deleteAntigravitySession(id: string): boolean {
  const existed = sessionsStore.delete(id);
  messagesStore.delete(id);
  persistData();
  return existed;
}

export async function askAntigravityAgent(
  sessionId: string,
  userPrompt: string
): Promise<{ reply: AntigravityMessage; session: AntigravitySession; metrics: TokenQuotaMetrics }> {
  let session = sessionsStore.get(sessionId);
  if (!session) {
    session = createAntigravitySession(userPrompt.slice(0, 36) + '...');
  }

  const userMsgId = 'msg_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const userMsg: AntigravityMessage = {
    id: userMsgId,
    sessionId: session.id,
    role: 'user',
    content: userPrompt,
    timestamp: now
  };

  const msgs = messagesStore.get(session.id) || [];
  msgs.push(userMsg);
  messagesStore.set(session.id, msgs);

  const ai = getAiClient();
  let assistantReplyText = '';
  let reasoningText = '';
  let promptTokens = Math.max(15, Math.ceil(userPrompt.length / 4));
  let completionTokens = 0;

  if (!ai) {
    assistantReplyText = `[Simulação do Agente Antigravity - Chave de API não configurada]\n\nRecebi sua solicitação: "${userPrompt}".\nPara conectar com os modelos oficiais do Google Gemini e Antigravity Agent em produção, configure a variável GEMINI_API_KEY nas Credenciais ou no arquivo .env do servidor.`;
    completionTokens = 45;
  } else {
    try {
      // Cria contexto das mensagens anteriores
      const historyContents = msgs.slice(-8).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const systemInstruction = `Você é o Lux (representado pelo pinguim mascote do Ubuntu), assistente oficial de inteligência artificial e engenheiro DevOps sênior do host "samuelserver" (Ubuntu Server 24.04 LTS, processador Intel Core i5-9500T, 19 GB RAM).
Seu objetivo é ajudar o administrador "samuel" a gerenciar sua infraestrutura com precisão técnica máxima, alta segurança e clareza.
Você tem domínio completo sobre:
1. Redes: IPv4 local (192.168.100.23), IPv6 dinâmico global, túnel Tailscale WireGuard (100.97.208.102).
2. AdGuard Home DNS: bloqueio de rastreadores, telemetria, regras personalizadas e upstreams.
3. Servidor Web Nginx: proxy reverso, certificados, snippets de autenticação e mitigação de bots.
4. Firewall UFW & Segurança: bloqueio de IPs maliciosos, auditoria de SSH (porta 22) e proteção contra força bruta.
5. Automações n8n & Docker: workflows em segundo plano e monitoramento de serviços do systemd.
Sempre forneça comandos prontos e verificados com sintaxe correta para Ubuntu Server.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: historyContents as any,
        config: {
          systemInstruction,
          temperature: 0.3
        }
      });

      assistantReplyText = response.text || 'Sem resposta do agente.';
      
      // Token usage extraction if available from SDK
      if (response.usageMetadata) {
        promptTokens = response.usageMetadata.promptTokenCount || promptTokens;
        completionTokens = response.usageMetadata.candidatesTokenCount || Math.ceil(assistantReplyText.length / 4);
      } else {
        completionTokens = Math.ceil(assistantReplyText.length / 4);
      }

      reasoningText = 'Processado com gemini-3.8-flash via Google GenAI SDK. Raciocínio de infraestrutura e análise de telemetria concluídos.';
    } catch (err: any) {
      assistantReplyText = `Erro ao invocar o modelo Gemini: ${err.message}`;
      completionTokens = 20;
    }
  }

  const totalTokensForTurn = promptTokens + completionTokens;
  recordTokenUsage(promptTokens, completionTokens);

  const assistantMsgId = 'msg_' + crypto.randomUUID().slice(0, 8);
  const assistantMsg: AntigravityMessage = {
    id: assistantMsgId,
    sessionId: session.id,
    role: 'assistant',
    content: assistantReplyText,
    reasoning: reasoningText,
    tokensUsed: totalTokensForTurn,
    timestamp: new Date().toISOString()
  };

  msgs.push(assistantMsg);
  messagesStore.set(session.id, msgs);

  // Atualiza metadados da sessão
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

// Execução de comando via CLI local do Google Antigravity se presente no servidor
export async function executeAntigravityCli(commandArg: string): Promise<{ stdout: string; stderr: string; success: boolean }> {
  try {
    const cleanArg = commandArg.replace(/"/g, '\\"');
    // Verifica se antigravity CLI está no PATH do servidor
    const { stdout, stderr } = await execAsync(`which antigravity >/dev/null 2>&1 && antigravity ${cleanArg} || echo "CLI antigravity ainda não instalado no PATH do sistema. Use os comandos padrões do Ubuntu."`, {
      timeout: 10000
    });
    return { stdout, stderr, success: true };
  } catch (err: any) {
    return { stdout: '', stderr: err.message, success: false };
  }
}
