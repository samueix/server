import { getServerConfig } from './credentialsManager.js';

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnLoginFailure: boolean;
  notifyOnLoginSuccess: boolean;
  notifyOnBlockIp: boolean;
}

export interface TelegramResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  data?: any;
}

export function getTelegramConfig(): TelegramConfig {
  const cfg = getServerConfig() as any;
  const t = cfg.telegram || {};
  return {
    enabled: t.enabled === true,
    botToken: String(t.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: String(t.chatId || process.env.TELEGRAM_CHAT_ID || '').trim(),
    notifyOnLoginFailure: t.notifyOnLoginFailure !== false,
    notifyOnLoginSuccess: t.notifyOnLoginSuccess === true,
    notifyOnBlockIp: t.notifyOnBlockIp !== false,
  };
}

function apiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramApi(method: string, token: string, body?: any): Promise<TelegramResult> {
  if (!token) return { ok: false, skipped: true, error: 'Bot token não configurado.' };
  try {
    const res = await fetch(apiUrl(token, method), {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.description || `HTTP ${res.status}` , data };
    }
    return { ok: true, data: data?.result ?? data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha ao contatar Telegram API.' };
  }
}

export function isTelegramReady(): boolean {
  const c = getTelegramConfig();
  return c.enabled && !!c.botToken && !!c.chatId;
}

export async function sendTelegramMessage(
  text: string,
  opts?: {
    chatId?: string;
    parseMode?: 'HTML' | 'Markdown';
    disableNotification?: boolean;
    replyMarkup?: InlineKeyboardMarkup;
  }
): Promise<TelegramResult> {
  const c = getTelegramConfig();
  if (!c.enabled) return { ok: false, skipped: true, error: 'Telegram desabilitado.' };
  if (!c.botToken) return { ok: false, skipped: true, error: 'Bot token não configurado.' };
  const chatId = (opts?.chatId || c.chatId || '').trim();
  if (!chatId) return { ok: false, skipped: true, error: 'Chat ID não configurado.' };

  const chunks: string[] = [];
  const max = 4000;
  for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
  let last: TelegramResult = { ok: true };
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const isLast = idx === chunks.length - 1;
    const payload: any = {
      chat_id: chatId,
      text: chunk,
      ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
      ...(opts?.disableNotification ? { disable_notification: true } : {}),
      ...(isLast && opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
    };
    last = await telegramApi('sendMessage', c.botToken, payload);
    if (!last.ok && opts?.parseMode && /parse entities/i.test(last.error || '')) {
      delete payload.parse_mode;
      last = await telegramApi('sendMessage', c.botToken, payload);
    }
    if (!last.ok) return last;
  }
  return last;
}

export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string,
  opts?: {
    parseMode?: 'HTML' | 'Markdown';
    replyMarkup?: InlineKeyboardMarkup;
  }
): Promise<TelegramResult> {
  const c = getTelegramConfig();
  if (!c.enabled || !c.botToken) return { ok: false, skipped: true, error: 'Telegram indisponível.' };
  const trimmed = text.slice(0, 4000);
  const payload: any = {
    chat_id: chatId,
    message_id: messageId,
    text: trimmed,
    ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
    ...(opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  };
  let res = await telegramApi('editMessageText', c.botToken, payload);
  if (!res.ok && opts?.parseMode && /parse entities/i.test(res.error || '')) {
    delete payload.parse_mode;
    res = await telegramApi('editMessageText', c.botToken, payload);
  }
  return res;
}

export async function deleteTelegramMessage(chatId: string, messageId: number): Promise<TelegramResult> {
  const c = getTelegramConfig();
  if (!c.enabled || !c.botToken) return { ok: false, skipped: true, error: 'Telegram indisponível.' };
  return telegramApi('deleteMessage', c.botToken, { chat_id: chatId, message_id: messageId });
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  opts?: { text?: string; showAlert?: boolean }
): Promise<TelegramResult> {
  const c = getTelegramConfig();
  if (!c.botToken) return { ok: false, skipped: true, error: 'Bot token não configurado.' };
  return telegramApi('answerCallbackQuery', c.botToken, {
    callback_query_id: callbackQueryId,
    ...(opts?.text ? { text: opts.text.slice(0, 190) } : {}),
    ...(opts?.showAlert ? { show_alert: true } : {}),
  });
}

export async function testTelegramConnection(): Promise<TelegramResult & { bot?: any }> {
  const c = getTelegramConfig();
  if (!c.botToken) return { ok: false, skipped: true, error: 'Bot token não configurado.' };
  const res = await telegramApi('getMe', c.botToken);
  if (!res.ok) return res;
  return { ok: true, bot: res.data };
}

export async function getTelegramUpdates(limit = 20): Promise<TelegramResult & { chats?: any[] }> {
  const c = getTelegramConfig();
  if (!c.botToken) return { ok: false, skipped: true, error: 'Bot token não configurado.' };
  const res = await telegramApi('getUpdates', c.botToken, { limit, timeout: 0 });
  if (!res.ok) return res;
  const updates = Array.isArray(res.data) ? res.data : [];
  const chatMap = new Map<string, any>();
  for (const u of updates) {
    const msg = u?.message || u?.edited_message || u?.channel_post || u?.my_chat_member?.chat && { chat: u.my_chat_member.chat } || null;
    const chat = msg?.chat || u?.callback_query?.message?.chat;
    if (chat?.id != null) {
      const id = String(chat.id);
      if (!chatMap.has(id)) {
        chatMap.set(id, {
          id,
          type: chat.type,
          title: chat.title,
          username: chat.username,
          first_name: chat.first_name,
          last_name: chat.last_name,
        });
      }
    }
  }
  return { ok: true, chats: Array.from(chatMap.values()), data: updates };
}

export async function sendTelegramTestMessage(): Promise<TelegramResult & { bot?: any }> {
  const me = await testTelegramConnection();
  if (!me.ok) return me;
  const c = getTelegramConfig();
  if (!c.chatId) {
    return { ok: false, error: 'Bot conectado, mas chatId não configurado. Envie uma mensagem ao bot e use "Detectar chat".', bot: me.bot };
  }
  const host = process.env.HOSTNAME || 'samuelserver';
  const text = `✅ Teste do Server Panel\nHost: ${host}\nHorário: ${new Date().toLocaleString('pt-BR')}\nBot: @${me.bot?.username || 'ok'}`;
  const sent = await sendTelegramMessage(text);
  return { ...sent, bot: me.bot };
}

function nowBR(): string {
  return new Date().toLocaleString('pt-BR');
}

export async function notifyTelegramLoginFailure(ip: string, attemptedUser: string): Promise<void> {
  try {
    const c = getTelegramConfig();
    if (!c.enabled || !c.notifyOnLoginFailure || !isTelegramReady()) return;
    const text = `⚠️ Falha de login no Server Panel\nUsuário tentado: ${attemptedUser}\nIP: ${ip}\nHorário: ${nowBR()}`;
    await sendTelegramMessage(text);
  } catch {}
}

export async function notifyTelegramLoginSuccess(user: string, role: string, ip: string): Promise<void> {
  try {
    const c = getTelegramConfig();
    if (!c.enabled || !c.notifyOnLoginSuccess || !isTelegramReady()) return;
    const text = `🔐 Login bem-sucedido no Server Panel\nUsuário: ${user} (${role})\nIP: ${ip}\nHorário: ${nowBR()}`;
    await sendTelegramMessage(text);
  } catch {}
}

export async function notifyTelegramIpBlock(ip: string, action: 'block' | 'unblock', message?: string): Promise<void> {
  try {
    const c = getTelegramConfig();
    if (!c.enabled || !c.notifyOnBlockIp || !isTelegramReady()) return;
    const verb = action === 'block' ? '🚫 IP bloqueado no UFW' : '✅ IP desbloqueado no UFW';
    const text = `${verb}\nIP: ${ip}\nHorário: ${nowBR()}${message ? `\nDetalhe: ${message}` : ''}`;
    await sendTelegramMessage(text);
  } catch {}
}


export async function sendTelegramPhoto(
  photo: Buffer | Uint8Array,
  caption?: string,
  opts?: { chatId?: string; parseMode?: 'HTML' | 'Markdown'; replyMarkup?: InlineKeyboardMarkup }
): Promise<TelegramResult> {
  const c = getTelegramConfig();
  if (!c.enabled) return { ok: false, skipped: true, error: 'Telegram desabilitado.' };
  if (!c.botToken) return { ok: false, skipped: true, error: 'Bot token não configurado.' };
  const chatId = (opts?.chatId || c.chatId || '').trim();
  if (!chatId) return { ok: false, skipped: true, error: 'Chat ID não configurado.' };

  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    const bytes = new Uint8Array(photo.length);
    bytes.set(photo);
    form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'screenshot.jpg');
    if (caption) form.append('caption', caption.slice(0, 1024));
    if (opts?.parseMode) form.append('parse_mode', opts.parseMode);
    if (opts?.replyMarkup) form.append('reply_markup', JSON.stringify(opts.replyMarkup));

    const res = await fetch(apiUrl(c.botToken, 'sendPhoto'), {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.description || `HTTP ${res.status}`, data };
    }
    return { ok: true, data: data?.result ?? data };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha ao enviar foto no Telegram.' };
  }
}
