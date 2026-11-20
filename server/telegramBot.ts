import fs from 'fs';
import path from 'path';
import { getServerConfig, saveServerConfig } from './credentialsManager.js';
import { sendTelegramMessage, testTelegramConnection, getTelegramConfig } from './telegramNotifier.js';
import { askOpencodeAgent } from './opencode.js';
import { getFullSystemSnapshot, getProcessesList } from './systemMonitor.js';
import { getAllMonitoredServices } from './servicesMonitor.js';
import { getSecurityAttackStatus } from './securityMonitor.js';

type BotMode = 'menu' | 'ai';

interface ChatState {
  mode: BotMode;
  opencodeSessionId?: string;
}

interface BotPersisted {
  offset: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'telegram_bot.json');

const chatStates = new Map<string, ChatState>();
const detectedChats = new Map<string, any>();
let offset = 0;
let polling = false;
let loopStarted = false;

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data: BotPersisted = JSON.parse(raw);
      if (typeof data.offset === 'number') offset = data.offset;
    }
  } catch {}
}

function persistState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ offset }, null, 2), 'utf-8');
  } catch {}
}

loadState();

function getState(chatId: string): ChatState {
  if (!chatStates.has(chatId)) chatStates.set(chatId, { mode: 'menu' });
  return chatStates.get(chatId)!;
}

function mainMenuText(): string {
  return [
    '🤖 *Server Panel Bot*',
    '',
    'Escolha uma opção (envie o número ou comando):',
    '1. /ia - Falar com IA (Google)',
    '2. /status - Status geral do servidor',
    '3. /servicos - Serviços monitorados',
    '4. /seguranca - Segurança e ataques',
    '5. /processos - Top processos (CPU/RAM)',
    '6. /rede - Rede e interfaces',
    '7. /disco - Disco e memória',
    '8. /docker - Containers Docker',
    '0. /ajuda - Mostrar este menu',
    '',
    'Dica: durante o chat com a IA, envie /menu ou /sair para voltar.'
  ].join('\n');
}

function fmtNum(n: any, digits = 1): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : 'N/D';
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
    return [
      '📊 *Status Geral*',
      `Host: ${s.system?.hostname || s.sistema?.hostname || 'samuelserver'}`,
      `Uptime: ${uptime.uptime_human || uptime.uptime || 'N/D'}`,
      `CPU: ${fmtNum(cpuPct)}% | Load: ${JSON.stringify(cpu.load_average || cpu.load || {})}`,
      `RAM: ${fmtNum(memPct)}% (usada ${fmtNum(mem.used_gb ?? mem.usada_gb)} / ${fmtNum(mem.total_gb ?? mem.total_gb)} GB)`,
      `Disco (/): ${fmtNum(diskPct)}% (usado ${fmtNum(disk.used_gb ?? disk.usado_gb)} / ${fmtNum(disk.total_gb ?? disk.total_gb)} GB)`,
      `Temp: ${JSON.stringify(temp?.temperatura_c ?? temp?.cpu_temp ?? temp?.sensores ?? 'N/D')}`,
      `Rede: ${net.primary_interface || net.primaryInterface || 'N/D'} IP ${net.primary_ip || net.primaryIp || 'N/D'} ↓${net.download_bytes_sec ?? 0} B/s ↑${net.upload_bytes_sec ?? 0} B/s`,
      '',
      'Envie /menu para voltar.'
    ].join('\n');
  } catch (e: any) {
    return `Erro ao obter status: ${e?.message || e}`;
  }
}

async function buildServicesText(): Promise<string> {
  try {
    const svcs = (getAllMonitoredServices() || []) as any[];
    const lines = svcs.slice(0, 40).map(s => {
      const st = s.status || (s.ativo ? 'ONLINE' : 'OFFLINE');
      const icon = st === 'ONLINE' ? '🟢' : st === 'ERRO' ? '🔴' : '⚪';
      return `${icon} ${s.name || s.nome}: ${st}${s.porta ? ` (porta ${s.porta})` : ''}`;
    });
    return ['🧩 *Serviços*', ...lines, '', 'Envie /menu para voltar.'].join('\n');
  } catch (e: any) {
    return `Erro ao obter serviços: ${e?.message || e}`;
  }
}

