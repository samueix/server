import fs from 'fs';
import path from 'path';
import { getServerConfig, saveServerConfig } from './credentialsManager.js';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  editTelegramMessageText,
  deleteTelegramMessage,
  answerTelegramCallbackQuery,
  testTelegramConnection,
  getTelegramConfig,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
} from './telegramNotifier.js';
import { takeScreenshot, getBrowserState, startBrowser, navigateBrowser, browserClickSelector, browserTypeText, browserPressKey, browserWait, browserGetInfo, browserEval } from './browserSession.js';
import { getCameraStatus } from './cameras.js';
import { askOpencodeAgent, listOpencodeModels } from './opencode.js';
import { getFullSystemSnapshot, getProcessesList } from './systemMonitor.js';
import { getAllMonitoredServices } from './servicesMonitor.js';
import { getSecurityAttackStatus } from './securityMonitor.js';
import { execFile, spawn } from 'child_process';
import dns from 'dns';

type BotMode = 'menu' | 'ai';

type NetTool = 'ping' | 'trace';
interface ChatState {
  mode: BotMode;
  opencodeSessionId?: string;
  aiModel?: string;
  pendingNetTool?: NetTool;
}

interface BotPersisted {
  offset: number;
  chats?: Record<string, ChatState>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'telegram_bot.json');

const chatStates = new Map<string, ChatState>();
const detectedChats = new Map<string, any>();
let cachedModelChoices: string[] = [];
let offset = 0;
let polling = false;
let loopStarted = false;

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data: BotPersisted = JSON.parse(raw);
      if (typeof data.offset === 'number') offset = data.offset;
      if (data.chats && typeof data.chats === 'object') {
        for (const [chatId, st] of Object.entries(data.chats)) {
          if (st && (st.mode === 'menu' || st.mode === 'ai')) {
            chatStates.set(chatId, {
              mode: st.mode,
              ...(st.opencodeSessionId ? { opencodeSessionId: String(st.opencodeSessionId) } : {}),
              ...(st.aiModel ? { aiModel: String(st.aiModel) } : {}),
            });
          }
        }
      }
    }
  } catch {}
}

function persistState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const chats: Record<string, ChatState> = {};
    for (const [k, v] of chatStates.entries()) {
      chats[k] = v;
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ offset, chats }, null, 2), 'utf-8');
  } catch {}
}

loadState();

function getState(chatId: string): ChatState {
  if (!chatStates.has(chatId)) {
    chatStates.set(chatId, { mode: 'menu' });
  }
  const st = chatStates.get(chatId)!;
  if (st.pendingNetTool !== 'ping' && st.pendingNetTool !== 'trace') st.pendingNetTool = undefined;
  return st;
}

function getEffectiveAiModel(chatId: string): string {
  const st = getState(chatId);
  const cfg = getServerConfig() as any;
  const t = cfg.telegram || {};
  return String(
    st.aiModel || t.aiModel || process.env.TELEGRAM_AI_MODEL || 'google/gemini-3.5-flash'
  ).trim();
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtNum(n: any, digits = 1): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : 'N/D';
}

function pickAccessInfo(net: any, hostname?: string) {
  const ifaces = Array.isArray(net?.interfaces) ? net.interfaces : [];
  let lan4 = net?.primary_ip || net?.primaryIp;
  let ts4: string | undefined;
  let global6: string | undefined;
  let ts6: string | undefined;

  for (const i of ifaces) {
    const v4 = i.ipv4 || (i.ip && !String(i.ip).includes(':') && i.ip !== '--' ? i.ip : undefined);
    const v6 = i.ipv6 || undefined;
    if (i.nome === 'tailscale0' || (v4 && String(v4).startsWith('100.'))) {
      if (v4) ts4 = v4;
      if (v6) ts6 = v6;
    }
    if (i.nome === 'wlo1' || (v4 && String(v4).startsWith('192.168.'))) {
      if (v4) lan4 = v4;
      if (v6 && /^[23]/.test(v6)) global6 = v6;
    }
    if (!global6 && v6 && /^[23]/.test(v6)) global6 = v6;
  }
  if (!global6 && net?.primary_ipv6 && /^[23]/.test(net.primary_ipv6)) global6 = net.primary_ipv6;
  if (!ts6 && net?.primary_ipv6 && String(net.primary_ipv6).startsWith('fd')) ts6 = net.primary_ipv6;

  const host = hostname || 'samuelserver';
  const user = process.env.SUDO_USER || process.env.USER || 'samuel';
  return { lan4, ts4, global6, ts6, host, user };
}

function mainMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🤖 Falar com IA', callback_data: 'act:ia' },
        { text: '🧠 Escolher IA', callback_data: 'act:models' },
      ],
      [
        { text: '📊 Status Geral', callback_data: 'act:status' },
        { text: '🧩 Serviços', callback_data: 'act:servicos' },
      ],
      [
        { text: '🛡️ Segurança', callback_data: 'act:seguranca' },
        { text: '⚙️ Processos', callback_data: 'act:processos' },
      ],
      [
        { text: '🌐 Rede & IPs', callback_data: 'act:rede' },
        { text: '💾 Disco & RAM', callback_data: 'act:disco' },
      ],
      [
        { text: '🐳 Docker', callback_data: 'act:docker' },
        { text: '🔗 Acesso & SSH', callback_data: 'act:acesso' },
      ],
      [
        { text: '📡 Ping', callback_data: 'act:ping' },
        { text: '🧭 Traceroute', callback_data: 'act:trace' },
      ],
      [
        { text: '📸 Print Browser', callback_data: 'act:print' },
        { text: '📷 Foto Câmera', callback_data: 'act:camera' },
      ],
      [
        { text: '🔄 Atualizar Menu', callback_data: 'act:menu' },
      ],
    ],
  };
}

function reportFooterKeyboard(refreshAction: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🔄 Atualizar', callback_data: refreshAction },
        { text: '🤖 Perguntar à IA', callback_data: 'act:ia' },
      ],
      [{ text: '⬅️ Voltar ao Menu', callback_data: 'act:menu' }],
    ],
  };
}

function aiModeKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🧠 Trocar Modelo IA', callback_data: 'act:models' },
        { text: '🆕 Nova Conversa', callback_data: 'ai:new' },
      ],
      [
        { text: '📊 Status Geral', callback_data: 'act:status' },
        { text: '⬅️ Voltar ao Menu', callback_data: 'act:menu' },
      ],
    ],
  };
}


const NET_DEFAULTS = [
  { label: 'Gateway', host: '192.168.100.1' },
  { label: 'Google DNS', host: '8.8.8.8' },
  { label: 'Cloudflare', host: '1.1.1.1' },
];

function isValidHostInput(host: string): boolean {
  const h = String(host || '').trim();
  if (!h || h.length > 253) return false;
  return /^[a-zA-Z0-9._:-]+$/.test(h);
}

function netToolKeyboard(tool: NetTool): InlineKeyboardMarkup {
  const prefix = tool === 'ping' ? 'net:ping:' : 'net:trace:';
  return {
    inline_keyboard: [
      ...NET_DEFAULTS.map(d => [{ text: `${tool === 'ping' ? '📡' : '🧭'} ${d.label} (${d.host})`, callback_data: `${prefix}${d.host}` }]),
      [{ text: '✍️ Digitar IP/host', callback_data: `net:custom:${tool}` }],
      [{ text: '⬅️ Voltar ao Menu', callback_data: 'act:menu' }],
    ],
  };
}


function runSystemPing(host: string): Promise<{ ok: boolean; output: string; avgMs?: number }> {
  return new Promise((resolve) => {
    execFile('ping', ['-c', '4', '-W', '1', '-n', host], { timeout: 12000, maxBuffer: 1024 * 256 }, (err: any, stdout: string, stderr: string) => {
      const out = String(stdout || stderr || err?.message || '').trim();
      const avg = out.match(/(?:rtt|round-trip).*?=\s*[\d.]+\/([\d.]+)\/[\d.]+/i) || out.match(/avg[^0-9]*([\d.]+)/i);
      resolve({ ok: !err || /bytes from/i.test(out), output: out, avgMs: avg ? Number(avg[1]) : undefined });
    });
  });
}