async function buildSecurityText(): Promise<string> {
  try {
    const sec: any = await getSecurityAttackStatus();
    const lines = [
      '🛡️ *Segurança*',
      `Nível: ${sec.threatLevel || 'N/D'}${sec.isUnderAttack ? ' (SOB ATAQUE)' : ''}`,
      `Falhas 24h: ${sec.totalFailedAttempts24h ?? 0} | Última hora: ${sec.failedAttemptsLastHour ?? 0}`,
      `Scans detectados: ${sec.totalScansDetected ?? 0}`,
      `SSH: ${sec.sshStatus || 'N/D'} | Nginx: ${sec.nginxStatus || 'N/D'}`,
      `Ameaças externas: ${sec.externalThreatsCount ?? 0} | LAN: ${sec.lanAttemptsCount ?? 0}`,
      `IPs bloqueados (UFW): ${(sec.blockedIpsInUfw || []).length}`,
    ];
    const top = (sec.attackSources || []).slice(0, 5);
    if (top.length) {
      lines.push('', 'Top origens:');
      for (const a of top) {
        lines.push(`- ${a.ip} (${a.count}x) ${a.country || ''} ${a.status || ''}`.trim());
      }
    }
    lines.push('', 'Envie /menu para voltar.');
    return lines.join('\n');
  } catch (e: any) {
    return `Erro ao obter segurança: ${e?.message || e}`;
  }
}

async function buildProcessesText(): Promise<string> {
  try {
    const info: any = getProcessesList('cpu', 0);
    const procs = Array.isArray(info?.processes) ? info.processes : [];
    const topCpu = [...procs].sort((a,b)=>(b.cpu_percent||0)-(a.cpu_percent||0)).slice(0,8);
    const topMem = [...procs].sort((a,b)=>(b.memory_percent||b.mem_percent||0)-(a.memory_percent||a.mem_percent||0)).slice(0,8);
    const fmt = (p:any)=>`• PID ${p.pid} ${p.user||p.usuario||''} CPU ${fmtNum(p.cpu_percent||0)}% MEM ${fmtNum(p.memory_percent||p.mem_percent||0)}% ${String(p.comando||p.command||p.name||'').slice(0,40)}`;
    return [
      '⚙️ *Processos*',
      `Total: ${info.count ?? procs.length} (running ${info.running ?? '?'}, sleeping ${info.sleeping ?? '?'})`,
      '',
      '*Top CPU:*',
      ...topCpu.map(fmt),
      '',
      '*Top RAM:*',
      ...topMem.map(fmt),
      '',
      'Envie /menu para voltar.'
    ].join('\n');
  } catch (e: any) {
    return `Erro ao obter processos: ${e?.message || e}`;
  }
}

async function buildNetworkText(): Promise<string> {
  try {
    const s: any = getFullSystemSnapshot();
    const net = s.network || s.rede || {};
    const ifaces = net.interfaces || net.ifaces || [];
    const lines = ['🌐 *Rede*'];
    if (Array.isArray(ifaces) && ifaces.length) {
      for (const i of ifaces.slice(0, 12)) {
        lines.push(`• ${i.name || i.nome}: ${i.state || i.status || ''} ${i.ipv4 || i.ip || ''} ${i.ipv6 ? '(v6)' : ''}`.trim());
      }
    } else {
      lines.push(`Interface: ${net.primary_interface || net.primaryInterface || 'N/D'}`);
      lines.push(`IPv4: ${net.primary_ip || net.primaryIp || 'N/D'}`);
      lines.push(`IPv6: ${net.primary_ipv6 || net.primaryIpv6 || 'N/D'}`);
    }
    lines.push(`RX: ${net.total_received_formatted || net.bytes_recv || 'N/D'} | TX: ${net.total_sent_formatted || net.bytes_sent || 'N/D'}`);
    lines.push('', 'Envie /menu para voltar.');
    return lines.join('\n');
  } catch (e: any) {
    return `Erro ao obter rede: ${e?.message || e}`;
  }
}