async function runTelegramPing(chatId: string, host: string, editMessageId?: number): Promise<void> {
  if (!isValidHostInput(host)) {
    await sendTelegramMessage('❌ Host inválido.', { chatId, replyMarkup: netToolKeyboard('ping') });
    return;
  }
  const waiting = `📡 <b>Ping em ${escapeHtml(host)}</b>\nEnviando 4 pacotes...`;
  const markup = netToolKeyboard('ping');
  let msgId = editMessageId;
  if (msgId) {
    await editTelegramMessageText(chatId, msgId, waiting, { parseMode: 'HTML', replyMarkup: markup });
  } else {
    const sent = await sendTelegramMessage(waiting, { chatId, parseMode: 'HTML', replyMarkup: markup });
    msgId = sent?.data?.message_id;
  }
  const r = await runSystemPing(host);
  const lines = r.output.split('\n').filter(Boolean);
  const summary = lines.filter(l => /packets transmitted|rtt|round-trip|bytes from|from .*icmp_seq|unreachable|timed out/i.test(l)).slice(-8);
  const body = summary.length ? summary : lines.slice(-8);
  const text = [
    `${r.ok ? '📡' : '⚠️'} <b>Ping: ${escapeHtml(host)}</b>`,
    r.avgMs != null ? `Latência média: <b>${fmtNum(r.avgMs, 1)} ms</b>` : null,
    '',
    '<pre>' + escapeHtml(body.join('\n').slice(0, 3200) || r.output.slice(0, 3200) || 'Sem saída') + '</pre>',
  ].filter(Boolean).join('\n');
  if (msgId) {
    const edited = await editTelegramMessageText(chatId, msgId, text, { parseMode: 'HTML', replyMarkup: markup });
    if (edited.ok) return;
  }
  await sendTelegramMessage(text, { chatId, parseMode: 'HTML', replyMarkup: markup });
}

function runSystemTrace(host: string): Promise<{ ok: boolean; lines: string[]; error?: string }> {
  return new Promise((resolve) => {
    const candidates: Array<{ cmd: string; args: string[] }> = [
      { cmd: 'mtr', args: ['-n', '-r', '-c', '1', '-w', '-z', host] },
      { cmd: 'tracepath', args: ['-n', host] },
      { cmd: 'traceroute', args: ['-n', '-q', '1', '-w', '1', host] },
    ];
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) return resolve({ ok: false, lines: [], error: 'Nenhum comando de traceroute disponível (mtr/tracepath/traceroute).' });
      const c = candidates[idx++];
      const p = spawn(c.cmd, c.args, { timeout: 25000 });
      let out = '';
      let err = '';
      p.stdout.on('data', (d: Buffer) => out += d.toString('utf-8'));
      p.stderr.on('data', (d: Buffer) => err += d.toString('utf-8'));
      p.on('error', () => tryNext());
      p.on('close', (code: number) => {
        const text = (out || err).trim();
        if (code === 0 || /HOST:|^\s*\d+[:| ]/m.test(text)) {
          resolve({ ok: true, lines: text.split('\n').map(l => l.trimEnd()).filter(Boolean) });
        } else if (idx < candidates.length) tryNext();
        else resolve({ ok: false, lines: text ? text.split('\n').filter(Boolean) : [], error: err || `exit ${code}` });
      });
    };
    tryNext();
  });
}