async function buildDiskText(): Promise<string> {
  try {
    const s: any = getFullSystemSnapshot();
    const mem = s.memory?.ram || s.memory || s.memoria || {};
    const disk = s.disk?.root || s.disk || s.disco || {};
    return [
      '💾 *Disco & Memória*',
      `RAM: usada ${fmtNum(mem.used_gb ?? mem.usada_gb)} / ${fmtNum(mem.total_gb ?? mem.total_gb)} GB (${fmtNum(mem.usage_percent ?? mem.uso_percentual)}%) | disp ${fmtNum(mem.available_gb ?? mem.disponivel_gb)} GB`,
      `Swap: ${JSON.stringify(mem.swap || s.memory?.swap || 'N/D')}`,
      `Disco /: usado ${fmtNum(disk.used_gb ?? disk.usado_gb)} / ${fmtNum(disk.total_gb ?? disk.total_gb)} GB (${fmtNum(disk.usage_percent ?? disk.uso_percentual)}%) | livre ${fmtNum(disk.free_gb ?? disk.livre_gb)} GB`,
      '',
      'Envie /menu para voltar.'
    ].join('\n');
  } catch (e: any) {
    return `Erro ao obter disco/memória: ${e?.message || e}`;
  }
}

async function buildDockerText(): Promise<string> {
  try {
    const { execFile } = await import('child_process');
    const util = await import('util');
    const pexec = util.promisify(execFile);
    let out = '';
    try {
      const r = await pexec('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.Status}}\t{{.Image}}'], { timeout: 8000 });
      out = (r.stdout || '').trim();
    } catch (e: any) {
      return `Docker indisponível: ${(e?.stderr || e?.message || '').toString().slice(0,300)}`;
    }
    if (!out) return '🐳 *Docker*\nNenhum container encontrado.\n\nEnvie /menu para voltar.';
    const lines = out.split('\n').slice(0, 20).map(l => {
      const [name,status,image] = l.split('\t');
      const icon = /Up/i.test(status||'') ? '🟢' : '⚪';
      return `${icon} ${name}: ${status} (${image||''})`;
    });
    return ['🐳 *Docker*', ...lines, '', 'Envie /menu para voltar.'].join('\n');
  } catch (e: any) {
    return `Erro ao consultar Docker: ${e?.message || e}`;
  }
}

async function handleAiMessage(chatId: string, text: string): Promise<void> {
  const cfg = getServerConfig() as any;
  const t = cfg.telegram || {};
  const model = String(t.aiModel || process.env.TELEGRAM_AI_MODEL || 'google/gemini-3.5-flash').trim();
  const st = getState(chatId);
  try {
    await sendTelegramMessage('⏳ Consultando IA...', { chatId });
    let res = await askOpencodeAgent(st.opencodeSessionId || '', text, model);
    let reply = res?.reply?.content || 'Sem resposta.';
    const failed = /\[Opencode\]\s*Não foi possível obter resposta|temporariamente indisponível/i.test(reply);
    if (failed && model.startsWith('google/')) {
      const fallback = 'opencode/big-pickle';
      try {
        const res2 = await askOpencodeAgent(st.opencodeSessionId || res?.session?.id || '', text, fallback);
        if (res2?.reply?.content && !/\[Opencode\]\s*Não foi possível obter resposta/i.test(res2.reply.content)) {
          res = res2;
          reply = res2.reply.content + `\n\n_(fallback: ${fallback} pois o modelo Google estava indisponível)_`;
        }
      } catch {}
    }
    if (res?.session?.id) st.opencodeSessionId = res.session.id;
    if (reply.length > 3500) reply = reply.slice(0, 3500) + '\n...[resposta truncada]';
    await sendTelegramMessage(reply, { chatId });
  } catch (e: any) {
    await sendTelegramMessage(`Erro ao falar com IA: ${e?.message || e}`, { chatId });
  }
}

async function handleCommand(chatId: string, raw: string): Promise<void> {
  const text = (raw || '').trim();
  const lower = text.toLowerCase();
  const st = getState(chatId);

  const toMenu = async () => { st.mode = 'menu'; await sendTelegramMessage(mainMenuText(), { chatId }); };

  // global exits
  if (['/start', '/menu', 'menu', '0', '/ajuda', 'ajuda', 'voltar', '/voltar', 'sair', '/sair', 'exit'].includes(lower)) {
    return toMenu();
  }

  if (st.mode === 'ai') {
    if (['/status','/servicos','/seguranca','/processos','/rede','/disco','/docker'].includes(lower)) {
      st.mode = 'menu';
      // fallthrough to menu handling below by recursion
      return handleCommand(chatId, text);
    }
    return handleAiMessage(chatId, text);
  }

  // menu mode
  if (lower === '1' || lower === '/ia' || lower === 'ia' || lower.startsWith('/ia ')) {
    st.mode = 'ai';
    await sendTelegramMessage('💬 Modo IA (Google) ativado. Envie sua pergunta.\nUse /menu ou /sair para voltar ao menu.', { chatId });
    const rest = text.replace(/^\/ia\s*/i,'').trim();
    if (rest) await handleAiMessage(chatId, rest);
    return;
  }
  if (lower === '2' || lower === '/status' || lower === 'status') { await sendTelegramMessage(await buildStatusText(), { chatId }); return; }
  if (lower === '3' || lower === '/servicos' || lower === 'servicos' || lower === 'serviços') { await sendTelegramMessage(await buildServicesText(), { chatId }); return; }
  if (lower === '4' || lower === '/seguranca' || lower === 'seguranca' || lower === 'segurança') { await sendTelegramMessage(await buildSecurityText(), { chatId }); return; }
  if (lower === '5' || lower === '/processos' || lower === 'processos') { await sendTelegramMessage(await buildProcessesText(), { chatId }); return; }
  if (lower === '6' || lower === '/rede' || lower === 'rede') { await sendTelegramMessage(await buildNetworkText(), { chatId }); return; }
  if (lower === '7' || lower === '/disco' || lower === 'disco') { await sendTelegramMessage(await buildDiskText(), { chatId }); return; }
  if (lower === '8' || lower === '/docker' || lower === 'docker') { await sendTelegramMessage(await buildDockerText(), { chatId }); return; }

  // default: if in menu and unknown, hint; or treat as AI request? better hint
  await sendTelegramMessage('Não entendi. ' + mainMenuText(), { chatId });
}

async function processUpdate(update: any) {
  const msg = update?.message || update?.edited_message;
  if (!msg) return;
  const chat = msg.chat;
  if (!chat?.id) return;
  const chatId = String(chat.id);
  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) return;

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
    // auto-bind first chat if empty (private or group)
    if (!t.chatId) {
      saveServerConfig({ telegram: { ...t, chatId, enabled: true } });
      await sendTelegramMessage(`✅ Chat vinculado ao Server Panel (chatId ${chatId}).`, { chatId });
    } else if (String(t.chatId) !== chatId) {
      // ignore other chats silently for security
      return;
    }
  } catch {
    return;
  }

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
      body: JSON.stringify({ offset, timeout: 20, allowed_updates: ['message'] }),
      signal: AbortSignal.timeout(30000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) return;
    const updates = Array.isArray(data.result) ? data.result : [];
    for (const u of updates) {
      try { await processUpdate(u); } catch (e) { console.warn('[telegramBot] update error', e); }
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
      } catch { polling = false; }
      await new Promise(r => setTimeout(r, 1500));
    }
  })();
}

export function getDetectedTelegramChats() {
  return Array.from(detectedChats.values());
}

export async function getTelegramBotStatus() {
  const c = getTelegramConfig();
  const me = await testTelegramConnection();
  return { enabled: c.enabled, hasToken: !!c.botToken, chatId: c.chatId, bot: me.ok ? me.bot : null, ok: me.ok, error: me.error };
}