async function resolveTraceMeta(ip: string): Promise<{ rdns?: string; asn?: string; org?: string; country?: string }> {
  const meta: { rdns?: string; asn?: string; org?: string; country?: string } = {};
  if (!ip || ip === '*' || ip === '???') return meta;
  try { const names = await Promise.race([dns.promises.reverse(ip), new Promise<string[]>((_,rej)=>setTimeout(()=>rej(new Error('t')),1200))]) as string[]; if (names?.[0]) meta.rdns = names[0]; } catch {}
  // ISP/AS via ip-api (free, non-commercial; best-effort)
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,as,org,isp,query`, { signal: AbortSignal.timeout(1800) });
    if (r.ok) {
      const j:any = await r.json().catch(()=>null);
      if (j?.status === 'success') {
        if (j.as) meta.asn = String(j.as).split(' ')[0];
        meta.org = String(j.isp || j.org || '').trim() || undefined;
        meta.country = String(j.country || '').trim() || undefined;
      }
    }
  } catch {}
  return meta;
}

function parseTraceHops(rawLines: string[]): Array<{ hop: string; ip: string; ms: string }> {
  const hops: Array<{ hop: string; ip: string; ms: string }> = [];
  for (const raw of rawLines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || /^HOST:/i.test(line) || /^Start:/i.test(line)) continue;
    let m = line.match(/^(\d+)\.\|\-\-\s+(\S+)\s+([\d.]+)%\s+\d+\s+[\d.]+\s+([\d.]+)/);
    if (m) { hops.push({ hop: m[1], ip: m[2], ms: m[3] }); continue; }
    m = line.match(/^(\d+)[?:]?:\s+(\S+)(?:\s+.*?([\d.]+)\s*ms)?/i);
    if (m) { const ip=m[2]; if (ip==='no') continue; hops.push({ hop:m[1], ip, ms: m[3] || '*' }); continue; }
    m = line.match(/^(\d+)\s+(\S+)\s+([\d.]+)\s*ms/i);
    if (m) { hops.push({ hop:m[1], ip:m[2], ms:m[3] }); continue; }
    m = line.match(/^(\d+)\s+\*\s+\*\s+\*/);
    if (m) { hops.push({ hop:m[1], ip:'*', ms:'*' }); continue; }
  }
  return hops;
}

async function formatTraceForTelegram(host: string, rawLines: string[]): Promise<string> {
  const hops = parseTraceHops(rawLines);
  const ips = [...new Set(hops.map(h => h.ip).filter(ip => ip && ip !== '*' && ip !== '???'))].slice(0, 30);
  const metaEntries = await Promise.all(ips.map(async ip => [ip, await resolveTraceMeta(ip)] as const));
  const meta = new Map(metaEntries);
  const lines = hops.map(h => {
    if (h.ip === '*') return `${h.hop.padStart(2,' ')}. *`;
    const m = meta.get(h.ip) || {};
    const who = [m.asn, m.org].filter(Boolean).join(' ');
    const name = m.rdns ? ` ${m.rdns}` : '';
    const extra = who ? ` [${who}]` : '';
    return `${h.hop.padStart(2,' ')}. ${h.ip}${name}${extra}  ${h.ms} ms`;
  });
  const body = lines.length ? lines.join('\n') : rawLines.slice(0, 30).join('\n');
  return [
    `🧭 <b>Traceroute: ${escapeHtml(host)}</b>`,
    '<i>IP, nome reverso (quando existe), AS/ISP e latência</i>',
    '',
    '<pre>' + escapeHtml(body.slice(0, 3400)) + '</pre>',
  ].join('\n');
}

async function runTelegramTrace(chatId: string, host: string, editMessageId?: number): Promise<void> {
  if (!isValidHostInput(host)) {
    await sendTelegramMessage('❌ Host inválido.', { chatId, replyMarkup: netToolKeyboard('trace') });
    return;
  }
  const waiting = `🧭 <b>Traceroute em ${escapeHtml(host)}</b>\nRastreando rota...`;
  const markup = netToolKeyboard('trace');
  let msgId = editMessageId;
  if (msgId) await editTelegramMessageText(chatId, msgId, waiting, { parseMode: 'HTML', replyMarkup: markup });
  else { const sent = await sendTelegramMessage(waiting, { chatId, parseMode: 'HTML', replyMarkup: markup }); msgId = sent?.data?.message_id; }
  const r = await runSystemTrace(host);
  const text = r.ok || r.lines.length ? await formatTraceForTelegram(host, r.lines) : `⚠️ <b>Traceroute: ${escapeHtml(host)}</b>\n\n<pre>${escapeHtml((r.error||'Falha').slice(0,1000))}</pre>`;
  if (msgId) { const edited = await editTelegramMessageText(chatId, msgId, text, { parseMode: 'HTML', replyMarkup: markup }); if (edited.ok) return; }
  await sendTelegramMessage(text, { chatId, parseMode: 'HTML', replyMarkup: markup });
}
async function sendNetToolPrompt(chatId: string, tool: NetTool, editMessageId?: number): Promise<void> {
  const st = getState(chatId);
  st.pendingNetTool = tool;
  st.mode = 'menu';
  persistState();
  const title = tool === 'ping' ? '📡 <b>Ping</b>' : '🧭 <b>Traceroute</b>';
  const text = [
    title,
    tool === 'ping'
      ? 'Escolha um alvo padrão ou toque em <b>Digitar IP/host</b> para informar outro.'
      : 'Escolha um alvo padrão ou toque em <b>Digitar IP/host</b> para informar outro. O resultado vai mostrar cada salto com IP e latência.',
  ].join('\n');
  const markup = netToolKeyboard(tool);
  if (editMessageId) {
    const edited = await editTelegramMessageText(chatId, editMessageId, text, { parseMode: 'HTML', replyMarkup: markup });
    if (edited.ok) return;
  }
  await sendTelegramMessage(text, { chatId, parseMode: 'HTML', replyMarkup: markup });
}
function buildMainMenuText(receivedMessage?: string): string {
  const lines: string[] = [];
  if (receivedMessage) {
    lines.push(`💬 Mensagem recebida: <i>"${escapeHtml(receivedMessage.slice(0, 120))}"</i>`, '');
  }
  lines.push(
    '🤖 <b>Server Panel Bot — Painel Rápido</b>',
    'Escolha o que deseja consultar ou operar nos botões abaixo:'
  );
  return lines.join('\n');
}

function formatModelLabel(model: string, activeModel: string): string {
  const shortName = model.includes('/') ? model.split('/').slice(1).join('/') : model;
  const isGoogle = model.startsWith('google/');
  const isOpenCode = model.startsWith('opencode/');
  const icon = model === activeModel ? '✅' : isGoogle ? '✨' : isOpenCode ? '🧠' : '🤖';
  const label = `${icon} ${shortName}`;
  return label.length > 26 ? label.slice(0, 25) + '…' : label;
}

async function buildModelsKeyboard(activeModel: string): Promise<InlineKeyboardMarkup> {
  let models: string[] = [];
  try {
    models = await listOpencodeModels();
  } catch {}
  const merged = Array.from(new Set([activeModel, ...models].filter(Boolean)));
  cachedModelChoices = merged.slice(0, 16);

  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < cachedModelChoices.length; i += 2) {
    const row: InlineKeyboardButton[] = [
      {
        text: formatModelLabel(cachedModelChoices[i], activeModel),
        callback_data: `mod:${i}`,
      },
    ];
    if (i + 1 < cachedModelChoices.length) {
      row.push({
        text: formatModelLabel(cachedModelChoices[i + 1], activeModel),
        callback_data: `mod:${i + 1}`,
      });
    }
    rows.push(row);
  }
  rows.push([
    { text: '💬 Ir para Chat IA', callback_data: 'act:ia' },
    { text: '⬅️ Voltar ao Menu', callback_data: 'act:menu' },
  ]);
  return { inline_keyboard: rows };
}

async function buildStatusText(): Promise<string> {
  try {
    const s: any = getFullSystemSnapshot();
    const cpu = s.cpu || {};
    const mem = s.memory?.ram || s.memory || s.memoria || {};
    const disk = s.disk?.root || s.disk || s.disco || {};
    const uptime = s.uptime || {};
    const net = s.network || s.rede || {};
    const temp = s.temperature || s.temperatura || {};
    const cpuPct = cpu.usage_percent ?? cpu.uso_percentual ?? cpu.percent;
    const memPct = mem.usage_percent ?? mem.uso_percentual ?? mem.percent;
    const diskPct = disk.usage_percent ?? disk.uso_percentual ?? disk.percent;
    const host = s.system?.hostname || s.sistema?.hostname || 'samuelserver';
    const acc = pickAccessInfo(net, host);
    const loadObj = cpu.load_average || cpu.load || {};
    const loadStr =
      typeof loadObj === 'object' && loadObj !== null
        ? `${loadObj['1m'] ?? '?'} / ${loadObj['5m'] ?? '?'} / ${loadObj['15m'] ?? '?'}`
        : String(loadObj);
    const rawTemp = temp?.temperatura_c ?? temp?.cpu_temp ?? temp?.sensores;
    const tempStr =
      typeof rawTemp === 'number'
        ? `${rawTemp.toFixed(1)}°C`
        : rawTemp != null
        ? String(rawTemp)
        : 'N/D';

    const lines = [
      '📊 <b>Status Geral do Servidor</b>',
      `<b>Host:</b> <code>${escapeHtml(host)}</code>`,
      `<b>Uptime:</b> ${escapeHtml(uptime.uptime_human || uptime.uptime || 'N/D')}`,
      `<b>CPU:</b> ${fmtNum(cpuPct)}% | <b>Load:</b> <code>${escapeHtml(loadStr)}</code>`,
      `<b>RAM:</b> ${fmtNum(memPct)}% (${fmtNum(mem.used_gb ?? mem.usada_gb)} / ${fmtNum(mem.total_gb)} GB)`,
      `<b>Disco (/):</b> ${fmtNum(diskPct)}% (${fmtNum(disk.used_gb ?? disk.usado_gb)} / ${fmtNum(disk.total_gb)} GB)`,
      `<b>Temperatura:</b> ${escapeHtml(tempStr)}`,
      `<b>Interface:</b> <code>${escapeHtml(net.primary_interface || net.primaryInterface || 'N/D')}</code>`,
      `<b>IPv4 LAN:</b> <code>${escapeHtml(acc.lan4 || net.primary_ip || net.primaryIp || 'N/D')}</code>`,
    ];
    if (acc.global6) lines.push(`<b>IPv6:</b> <code>${escapeHtml(acc.global6)}</code>`);
    if (acc.ts4) {
      lines.push(
        `<b>Tailscale:</b> <code>${escapeHtml(acc.ts4)}</code>${
          acc.ts6 ? ` (<code>${escapeHtml(acc.ts6)}</code>)` : ''
        }`
      );
    }
    lines.push(
      `<b>Tráfego:</b> ↓${net.download_bytes_sec ?? 0} B/s ↑${net.upload_bytes_sec ?? 0} B/s`,
      '',
      '🔗 <b>Acesso rápido:</b>'
    );
    if (acc.lan4) lines.push(`• LAN: http://${escapeHtml(acc.lan4)}/`);
    if (acc.ts4) lines.push(`• Tailscale: http://${escapeHtml(acc.ts4)}/`);
    if (acc.global6) lines.push(`• IPv6: http://[${escapeHtml(acc.global6)}]/`);
    return lines.join('\n');
  } catch (e: any) {
    return `❌ Erro ao obter status: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildServicesText(): Promise<string> {
  try {
    const svcs = (getAllMonitoredServices() || []) as any[];
    const lines = svcs.slice(0, 40).map((s) => {
      const st = s.status || (s.ativo ? 'ONLINE' : 'OFFLINE');
      const icon = st === 'ONLINE' ? '🟢' : st === 'ERRO' ? '🔴' : '⚪';
      return `${icon} <b>${escapeHtml(s.name || s.nome)}:</b> ${escapeHtml(st)}${
        s.porta ? ` <code>(porta ${escapeHtml(s.porta)})</code>` : ''
      }`;
    });
    return ['🧩 <b>Serviços Monitorados</b>', '', ...lines].join('\n');
  } catch (e: any) {
    return `❌ Erro ao obter serviços: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildSecurityText(): Promise<string> {
  try {
    const sec: any = await getSecurityAttackStatus();
    const lines = [
      '🛡️ <b>Segurança &amp; Ataques</b>',
      `<b>Nível:</b> ${escapeHtml(sec.threatLevel || 'N/D')}${
        sec.isUnderAttack ? ' 🚨 <b>(SOB ATAQUE)</b>' : ''
      }`,
      `<b>Falhas 24h:</b> ${sec.totalFailedAttempts24h ?? 0} | <b>Última hora:</b> ${sec.failedAttemptsLastHour ?? 0}`,
      `<b>Scans detectados:</b> ${sec.totalScansDetected ?? 0}`,
      `<b>SSH:</b> ${escapeHtml(sec.sshStatus || 'N/D')} | <b>Nginx:</b> ${escapeHtml(sec.nginxStatus || 'N/D')}`,
      `<b>Ameaças externas:</b> ${sec.externalThreatsCount ?? 0} | <b>LAN:</b> ${sec.lanAttemptsCount ?? 0}`,
      `<b>IPs bloqueados (UFW):</b> ${(sec.blockedIpsInUfw || []).length}`,
    ];
    const top = (sec.attackSources || []).slice(0, 5);
    if (top.length) {
      lines.push('', '<b>Top origens:</b>');
      for (const a of top) {
        lines.push(
          `• <code>${escapeHtml(a.ip)}</code> (${a.count}x) ${escapeHtml(a.country || '')} ${escapeHtml(
            a.status || ''
          )}`.trim()
        );
      }
    }
    return lines.join('\n');
  } catch (e: any) {
    return `❌ Erro ao obter segurança: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildProcessesText(): Promise<string> {
  try {
    const info: any = getProcessesList('cpu', 0);
    const procs = Array.isArray(info?.processes) ? info.processes : [];
    const topCpu = [...procs].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0)).slice(0, 8);
    const topMem = [...procs]
      .sort(
        (a, b) =>
          (b.memory_percent || b.mem_percent || 0) - (a.memory_percent || a.mem_percent || 0)
      )
      .slice(0, 8);
    const fmt = (p: any) =>
      `• <code>PID ${p.pid}</code> ${escapeHtml(p.user || p.usuario || '')} | CPU <b>${fmtNum(
        p.cpu_percent || 0
      )}%</b> | RAM <b>${fmtNum(p.memory_percent || p.mem_percent || 0)}%</b> — <code>${escapeHtml(
        String(p.comando || p.command || p.name || '').slice(0, 38)
      )}</code>`;
    return [
      '⚙️ <b>Processos Ativos</b>',
      `Total: <b>${info.count ?? procs.length}</b> (running ${info.running ?? '?'}, sleeping ${info.sleeping ?? '?'})`,
      '',
      '<b>Top CPU:</b>',
      ...topCpu.map(fmt),
      '',
      '<b>Top RAM:</b>',
      ...topMem.map(fmt),
    ].join('\n');
  } catch (e: any) {
    return `❌ Erro ao obter processos: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildNetworkText(): Promise<string> {
  try {
    const s: any = getFullSystemSnapshot();
    const net = s.network || s.rede || {};
    const ifaces = net.interfaces || net.ifaces || [];
    const host = s.system?.hostname || s.sistema?.hostname || 'samuelserver';
    const acc = pickAccessInfo(net, host);
    const lines = ['🌐 <b>Rede &amp; Interfaces</b>', ''];
    if (Array.isArray(ifaces) && ifaces.length) {
      for (const i of ifaces.slice(0, 12)) {
        const parts = [`• <b>${escapeHtml(i.name || i.nome)}:</b> ${escapeHtml(i.state || i.status || '')}`.trim()];
        if (i.ipv4) parts.push(`IPv4 <code>${escapeHtml(i.ipv4)}</code>`);
        if (i.ipv6) parts.push(`IPv6 <code>${escapeHtml(i.ipv6)}</code>`);
        if (!i.ipv4 && !i.ipv6 && i.ip && i.ip !== '--') parts.push(`<code>${escapeHtml(i.ip)}</code>`);
        lines.push(parts.join(' | '));
      }
    } else {
      lines.push(`<b>Interface:</b> <code>${escapeHtml(net.primary_interface || net.primaryInterface || 'N/D')}</code>`);
      lines.push(`<b>IPv4:</b> <code>${escapeHtml(acc.lan4 || net.primary_ip || net.primaryIp || 'N/D')}</code>`);
      if (acc.global6) lines.push(`<b>IPv6 (global):</b> <code>${escapeHtml(acc.global6)}</code>`);
      if (acc.ts4) {
        lines.push(
          `<b>Tailscale:</b> <code>${escapeHtml(acc.ts4)}</code>${
            acc.ts6 ? ` (<code>${escapeHtml(acc.ts6)}</code>)` : ''
          }`
        );
      }
    }
    lines.push(
      `<b>RX:</b> ${escapeHtml(net.total_received_formatted || net.bytes_recv || 'N/D')} | <b>TX:</b> ${escapeHtml(
        net.total_sent_formatted || net.bytes_sent || 'N/D'
      )}`,
      '',
      '🔗 <b>Links diretos (navegador):</b>'
    );
    if (acc.lan4) lines.push(`• LAN: http://${escapeHtml(acc.lan4)}/`);
    if (acc.ts4) lines.push(`• Tailscale: http://${escapeHtml(acc.ts4)}/`);
    if (acc.global6) lines.push(`• IPv6: http://[${escapeHtml(acc.global6)}]/`);
    if (!acc.global6) lines.push('• IPv6 global: não detectado na interface principal.');
    return lines.join('\n');
  } catch (e: any) {
    return `❌ Erro ao obter rede: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildDiskText(): Promise<string> {
  try {
    const s: any = getFullSystemSnapshot();
    const mem = s.memory?.ram || s.memory || s.memoria || {};
    const swap = mem.swap || s.memory?.swap;
    const disk = s.disk?.root || s.disk || s.disco || {};
    const swapText =
      swap && typeof swap === 'object'
        ? `${fmtNum(swap.used_gb)} / ${fmtNum(swap.total_gb)} GB (${fmtNum(swap.usage_percent)}%)`
        : String(swap ?? 'N/D');
    return [
      '💾 <b>Disco &amp; Memória</b>',
      `<b>RAM:</b> usada ${fmtNum(mem.used_gb ?? mem.usada_gb)} / ${fmtNum(mem.total_gb)} GB (<b>${fmtNum(
        mem.usage_percent ?? mem.uso_percentual
      )}%</b>) | disp ${fmtNum(mem.available_gb ?? mem.disponivel_gb)} GB`,
      `<b>Swap:</b> ${escapeHtml(swapText)}`,
      `<b>Disco (/):</b> usado ${fmtNum(disk.used_gb ?? disk.usado_gb)} / ${fmtNum(disk.total_gb)} GB (<b>${fmtNum(
        disk.usage_percent ?? disk.uso_percentual
      )}%</b>) | livre ${fmtNum(disk.free_gb ?? disk.livre_gb)} GB`,
    ].join('\n');
  } catch (e: any) {
    return `❌ Erro ao obter disco/memória: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildAccessText(): Promise<string> {
  try {
    const s: any = getFullSystemSnapshot();
    const net = s.network || s.rede || {};
    const host = s.system?.hostname || s.sistema?.hostname || 'samuelserver';
    const acc = pickAccessInfo(net, host);
    const lines = ['🔗 <b>Acesso ao Painel &amp; SSH</b>', '', '<b>Painel no navegador:</b>'];
    if (acc.lan4) lines.push(`• LAN: http://${escapeHtml(acc.lan4)}/`);
    if (acc.ts4) lines.push(`• Tailscale: http://${escapeHtml(acc.ts4)}/`);
    if (acc.global6) lines.push(`• IPv6: http://[${escapeHtml(acc.global6)}]/`);
    lines.push(`• Hostname: http://${escapeHtml(acc.host)}/`, '', '<b>Acesso SSH (terminal):</b>');
    if (acc.lan4) lines.push(`• LAN: <code>ssh ${escapeHtml(acc.user)}@${escapeHtml(acc.lan4)}</code>`);
    if (acc.ts4) lines.push(`• Tailscale: <code>ssh ${escapeHtml(acc.user)}@${escapeHtml(acc.ts4)}</code>`);
    if (acc.global6) lines.push(`• IPv6: <code>ssh ${escapeHtml(acc.user)}@${escapeHtml(acc.global6)}</code>`);
    lines.push(`• Hostname: <code>ssh ${escapeHtml(acc.user)}@${escapeHtml(acc.host)}</code>`);
    lines.push('', '<b>Dicas rápidas:</b>');
    lines.push('• Na mesma rede use LAN; fora de casa use Tailscale (100.x).');
    lines.push('• Em links IPv6 use colchetes: <code>http://[IPv6]/</code>');
    lines.push(`• Copiar arquivo: <code>scp arquivo.txt ${escapeHtml(acc.user)}@${escapeHtml(acc.lan4 || acc.host)}:</code>`);
    return lines.join('\n');
  } catch (e: any) {
    return `❌ Erro ao montar informações de acesso: ${escapeHtml(e?.message || e)}`;
  }
}

async function buildDockerText(): Promise<string> {
  try {
    const { execFile } = await import('child_process');
    const util = await import('util');
    const pexec = util.promisify(execFile);
    let out = '';
    try {
      const r = await pexec('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Status}}\t{{.Image}}'], {
        timeout: 8000,
      });
      out = (r.stdout || '').trim();
    } catch (e: any) {
      return `🐳 <b>Docker</b>\nIndisponível: <code>${escapeHtml(
        (e?.stderr || e?.message || '').toString().slice(0, 300)
      )}</code>`;
    }
    if (!out) return '🐳 <b>Docker</b>\nNenhum container encontrado.';
    const lines = out.split('\n').slice(0, 20).map((l) => {
      const [name, status, image] = l.split('\t');
      const icon = /Up/i.test(status || '') ? '🟢' : '⚪';
      return `${icon} <b>${escapeHtml(name)}:</b> ${escapeHtml(status)} (<code>${escapeHtml(image || '')}</code>)`;
    });
    return ['🐳 <b>Docker Containers</b>', '', ...lines].join('\n');
  } catch (e: any) {
    return `❌ Erro ao consultar Docker: ${escapeHtml(e?.message || e)}`;
  }
}

function wantsScreenshot(text: string): boolean {
  return /\b(foto|print|screenshot|captura|printscreen|tela|imagem|screen)\b/i.test(text || '');
}

function stripScreenshotMarker(text: string): string {
  return String(text || '')
    .replace(/\[+SCREENSHOT(?:\s*\|\s*CAPTURA)?\]+/gi, '')
    .replace(/\[+CAPTURA\]+/gi, '')
    .trim();
}

function extractBrowserTarget(text: string): string | null {
  const raw = String(text || '');
  const m = raw.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (m) return m[0];
  const t = raw.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/\byoutube\b|\byt\b/, 'https://www.youtube.com/'],
    [/\bgoogle\b/, 'https://www.google.com/'],
    [/\bgithub\b/, 'https://github.com/'],
    [/\bwhatsapp\b/, 'https://web.whatsapp.com/'],
    [/\bgmail\b/, 'https://mail.google.com/'],
    [/\bchatgpt\b|\bopenai\b/, 'https://chatgpt.com/'],
    [/\bfacebook\b/, 'https://www.facebook.com/'],
    [/\binstagram\b/, 'https://www.instagram.com/'],
    [/\btwitter\b|\bx\.com\b/, 'https://x.com/'],
  ];
  for (const [re, url] of map) if (re.test(t)) return url;
  // generic subject: "foto do X", "print de X" -> search images
  const subj = raw
    .replace(/^(manda|me manda|envia|tira|faz|mostra|quero|ver)\b/ig, ' ')
    .replace(/\b(uma|um|o|a|do|da|de|no|na|agora|pra mim|por favor|pfv|favor)\b/ig, ' ')
    .replace(/\b(foto|print|screenshot|captura|printscreen|tela|imagem|screen)\b/ig, ' ')
    .replace(/\s+/g, ' ').trim();
  if (subj && subj.length >= 2 && subj.length <= 80) {
    return 'https://www.bing.com/images/search?q=' + encodeURIComponent(subj) + '&setlang=pt-br&first=1';
  }
  return null;
}

async function trySendBrowserScreenshot(
  chatId: string,
  caption?: string,
  replyMarkup?: InlineKeyboardMarkup,
  requestedText?: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    let state = getBrowserState();
    const targetUrl = extractBrowserTarget(requestedText || caption || '');
    if (!state || (state.status !== 'running' && state.status !== 'paused')) {
      try {
        await sendTelegramMessage('🌐 Iniciando navegador remoto...', { chatId });
        await startBrowser();
        state = getBrowserState();
      } catch (e: any) {
        return { ok: false, message: `Não consegui iniciar o navegador remoto: ${e?.message || e}` };
      }
    }

    if (targetUrl) {
      try {
        const cur = (getBrowserState().url || '').toLowerCase().replace(/\/$/, '');
        const tgt = targetUrl.toLowerCase().replace(/\/$/, '');
        const sameSite = cur === tgt || cur.startsWith(tgt + '/') || cur.startsWith(tgt);
        if (!sameSite) {
          await sendTelegramMessage(`🔎 Abrindo ${targetUrl} ...`, { chatId });
          await navigateBrowser(targetUrl);
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (e: any) {
        return { ok: false, message: `Navegador ativo, mas falha ao abrir ${targetUrl}: ${e?.message || e}` };
      }
    }

    state = getBrowserState();
    if (!state?.url || state.url === 'about:blank') {
      const fallback = targetUrl || 'https://www.google.com/';
      try {
        await navigateBrowser(fallback);
        await new Promise(r => setTimeout(r, 3000));
      } catch {}
    }

    // dismiss common consent/overlay popups best-effort
    try {
      const { browserEval } = await import('./browserSession.js');
      await browserEval(`() => {
        const clickByText = (re) => {
          const els = Array.from(document.querySelectorAll('button,a,[role="button"]'));
          const el = els.find(e => re.test((e.innerText||e.textContent||'').trim()));
          if (el) { el.click(); return true; }
          return false;
        };
        clickByText(/aceitar|accept|concordo|agree|got it|ok/i);
        document.querySelector('#bnp_btn_accept,#bnp_close_link')?.click?.();
        return true;
      }`).catch(()=>{});
      await new Promise(r=>setTimeout(r,1200));
    } catch {}
    const buf = await takeScreenshot();
    if (!buf || !buf.length) return { ok: false, message: 'Não foi possível capturar a tela (imagem vazia).' };
    const st2 = getBrowserState();
    const cap = (caption || `📸 ${st2.title || st2.url || 'navegador remoto'}`).slice(0, 1024);
    const sent = await sendTelegramPhoto(buf, cap, { chatId, replyMarkup });
    if (!sent.ok) return { ok: false, message: sent.error || 'Falha ao enviar foto no Telegram.' };
    return { ok: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    return { ok: false, message: `Não consegui capturar a tela: ${msg}` };
  }
}

async function handleCameraSnapshot(chatId: string, camId?: string, editMessageId?: number): Promise<void> {
  try {
    const st = await getCameraStatus();
    const cams = Array.isArray(st?.cameras) ? st.cameras : [];
    if (!cams.length) {
      await sendTelegramMessage('📷 Nenhuma câmera configurada.', { chatId, replyMarkup: reportFooterKeyboard('act:camera') });
      return;
    }
    const cam = camId ? cams.find((c:any)=>String(c.id)===String(camId)) : cams[0];
    if (!cam) {
      await sendTelegramMessage('📷 Câmera não encontrada.', { chatId, replyMarkup: reportFooterKeyboard('act:camera') });
      return;
    }
    const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/cameras/${cam.id}/stream/sub/frame.jpeg?t=${Date.now()}`;
    const cfg = getServerConfig() as any;
    const auth = Buffer.from(`${cfg.auth?.adminUser || 'admin'}:${cfg.auth?.adminPass || ''}`).toString('base64');
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const cap = `📷 ${cam.name} (${cam.ip}) - ${new Date().toLocaleString('pt-BR')}`;
    const rows: InlineKeyboardButton[][] = cams.slice(0,6).map((c:any)=>[{ text: `📷 ${c.name}`, callback_data: `cam:snap:${c.id}` }]);
    rows.push([{ text: '⬅️ Voltar ao Menu', callback_data: 'act:menu' }]);
    await sendTelegramPhoto(buf, cap, { chatId, replyMarkup: { inline_keyboard: rows } });
  } catch (e:any) {
    await sendTelegramMessage(`❌ Erro ao capturar câmera: ${escapeHtml(e?.message || e)}`, { chatId, parseMode:'HTML', replyMarkup: reportFooterKeyboard('act:camera') });
  }
}

async function sendMainMenu(chatId: string, receivedMessage?: string, editMessageId?: number): Promise<void> {
  const st = getState(chatId);
  st.mode = 'menu';
  persistState();
  const text = buildMainMenuText(receivedMessage);
  const markup = mainMenuKeyboard();
  if (editMessageId) {
    const edited = await editTelegramMessageText(chatId, editMessageId, text, {
      parseMode: 'HTML',
      replyMarkup: markup,
    });
    if (edited.ok) return;
  }
  await sendTelegramMessage(text, {
    chatId,
    parseMode: 'HTML',
    replyMarkup: markup,
  });
}

async function sendModelPicker(chatId: string, editMessageId?: number): Promise<void> {
  const activeModel = getEffectiveAiModel(chatId);
  const markup = await buildModelsKeyboard(activeModel);
  const text = [
    '🤖 <b>Escolha o modelo de IA para conversar no Telegram:</b>',
    `Modelo ativo: <code>${escapeHtml(activeModel)}</code>`,
  ].join('\n');

  if (editMessageId) {
    const edited = await editTelegramMessageText(chatId, editMessageId, text, {
      parseMode: 'HTML',
      replyMarkup: markup,
    });
    if (edited.ok) return;
  }
  await sendTelegramMessage(text, {
    chatId,
    parseMode: 'HTML',
    replyMarkup: markup,
  });
}

async function sendAiIntro(chatId: string, editMessageId?: number): Promise<void> {
  const st = getState(chatId);
  st.mode = 'ai';
  persistState();
  const activeModel = getEffectiveAiModel(chatId);
  const text = [
    '💬 <b>Modo IA ativado</b>',
    `Modelo: <code>${escapeHtml(activeModel)}</code>`,
    '',
    'Envie sua pergunta aqui no chat ou use os botões abaixo:',
  ].join('\n');
  const markup = aiModeKeyboard();
  if (editMessageId) {
    const edited = await editTelegramMessageText(chatId, editMessageId, text, {
      parseMode: 'HTML',
      replyMarkup: markup,
    });
    if (edited.ok) return;
  }
  await sendTelegramMessage(text, {
    chatId,
    parseMode: 'HTML',
    replyMarkup: markup,
  });
}

async function sendOrEditReport(
  chatId: string,
  actionKey: string,
  builder: () => Promise<string>,
  editMessageId?: number
): Promise<boolean> {
  const st = getState(chatId);
  st.mode = 'menu';
  persistState();
  const text = await builder();
  const markup = reportFooterKeyboard(actionKey);
  if (editMessageId) {
    const edited = await editTelegramMessageText(chatId, editMessageId, text, {
      parseMode: 'HTML',
      replyMarkup: markup,
    });
    if (edited.ok) return true;
    if (/message is not modified/i.test(edited.error || '')) return false;
  }
  await sendTelegramMessage(text, {
    chatId,
    parseMode: 'HTML',
    replyMarkup: markup,
  });
  return true;
}


async function performYouTubePlay(requestText: string): Promise<{ ok: boolean; message: string; finalUrl?: string; title?: string }> {
  const qMatch = requestText.match(/(?:m[uú]sica|video|v[ií]deo|toca|tocar|coloca|p[õo]e|abre)\s+(?:do\s+|da\s+|de\s+)?(.+)/i);
  let query = qMatch ? qMatch[1] : requestText;
  query = query.replace(/\b(no youtube|youtube|manda|uma foto|print|screenshot|abre|abrir|toca|tocar|coloca|p[õo]e)\b/gi, ' ')
               .replace(/\s+/g, ' ').trim();
  if (/sal\b.*matu[eê]/i.test(requestText)) query = 'Sal Matuê';
  if (!query) query = requestText.trim().slice(0, 80);

  try {
    const st = getBrowserState();
    if (!st || (st.status !== 'running' && st.status !== 'paused')) {
      await startBrowser();
    }
    const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    await navigateBrowser(searchUrl);
    await browserWait(3000);

    const clicked = await browserEval(`() => {
      const isVisible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
      const selectors = [
        'ytd-video-renderer a#video-title',
        'ytd-video-renderer a#thumbnail',
        'a#video-title.yt-simple-endpoint',
        'ytd-rich-item-renderer a#thumbnail',
        'ytd-playlist-renderer a#video-title'
      ];
      for (const sel of selectors) {
        const el = Array.from(document.querySelectorAll(sel)).find(isVisible);
        if (el) { el.scrollIntoView({block:'center'}); el.click(); return sel; }
      }
      const a = Array.from(document.querySelectorAll('a[href*="/watch"]')).find(isVisible);
      if (a) { a.click(); return 'a[href*=/watch]'; }
      return null;
    }`);
    if (!clicked) {
      const info = await browserGetInfo().catch(()=>({url:'',title:''}));
      return { ok:false, message:`Não encontrei resultado clicável para "${query}" no YouTube.`, finalUrl: info.url, title: info.title };
    }
    await browserWait(4500);
    await browserEval(`() => {
      const clickText = (re) => {
        const nodes = Array.from(document.querySelectorAll('button, tp-yt-paper-button, yt-button-shape button, [role="button"]'));
        const el = nodes.find(b => re.test((b.textContent||'').trim()));
        if (el) { el.click(); return true; }
        return false;
      };
      clickText(/accept|aceitar|agree|concordo|i agree/i);
      const play = document.querySelector('button.ytp-play-button');
      if (play) { const label = (play.getAttribute('aria-label')||'').toLowerCase(); if (label.includes('play') || label.includes('reproduzir')) play.click(); }
      const video = document.querySelector('video');
      if (video && video.paused) { video.muted = true; video.play().catch(()=>{}); }
      return true;
    }`).catch(()=>{});
    await browserWait(1500);
    const info = await browserGetInfo().catch(()=>({url:'',title:''}));
    return { ok:true, message:`Abri o YouTube e tentei tocar "${query}".`, finalUrl: info.url, title: info.title };
  } catch (e:any) {
    return { ok:false, message:`Falha ao controlar navegador: ${e?.message || e}` };
  }
}
async function handleAiMessage(chatId: string, text: string): Promise<void> {
  const model = getEffectiveAiModel(chatId);
  const st = getState(chatId);
  st.mode = 'ai';
  const screenshotRequested = wantsScreenshot(text);
  const browserActionRequested = /\b(abrir|abre|toca|tocar|coloca|p[õo]e|pesquisa|buscar|navega|navegar|entra no|acessa|vai no|clique|clicar)\b/i.test(text)
    && /\b(youtube|site|p[áa]gina|google|navegador|browser|link|http|www\.|m[uú]sica|video|v[ií]deo)\b/i.test(text);
  const browserScreenshotRequested = screenshotRequested && !/\b(status|servi[cç]os?|seguran[cç]a|processos|rede|disco|docker|logs?)\b/i.test(text);
  let placeholderMsgId: number | undefined;

  try {
    if (browserActionRequested) {
      await sendTelegramMessage('🌐 Executando ação no navegador remoto...', { chatId });
      const action = await performYouTubePlay(text);
      const shot = await trySendBrowserScreenshot(chatId, (action.ok ? '✅ ' : '⚠️ ') + action.message + (action.finalUrl ? `\n${action.finalUrl}` : ''), undefined, text);
      if (!shot.ok) {
        await sendTelegramMessage((action.ok ? action.message : action.message) + `\n\n📷 ${shot.message || 'Sem captura.'}`, { chatId });
      } else if (!action.ok) {
        await sendTelegramMessage(action.message, { chatId });
      }
      return;
    }

    if (browserScreenshotRequested) {
      const shot = await trySendBrowserScreenshot(chatId, undefined, undefined, text);
      if (!shot.ok) {
        await sendTelegramMessage(`📷 ${shot.message || 'Não consegui capturar a tela.'}`, { chatId });
      }
      return;
    }

    const pending = await sendTelegramMessage(`⏳ Consultando IA (<code>${escapeHtml(model)}</code>)...`, {
      chatId,
      parseMode: 'HTML',
    });
    placeholderMsgId = pending?.data?.message_id;

    let res = await askOpencodeAgent(st.opencodeSessionId || '', text, model, 'telegram');
    let reply = res?.reply?.content || 'Sem resposta.';
    const failed = /\[Opencode\]\s*Não foi possível obter resposta|temporariamente indisponível/i.test(reply);
    if (failed && model.startsWith('google/')) {
      const fallback = 'opencode/big-pickle';
      try {
        const res2 = await askOpencodeAgent(st.opencodeSessionId || res?.session?.id || '', text, fallback, 'telegram');
        if (res2?.reply?.content && !/\[Opencode\]\s*Não foi possível obter resposta/i.test(res2.reply.content)) {
          res = res2;
          reply = res2.reply.content + `\n\n(fallback automático: ${fallback} pois ${model} estava indisponível)`;
        }
      } catch {}
    }
    if (res?.session?.id) {
      st.opencodeSessionId = res.session.id;
    }
    persistState();

    const wantsByReply = /\[+SCREENSHOT(?:\s*\|\s*CAPTURA)?\]+/i.test(reply) || /\[+CAPTURA\]+/i.test(reply);
    reply = stripScreenshotMarker(reply);

    const footerMarkup = aiModeKeyboard();

    if (screenshotRequested || wantsByReply) {
      const captionBase =
        reply && reply.length <= 900 ? reply : reply ? reply.slice(0, 900) + '…' : undefined;
      const shot = await trySendBrowserScreenshot(chatId, captionBase, footerMarkup);
      if (shot.ok) {
        if (placeholderMsgId) {
          await deleteTelegramMessage(chatId, placeholderMsgId);
        }
        if (reply.length > 900) {
          await sendTelegramMessage(reply.slice(0, 3500) + (reply.length > 3500 ? '\n...[resposta truncada]' : ''), {
            chatId,
            replyMarkup: footerMarkup,
          });
        }
        return;
      } else if (screenshotRequested) {
        const extra = shot.message ? `\n\n📷 ${shot.message}` : '';
        reply = (reply || 'Aqui está o que posso informar.') + extra;
      }
    }

    const finalText = (reply || 'Sem resposta.').slice(0, 3900) + (reply.length > 3900 ? '\n...[resposta truncada]' : '');
    if (placeholderMsgId) {
      const edited = await editTelegramMessageText(chatId, placeholderMsgId, finalText, {
        replyMarkup: footerMarkup,
      });
      if (edited.ok) return;
    }
    await sendTelegramMessage(finalText, {
      chatId,
      replyMarkup: footerMarkup,
    });
  } catch (e: any) {
    const errText = `❌ Erro ao falar com IA: ${e?.message || e}`;
    if (placeholderMsgId) {
      const edited = await editTelegramMessageText(chatId, placeholderMsgId, errText, {
        replyMarkup: aiModeKeyboard(),
      });
      if (edited.ok) return;
    }
    await sendTelegramMessage(errText, {
      chatId,
      replyMarkup: aiModeKeyboard(),
    });
  }
}

async function handleAction(
  chatId: string,
  action: string,
  editMessageId?: number
): Promise<{ toast?: string }> {
  const st = getState(chatId);

  if (action === 'act:menu') {
    await sendMainMenu(chatId, undefined, editMessageId);
    return {};
  }
  if (action === 'act:ia') {
    await sendAiIntro(chatId, editMessageId);
    return {};
  }
  if (action === 'act:models') {
    await sendModelPicker(chatId, editMessageId);
    return {};
  }
  if (action === 'ai:new') {
    st.opencodeSessionId = undefined;
    st.mode = 'ai';
    persistState();
    await sendAiIntro(chatId, editMessageId);
    return { toast: 'Nova conversa iniciada!' };
  }
  if (action.startsWith('mod:')) {
    const idx = Number(action.slice(4));
    const chosen = Number.isInteger(idx) ? cachedModelChoices[idx] : undefined;
    if (!chosen) {
      await sendModelPicker(chatId, editMessageId);
      return { toast: 'Lista atualizada, toque novamente no modelo.' };
    }
    st.aiModel = chosen;
    st.mode = 'ai';
    persistState();
    const text = [
      `✅ <b>Modelo selecionado:</b> <code>${escapeHtml(chosen)}</code>`,
      '💬 Modo IA ativado! Envie sua pergunta aqui no chat.',
    ].join('\n');
    if (editMessageId) {
      const edited = await editTelegramMessageText(chatId, editMessageId, text, {
        parseMode: 'HTML',
        replyMarkup: aiModeKeyboard(),
      });
      if (edited.ok) return { toast: `Modelo: ${chosen}` };
    }
    await sendTelegramMessage(text, {
      chatId,
      parseMode: 'HTML',
      replyMarkup: aiModeKeyboard(),
    });
    return { toast: `Modelo: ${chosen}` };
  }

  if (action === 'act:status') {
    const updated = await sendOrEditReport(chatId, 'act:status', buildStatusText, editMessageId);
    return updated ? {} : { toast: 'Status já está atualizado.' };
  }
  if (action === 'act:servicos') {
    const updated = await sendOrEditReport(chatId, 'act:servicos', buildServicesText, editMessageId);
    return updated ? {} : { toast: 'Serviços já estão atualizados.' };
  }
  if (action === 'act:seguranca') {
    const updated = await sendOrEditReport(chatId, 'act:seguranca', buildSecurityText, editMessageId);
    return updated ? {} : { toast: 'Segurança já está atualizada.' };
  }
  if (action === 'act:processos') {
    const updated = await sendOrEditReport(chatId, 'act:processos', buildProcessesText, editMessageId);
    return updated ? {} : { toast: 'Processos já estão atualizados.' };
  }
  if (action === 'act:rede') {
    const updated = await sendOrEditReport(chatId, 'act:rede', buildNetworkText, editMessageId);
    return updated ? {} : { toast: 'Rede já está atualizada.' };
  }
  if (action === 'act:disco') {
    const updated = await sendOrEditReport(chatId, 'act:disco', buildDiskText, editMessageId);
    return updated ? {} : { toast: 'Disco e RAM já estão atualizados.' };
  }
  if (action === 'act:docker') {
    const updated = await sendOrEditReport(chatId, 'act:docker', buildDockerText, editMessageId);
    return updated ? {} : { toast: 'Docker já está atualizado.' };
  }
  if (action === 'act:acesso') {
    const updated = await sendOrEditReport(chatId, 'act:acesso', buildAccessText, editMessageId);
    return updated ? {} : { toast: 'Links de acesso já estão atualizados.' };
  }
  if (action === 'act:ping') {
    await sendNetToolPrompt(chatId, 'ping', editMessageId);
    return {};
  }
  if (action === 'act:trace') {
    await sendNetToolPrompt(chatId, 'trace', editMessageId);
    return {};
  }
  if (action.startsWith('net:custom:')) {
    const tool = action.split(':')[2] as NetTool;
    if (tool === 'ping' || tool === 'trace') {
      st.pendingNetTool = tool;
      st.mode = 'menu';
      persistState();
      const txt = tool === 'ping'
        ? '✍️ <b>Ping</b>\nEnvie o IP ou hostname que deseja testar. Ex: <code>8.8.8.8</code>, <code>192.168.100.1</code>, <code>google.com</code>'
        : '✍️ <b>Traceroute</b>\nEnvie o IP ou hostname para rastrear a rota. Ex: <code>1.1.1.1</code>, <code>192.168.100.1</code>, <code>google.com</code>';
      if (editMessageId) {
        const edited = await editTelegramMessageText(chatId, editMessageId, txt, { parseMode: 'HTML', replyMarkup: netToolKeyboard(tool) });
        if (edited.ok) return { toast: 'Digite o IP/host no chat' };
      }
      await sendTelegramMessage(txt, { chatId, parseMode: 'HTML', replyMarkup: netToolKeyboard(tool) });
      return { toast: 'Digite o IP/host no chat' };
    }
  }
  if (action.startsWith('net:ping:') || action.startsWith('net:trace:')) {
    const tool: NetTool = action.startsWith('net:ping:') ? 'ping' : 'trace';
    const host = action.slice(tool === 'ping' ? 'net:ping:'.length : 'net:trace:'.length).trim();
    st.pendingNetTool = undefined;
    persistState();
    if (tool === 'ping') await runTelegramPing(chatId, host, editMessageId);
    else await runTelegramTrace(chatId, host, editMessageId);
    return {};
  }

  if (action === 'act:print') {
    const markup: InlineKeyboardMarkup = { inline_keyboard: [[{ text: '📸 Nova Captura', callback_data: 'act:print' }, { text: '⬅️ Voltar ao Menu', callback_data: 'act:menu' }]] };
    const shot = await trySendBrowserScreenshot(chatId, undefined, markup);
    if (!shot.ok) await sendTelegramMessage(`📷 ${escapeHtml(shot.message || 'Navegador remoto indisponível.')}`, { chatId, parseMode: 'HTML', replyMarkup: reportFooterKeyboard('act:print') });
    return {};
  }
  if (action === 'act:camera' || action.startsWith('cam:snap:')) {
    const camId = action.startsWith('cam:snap:') ? action.slice('cam:snap:'.length) : undefined;
    await handleCameraSnapshot(chatId, camId, editMessageId);
    return {};
  }

  await sendMainMenu(chatId);
  return {};
}

async function handleCommand(chatId: string, raw: string): Promise<void> {
  const text = (raw || '').trim();
  const lower = text.toLowerCase();
  const st = getState(chatId);

  // Global commands that always work regardless of mode
  if (['/start', '/menu', 'menu', '0', '/ajuda', 'ajuda', 'voltar', '/voltar', 'sair', '/sair', 'exit'].includes(lower)) {
    await sendMainMenu(chatId);
    return;
  }
  if (lower === '/modelo' || lower === '/modelos' || lower === 'modelos') {
    await sendModelPicker(chatId);
    return;
  }
  if (lower === '/ping' || lower === 'ping') { await sendNetToolPrompt(chatId, 'ping'); return; }
  if (lower.startsWith('/ping ')) { const h=text.split(/\s+/)[1]; if(h&&isValidHostInput(h)) return runTelegramPing(chatId,h); }
  if (lower === '/trace' || lower === '/traceroute' || lower === 'traceroute' || lower === 'trace') { await sendNetToolPrompt(chatId, 'trace'); return; }
  if (lower.startsWith('/trace ') || lower.startsWith('/traceroute ')) { const h=text.split(/\s+/)[1]; if(h&&isValidHostInput(h)) return runTelegramTrace(chatId,h); }

  if (st.mode === 'ai') {
    if (
      ['/status', '/servicos', '/seguranca', '/processos', '/rede', '/disco', '/docker', '/acesso', '/print'].includes(
        lower
      )
    ) {
      st.mode = 'menu';
      persistState();
      return handleCommand(chatId, text);
    }
    await handleAiMessage(chatId, text);
    return;
  }

  // Menu shortcuts
  if (lower === '1' || lower === '/ia' || lower === 'ia' || lower.startsWith('/ia ') || /^1[\s,.:;!?]+/i.test(text)) {
    st.mode = 'ai';
    persistState();
    const rest = text.replace(/^\/ia\s*/i, '').replace(/^1[\s,.:;!?]+/i, '').trim();
    if (!rest) {
      await sendAiIntro(chatId);
    } else {
      await handleAiMessage(chatId, rest);
    }
    return;
  }
  if (lower === '2' || lower === '/status' || lower === 'status') {
    await handleAction(chatId, 'act:status');
    return;
  }
  if (lower === '3' || lower === '/servicos' || lower === 'servicos' || lower === 'serviços') {
    await handleAction(chatId, 'act:servicos');
    return;
  }
  if (lower === '4' || lower === '/seguranca' || lower === 'seguranca' || lower === 'segurança') {
    await handleAction(chatId, 'act:seguranca');
    return;
  }
  if (lower === '5' || lower === '/processos' || lower === 'processos') {
    await handleAction(chatId, 'act:processos');
    return;
  }
  if (lower === '6' || lower === '/rede' || lower === 'rede') {
    await handleAction(chatId, 'act:rede');
    return;
  }
  if (lower === '7' || lower === '/disco' || lower === 'disco') {
    await handleAction(chatId, 'act:disco');
    return;
  }
  if (lower === '8' || lower === '/docker' || lower === 'docker') {
    await handleAction(chatId, 'act:docker');
    return;
  }
  if (
    lower === '9' ||
    lower === '/acesso' ||
    lower === 'acesso' ||
    lower === '/links' ||
    lower === 'links' ||
    lower === '/ssh' ||
    lower === 'ssh'
  ) {
    await handleAction(chatId, 'act:acesso');
    return;
  }
  if (lower === '/print' || lower === 'print') {
    await handleAction(chatId, 'act:print');
    return;
  }
  if (lower === '/camera' || lower === 'camera' || lower === 'câmera' || lower === 'foto camera' || lower === 'foto câmera') {
    await handleAction(chatId, 'act:camera');
    return;
  }

  // Intenções rápidas no modo menu (evita ecoar mensagem sem ação)
  if (/\b(desliga|desligar|encerra|encerrar|parar|fechar)\b.*\b(navegador|browser|chromium)\b/i.test(text)) {
    const r = await (await import('./browserSession.js')).forceStopBrowser();
    await sendTelegramMessage(`✅ Navegador remoto desligado. Status: <b>${escapeHtml(r.status)}</b>`, {
      chatId, parseMode: 'HTML', replyMarkup: reportFooterKeyboard('act:print')
    });
    return;
  }
  if (wantsScreenshot(text)) {
    const shot = await trySendBrowserScreenshot(chatId, undefined, reportFooterKeyboard('act:print'), text);
    if (!shot.ok) {
      await sendTelegramMessage(`📷 ${escapeHtml(shot.message || 'Não consegui capturar a tela.')}`, {
        chatId, parseMode: 'HTML', replyMarkup: reportFooterKeyboard('act:print')
      });
    }
    return;
  }

  // Se usuário escolheu digitar IP/host para ping/trace
  if (st.pendingNetTool) {
    const host = text.trim().split(/\s+/)[0];
    const tool = st.pendingNetTool;
    st.pendingNetTool = undefined;
    persistState();
    if (!isValidHostInput(host)) {
      await sendTelegramMessage('❌ IP/host inválido. Use apenas letras, números, ponto, hífen, dois-pontos. Ex: <code>8.8.8.8</code> ou <code>google.com</code>', { chatId, parseMode: 'HTML', replyMarkup: netToolKeyboard(tool) });
      return;
    }
    if (tool === 'ping') await runTelegramPing(chatId, host);
    else await runTelegramTrace(chatId, host);
    return;
  }

  // Unrecognized text in menu mode -> present clean inline button panel echoing the message
  await sendMainMenu(chatId, text);
}

async function authorizeAndBindChat(chat: any): Promise<string | null> {
  if (!chat?.id) return null;
  const chatId = String(chat.id);
  detectedChats.set(chatId, {
    id: chatId,
    type: chat.type,
    title: chat.title,
    username: chat.username,
    first_name: chat.first_name,
    last_name: chat.last_name,
  });

  try {
    const cfg = getServerConfig() as any;
    const t = cfg.telegram || {};
    if (!t.chatId) {
      saveServerConfig({ telegram: { ...t, chatId, enabled: true } });
      await sendTelegramMessage(`✅ Chat vinculado ao Server Panel (chatId ${chatId}).`, { chatId });
    } else if (String(t.chatId) !== chatId) {
      return null;
    }
    return chatId;
  } catch {
    return null;
  }
}

async function processUpdate(update: any) {
  const cb = update?.callback_query;
  if (cb) {
    const chat = cb.message?.chat;
    const chatId = await authorizeAndBindChat(chat);
    if (!chatId) {
      await answerTelegramCallbackQuery(cb.id, { text: 'Chat não autorizado.' });
      return;
    }
    const data = typeof cb.data === 'string' ? cb.data : '';
    const messageId = typeof cb.message?.message_id === 'number' ? cb.message.message_id : undefined;
    const isSlowAction =
      data === 'act:models' || data === 'act:print' || data === 'act:docker' || data === 'act:seguranca';
    if (isSlowAction) {
      await answerTelegramCallbackQuery(cb.id);
      await handleAction(chatId, data, messageId);
      return;
    }
    let toast: string | undefined;
    try {
      const res = await handleAction(chatId, data, messageId);
      toast = res.toast;
    } finally {
      await answerTelegramCallbackQuery(cb.id, toast ? { text: toast } : undefined);
    }
    return;
  }

  const msg = update?.message || update?.edited_message;
  if (!msg) return;
  const chatId = await authorizeAndBindChat(msg.chat);
  if (!chatId) return;

  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) return;

  await handleCommand(chatId, text);
}

async function pollOnce(): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled || !cfg.botToken) return;
  const url = `https://api.telegram.org/bot${cfg.botToken}/getUpdates`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offset,
        timeout: 20,
        allowed_updates: ['message', 'callback_query'],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) return;
    const updates = Array.isArray(data.result) ? data.result : [];
    for (const u of updates) {
      try {
        await processUpdate(u);
      } catch (e) {
        console.warn('[telegramBot] update error', e);
      }
      if (typeof u.update_id === 'number') {
        offset = u.update_id + 1;
        persistState();
      }
    }
  } catch {}
}

export function startTelegramBotPolling() {
  if (loopStarted) return;
  loopStarted = true;
  (async () => {
    while (true) {
      try {
        if (!polling) {
          polling = true;
          await pollOnce();
          polling = false;
        }
      } catch {
        polling = false;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  })();
}

export function getDetectedTelegramChats() {
  return Array.from(detectedChats.values());
}

export async function getTelegramBotStatus() {
  const c = getTelegramConfig();
  const me = await testTelegramConnection();
  return {
    enabled: c.enabled,
    hasToken: !!c.botToken,
    chatId: c.chatId,
    bot: me.ok ? me.bot : null,
    ok: me.ok,
    error: me.error,
  };
}
