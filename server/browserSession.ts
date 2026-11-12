import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import dns from 'dns';
import crypto from 'crypto';
import { spawn, execFileSync, type ChildProcess } from 'child_process';
import type { Server as HttpServer } from 'http';
import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from 'playwright-core';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Sessão única de navegador remoto, leve e efêmera.
 *
 * - Chromium é iniciado como processo filho SEM privilégios (usuário samuel).
 * - CDP fica exposto apenas em 127.0.0.1:9222.
 * - Frames são transmitidos por WebSocket (JPEG) direto para o painel.
 * - Histórico fica em memória (ring buffer). Nada de screenshots em disco.
 * - Perfil é apagado ao parar; cache do Chromium limitado a ~60 MB.
 */

const BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  (typeof process.getuid === 'function' && process.getuid() === 0
    ? '/home/samuel/.cache/ms-playwright'
    : path.join(os.homedir(), '.cache', 'ms-playwright'));

process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;

const CDP_PORT = parseInt(process.env.BROWSER_CDP_PORT || '9222', 10);
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const PROFILE_DIR =
  process.env.BROWSER_PROFILE_DIR || path.join(process.cwd(), 'data', 'browser', 'profile');
const VIEWPORT = { width: 1280, height: 720 };
const IDLE_MS = parseInt(process.env.BROWSER_IDLE_MS || String(5 * 60 * 1000), 10);
const MAX_HISTORY = 200;
const ALLOW_PRIVATE = process.env.BROWSER_ALLOW_PRIVATE === 'true';
const NO_SANDBOX = process.env.BROWSER_NO_SANDBOX === 'true';
const TICKET_TTL_MS = 60_000;
const FRAME_MIN_INTERVAL_MS = 120;
const MAX_WS_BUFFER = 1_500_000;

export type BrowserStatus = 'stopped' | 'starting' | 'running' | 'paused' | 'error';

export interface BrowserState {
  status: BrowserStatus;
  url: string;
  title: string;
  startedAt: string | null;
  lastActionAt: string | null;
  viewport: { width: number; height: number };
  clients: number;
  paused: boolean;
  fps: number;
  error: string | null;
}

export interface BrowserHistoryEntry {
  ts: string;
  type: string;
  detail: string;
}

let status: BrowserStatus = 'stopped';
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let activePage: Page | null = null;
let cdp: CDPSession | null = null;
let child: ChildProcess | null = null;
let startedAt: string | null = null;
let lastActionAt: string | null = null;
let lastError: string | null = null;
let currentTitle = '';
let paused = false;
let startingPromise: Promise<BrowserState> | null = null;
let cleaningUp = false;
let screencastStarting = false;
let idleTimer: NodeJS.Timeout | null = null;
let lastFrameSent = 0;
let frameCount = 0;
let fpsWindowStart = Date.now();
let currentFps = 0;
let stderrBuffer = '';
let childExitReason: string | null = null;
let wssAttached = false;

const clients = new Set<WebSocket>();
const history: BrowserHistoryEntry[] = [];
const tickets = new Map<string, number>();
const attachedPages = new WeakSet<Page>();
let cachedRunIds: { uid?: number; gid?: number } | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function getRunIds(): { uid?: number; gid?: number } {
  if (cachedRunIds) return cachedRunIds;
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    try {
      const uid = parseInt(execFileSync('id', ['-u', 'samuel'], { encoding: 'utf8' }).trim(), 10);
      const gid = parseInt(execFileSync('id', ['-g', 'samuel'], { encoding: 'utf8' }).trim(), 10);
      if (Number.isFinite(uid) && Number.isFinite(gid)) {
        cachedRunIds = { uid, gid };
        return cachedRunIds;
      }
    } catch {
      // cai no fallback abaixo
    }
    throw new Error('Usuário "samuel" não encontrado para executar o Chromium sem privilégios.');
  }
  cachedRunIds = {};
  return cachedRunIds;
}

function getExecutablePath(): string {
  try {
    const candidate = chromium.executablePath();
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch {
    // tenta fallback manual
  }
  try {
    const dirs = fs.readdirSync(BROWSERS_PATH).filter((d) => d.startsWith('chromium-'));
    for (const dir of dirs) {
      const candidate = path.join(BROWSERS_PATH, dir, 'chrome-linux64', 'chrome');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // sem cache de navegadores
  }
  throw new Error('Chromium do Playwright não encontrado. Execute o bloco sudo de instalação.');
}

function ensureProfileDir(): void {
  const ids = getRunIds();
  const parent = path.dirname(PROFILE_DIR);
  fs.mkdirSync(parent, { recursive: true, mode: 0o755 });
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  if (typeof ids.uid === 'number' && typeof ids.gid === 'number') {
    try {
      fs.chownSync(parent, ids.uid, ids.gid);
      fs.chownSync(PROFILE_DIR, ids.uid, ids.gid);
    } catch {
      // melhor seguir do que falhar por chown
    }
  }
}

function removeProfile(): void {
  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // perfil será limpo na próxima inicialização
  }
}

function sanitizeError(err: unknown): string {
  const raw = typeof err === 'string' ? err : (err as any)?.message || 'Erro desconhecido';
  const missing = String(raw).match(/error while loading shared libraries:\s*([^:\s]+)/i);
  if (missing) {
    return `Dependência do sistema ausente: ${missing[1]}. Execute o bloco sudo de instalação.`;
  }
  if (/no usable sandbox/i.test(raw)) {
    return 'Sandbox do Chromium indisponível. Execute o bloco sudo para ajustar chrome_sandbox.';
  }
  if (/ECONNREFUSED|connectOverCDP|Timeout|tempo esgotado/i.test(raw)) {
    return 'Não foi possível conectar ao Chromium (CDP). Verifique as dependências e o sandbox.';
  }
  return String(raw).replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 300);
}

function pushHistory(type: string, detail: string): void {
  const entry: BrowserHistoryEntry = {
    ts: new Date().toISOString(),
    type,
    detail: detail.slice(0, 300)
  };
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  lastActionAt = entry.ts;
  resetIdleTimer();
}

function resetIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (status !== 'running' && status !== 'paused') return;
  if (clients.size > 0) return;
  idleTimer = setTimeout(() => {
    void stopBrowser();
  }, IDLE_MS);
}

function broadcastJson(payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(text);
      } catch {
        // cliente caiu
      }
    }
  }
}

function broadcastFrame(frame: Buffer): void {
  if (clients.size === 0) return;
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (ws.bufferedAmount > MAX_WS_BUFFER) continue;
    try {
      ws.send(frame, { binary: true });
    } catch {
      // cliente caiu
    }
  }
}

export function getBrowserState(): BrowserState {
  return {
    status,
    url: activePage && !activePage.isClosed() ? activePage.url() : '',
    title: currentTitle,
    startedAt,
    lastActionAt,
    viewport: { ...VIEWPORT },
    clients: clients.size,
    paused,
    fps: currentFps,
    error: lastError
  };
}

export function getBrowserHistory(): BrowserHistoryEntry[] {
  return history.slice();
}

export function issueWsTicket(): { ticket: string; expiresAt: string } {
  const now = Date.now();
  for (const [key, exp] of tickets) {
    if (exp <= now) tickets.delete(key);
  }
  const ticket = crypto.randomBytes(24).toString('base64url');
  const exp = now + TICKET_TTL_MS;
  tickets.set(ticket, exp);
  return { ticket, expiresAt: new Date(exp).toISOString() };
}

function verifyWsTicket(ticket: string): boolean {
  const exp = tickets.get(ticket);
  if (!exp) return false;
  tickets.delete(ticket);
  return exp > Date.now();
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice(7);
      if (net.isIPv4(v4)) return isPrivateAddress(v4);
    }
  }
  return false;
}

async function assertUrlAllowed(rawUrl: string): Promise<string> {
  let candidate = String(rawUrl || '').trim();
  if (!candidate) throw new Error('Informe uma URL.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('URL inválida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Apenas URLs http:// ou https:// são permitidas.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new Error('URL sem host.');

  if (!ALLOW_PRIVATE) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new Error('Acesso a hosts locais está desabilitado.');
    }
    if (net.isIP(host)) {
      if (isPrivateAddress(host)) {
        throw new Error('Acesso a endereços privados/locais está desabilitado.');
      }
    } else {
      let resolved: dns.LookupAddress[] = [];
      try {
        resolved = await dns.promises.lookup(host, { all: true, verbatim: true });
      } catch {
        throw new Error('Host não encontrado.');
      }
      if (resolved.some((item) => isPrivateAddress(item.address))) {
        throw new Error('O host resolve para um endereço privado/local.');
      }
    }
  }

  return url.toString();
}

async function waitForCdp(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childExitReason) {
      throw new Error(childExitReason);
    }
    if (child && child.exitCode !== null) {
      throw new Error(stderrBuffer || 'Chromium encerrou durante a inicialização.');
    }
    try {
      const response = await fetch(`${CDP_URL}/json/version`, {
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok) return;
    } catch {
      // ainda subindo
    }
    await delay(150);
  }
  throw new Error('Tempo esgotado aguardando o Chromium.');
}

async function stopScreencast(): Promise<void> {
  const session = cdp;
  cdp = null;
  if (!session) return;
  try {
    await session.send('Page.stopScreencast' as any);
  } catch {
    // sessão já encerrada
  }
  try {
    await session.detach();
  } catch {
    // sessão já encerrada
  }
}

async function startScreencast(): Promise<void> {
  if (screencastStarting) return;
  if (!activePage || !context || status !== 'running' || paused) return;
  screencastStarting = true;
  try {
    await stopScreencast();
    const page = activePage;
    const session = await context.newCDPSession(page);
    if (activePage !== page || status !== 'running' || paused) {
      try {
        await session.detach();
      } catch {
        // ignore
      }
      return;
    }
    cdp = session;
    session.on('Page.screencastFrame', (params: any) => {
      if (cdp !== session) return;
      const sessionId = params?.sessionId;
      if (sessionId !== undefined) {
        session.send('Page.screencastFrameAck' as any, { sessionId } as any).catch(() => {});
      }
      const now = Date.now();
      if (now - lastFrameSent < FRAME_MIN_INTERVAL_MS) return;
      lastFrameSent = now;
      try {
        const frame = Buffer.from(String(params?.data || ''), 'base64');
        if (frame.length === 0) return;
        broadcastFrame(frame);
      } catch {
        return;
      }
      frameCount += 1;
      if (now - fpsWindowStart >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        fpsWindowStart = now;
      }
    });
    await session.send('Page.startScreencast' as any, {
      format: 'jpeg',
      quality: 50,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 2
    } as any);
  } finally {
    screencastStarting = false;
  }
}

async function updateState(): Promise<void> {
  if (activePage && !activePage.isClosed()) {
    try {
      currentTitle = await activePage.title();
    } catch {
      currentTitle = '';
    }
  }
  broadcastJson({ type: 'state', state: getBrowserState() });
}

async function setActivePage(page: Page): Promise<void> {
  if (!page || page.isClosed()) return;
  const isNew = activePage !== page;
  activePage = page;
  if (isNew) {
    try {
      await page.setViewportSize(VIEWPORT);
    } catch {
      // viewport padrão do contexto
    }
    if (!attachedPages.has(page)) {
      attachedPages.add(page);
      page.on('load', () => {
        void updateState();
      });
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) void updateState();
      });
      page.on('close', () => {
        if (activePage !== page) return;
        const next = context?.pages().find((candidate) => !candidate.isClosed()) || null;
        if (next) {
          void setActivePage(next);
        } else {
          activePage = null;
          void updateState();
        }
      });
    }
    await updateState();
    if (clients.size > 0 && status === 'running' && !paused) {
      await startScreencast().catch(() => {});
    }
  }
}

async function cleanupAfterExit(): Promise<void> {
  if (cleaningUp) return;
  cleaningUp = true;
  try {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    await stopScreencast();
    try {
      await browser?.close();
    } catch {
      // já encerrado
    }
    browser = null;
    context = null;
    activePage = null;
    currentTitle = '';
    currentFps = 0;
    frameCount = 0;
    lastFrameSent = 0;

    const proc = child;
    child = null;
    if (proc && proc.exitCode === null) {
      try {
        if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
        else proc.kill('SIGTERM');
      } catch {
        try {
          proc.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
      await delay(500);
      if (proc.exitCode === null) {
        try {
          if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
          else proc.kill('SIGKILL');
        } catch {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }
    }

    removeProfile();
    broadcastJson({ type: 'state', state: getBrowserState() });
  } finally {
    cleaningUp = false;
  }
}

export async function startBrowser(): Promise<BrowserState> {
  if (status === 'running' || status === 'paused') return getBrowserState();
  if (startingPromise) return startingPromise;

  startingPromise = (async () => {
    while (cleaningUp) await delay(50);
    if (status === 'error') await cleanupAfterExit();
    status = 'starting';
    lastError = null;
    stderrBuffer = '';
    childExitReason = null;

    ensureProfileDir();
    const executable = getExecutablePath();
    const ids = getRunIds();

    const args = [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${PROFILE_DIR}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--no-default-browser-check',
      '--noerrdialogs',
      '--disable-infobars',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu-compositing',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-default-apps',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--disable-logging',
      '--log-level=3',
      '--disable-notifications',
      '--deny-permission-prompts',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-session-crashed-bubble',
      '--disable-popup-blocking',
      '--mute-audio',
      '--hide-scrollbars',
      '--no-pings',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disk-cache-size=52428800',
      '--media-cache-size=10485760',
      '--renderer-process-limit=2',
      '--js-flags=--max-old-space-size=256',
      '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,InterestFeedContentSuggestions,AutofillServerCommunication,CalculateNativeWinOcclusion,DialMediaRouteProvider,GlobalMediaControls,ChromeWhatsNewUI,ChromeLabs'
    ];
    if (NO_SANDBOX) args.push('--no-sandbox');

    const env: NodeJS.ProcessEnv = { ...process.env, HOME: '/home/samuel' };
    delete env.DISPLAY;
    const develSandbox = process.env.CHROME_DEVEL_SANDBOX || '/usr/local/lib/chromium/chrome-sandbox';
    if (fs.existsSync(develSandbox)) env.CHROME_DEVEL_SANDBOX = develSandbox;

    child = spawn(executable, args, {
      uid: ids.uid,
      gid: ids.gid,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer = (stderrBuffer + chunk.toString('utf8')).slice(-4000);
    });

    child.on('exit', (code, signal) => {
      if (status === 'stopped' || status === 'error' || cleaningUp) return;
      childExitReason = stderrBuffer || `Chromium encerrou (${code ?? signal ?? 'sinal'}).`;
      status = 'error';
      lastError = sanitizeError(childExitReason);
      void cleanupAfterExit();
    });

    child.on('error', (err) => {
      if (status === 'stopped' || cleaningUp) return;
      childExitReason = (err as any)?.message || 'Falha ao executar o Chromium.';
      status = 'error';
      lastError = sanitizeError(childExitReason);
      void cleanupAfterExit();
    });

    await waitForCdp(20000);

    browser = await chromium.connectOverCDP(CDP_URL);
    browser.on('disconnected', () => {
      if (status === 'running' || status === 'paused' || status === 'starting') {
        status = 'error';
        lastError = 'Conexão com o Chromium encerrada.';
        void cleanupAfterExit();
      }
    });

    try {
      const browserSession = await browser.newBrowserCDPSession();
      await browserSession.send('Browser.setDownloadBehavior' as any, { behavior: 'deny' } as any);
    } catch {
      // downloads já são bloqueados pelo contexto quando possível
    }

    const contexts = browser.contexts();
    context = contexts[0] || (await browser.newContext({ viewport: VIEWPORT, acceptDownloads: false }));
    context.on('page', (page) => {
      void setActivePage(page);
    });

    const pages = context.pages();
    const initialPage = pages[0] || (await context.newPage());
    await setActivePage(initialPage);

    status = 'running';
    startedAt = new Date().toISOString();
    lastActionAt = startedAt;
    pushHistory('start', 'Sessão iniciada');
    broadcastJson({ type: 'state', state: getBrowserState() });

    if (clients.size > 0) {
      await startScreencast().catch(() => {});
    }

    return getBrowserState();
  })();

  try {
    return await startingPromise;
  } catch (err) {
    const message = childExitReason || (err as any)?.message || err;
    status = 'error';
    lastError = sanitizeError(message);
    await cleanupAfterExit();
    throw new Error(lastError);
  } finally {
    startingPromise = null;
  }
}

export async function stopBrowser(): Promise<void> {
  if (status === 'stopped' && !child && !browser) return;
  status = 'stopped';
  paused = false;
  lastError = null;
  startedAt = null;
  lastActionAt = null;
  pushHistory('stop', 'Sessão encerrada');
  await cleanupAfterExit();
}

export function pauseBrowser(): BrowserState {
  if (status === 'running') {
    paused = true;
    status = 'paused';
    void stopScreencast();
    pushHistory('pause', 'Stream e controle pausados');
    broadcastJson({ type: 'state', state: getBrowserState() });
  }
  return getBrowserState();
}

export function resumeBrowser(): BrowserState {
  if (status === 'paused') {
    paused = false;
    status = 'running';
    pushHistory('resume', 'Stream e controle retomados');
    broadcastJson({ type: 'state', state: getBrowserState() });
    if (clients.size > 0) void startScreencast().catch(() => {});
  }
  return getBrowserState();
}

export async function navigateBrowser(rawUrl: string): Promise<BrowserState> {
  if (status !== 'running' && status !== 'paused') {
    throw new Error('Navegador não está em execução.');
  }
  if (!activePage || activePage.isClosed()) {
    throw new Error('Página ativa indisponível.');
  }
  const safeUrl = await assertUrlAllowed(rawUrl);
  await activePage.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  pushHistory('navigate', safeUrl);
  await updateState();
  return getBrowserState();
}

export async function takeScreenshot(): Promise<Buffer> {
  if (!activePage || activePage.isClosed()) {
    throw new Error('Página ativa indisponível.');
  }
  const buffer = await activePage.screenshot({
    type: 'jpeg',
    quality: 70,
    fullPage: false,
    animations: 'disabled',
    timeout: 15000
  });
  pushHistory('screenshot', `${Math.round(buffer.length / 1024)} KB`);
  return buffer;
}

function normalizeKey(raw: string): string {
  const key = String(raw || '').slice(0, 20);
  if (!key || key === 'Unidentified' || key === 'Dead' || key === 'Process') return '';
  if (key === ' ') return 'Space';
  if (key === 'Esc') return 'Escape';
  if (key === 'Del') return 'Delete';
  return key;
}

function buildCombo(key: string, msg: any): string {
  const parts: string[] = [];
  if (msg.ctrlKey) parts.push('Control');
  if (msg.altKey) parts.push('Alt');
  if (msg.shiftKey) parts.push('Shift');
  if (msg.metaKey) parts.push('Meta');
  parts.push(key);
  return parts.join('+');
}

async function handleMouse(msg: any): Promise<void> {
  if (!activePage || activePage.isClosed()) return;
  if (status !== 'running' || paused) return;

  const x = clamp01(Number(msg.x)) * VIEWPORT.width;
  const y = clamp01(Number(msg.y)) * VIEWPORT.height;
  const button: 'left' | 'right' | 'middle' =
    msg.button === 'right' || msg.button === 'middle' ? msg.button : 'left';
  const action = String(msg.action || '');

  if (action === 'move') {
    await activePage.mouse.move(x, y);
    return;
  }
  if (action === 'down') {
    await activePage.mouse.move(x, y);
    await activePage.mouse.down({ button });
    pushHistory('mouse', `down ${button} @ ${Math.round(x)},${Math.round(y)}`);
    return;
  }
  if (action === 'up') {
    await activePage.mouse.move(x, y);
    await activePage.mouse.up({ button });
    pushHistory('mouse', `up ${button} @ ${Math.round(x)},${Math.round(y)}`);
    return;
  }
  if (action === 'click') {
    await activePage.mouse.click(x, y, {
      button,
      clickCount: msg.clickCount === 2 ? 2 : 1
    });
    pushHistory('mouse', `click ${button} @ ${Math.round(x)},${Math.round(y)}`);
    return;
  }
  if (action === 'wheel') {
    const deltaY = Math.max(-2000, Math.min(2000, Number(msg.deltaY) || 0));
    await activePage.mouse.move(x, y);
    await activePage.mouse.wheel(0, deltaY);
    pushHistory('mouse', `wheel ${deltaY}`);
  }
}

async function handleKey(msg: any): Promise<void> {
  if (!activePage || activePage.isClosed()) return;
  if (status !== 'running' || paused) return;

  const key = normalizeKey(msg.key);
  if (!key) return;
  const action = String(msg.action || 'press');

  if (action === 'press') {
    const combo = buildCombo(key, msg);
    await activePage.keyboard.press(combo);
    pushHistory('key', combo);
    return;
  }
  if (action === 'down') {
    await activePage.keyboard.down(key);
    const isPrintable = key.length === 1;
    if (!isPrintable || msg.ctrlKey || msg.altKey || msg.metaKey) {
      pushHistory('key', buildCombo(key, msg));
    }
    return;
  }
  if (action === 'up') {
    await activePage.keyboard.up(key);
  }
}

async function handleText(msg: any): Promise<void> {
  if (!activePage || activePage.isClosed()) return;
  if (status !== 'running' || paused) return;
  const text = String(msg.text || '').slice(0, 2000);
  if (!text) return;
  await activePage.keyboard.type(text, { delay: 0 });
  pushHistory('text', `${text.length} caractere(s)`);
}

async function handleClientMessage(ws: WebSocket, msg: any): Promise<void> {
  switch (msg?.type) {
    case 'navigate':
      await navigateBrowser(String(msg.url || ''));
      break;
    case 'mouse':
      await handleMouse(msg);
      break;
    case 'key':
      await handleKey(msg);
      break;
    case 'text':
      await handleText(msg);
      break;
    case 'screenshot': {
      const buffer = await takeScreenshot();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'screenshot', data: buffer.toString('base64') }));
      }
      break;
    }
    case 'pause':
      pauseBrowser();
      break;
    case 'resume':
      resumeBrowser();
      break;
    case 'stop':
      await stopBrowser();
      break;
    case 'ping':
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
      break;
    default:
      break;
  }
}

export function attachBrowserWebSocket(server: HttpServer): void {
  if (wssAttached) return;
  wssAttached = true;

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/browser-ws') {
      socket.destroy();
      return;
    }

    const origin = req.headers.origin;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();
        const originHost = originUrl.hostname.toLowerCase();
        if (
          originHost !== hostHeader &&
          originHost !== 'localhost' &&
          originHost !== '127.0.0.1' &&
          originHost !== '[::1]'
        ) {
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    let authed = false;
    const authTimer = setTimeout(() => {
      if (!authed) {
        try {
          ws.close(1008, 'auth timeout');
        } catch {
          // ignore
        }
      }
    }, 5000);

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!authed) {
        if (msg?.type === 'auth' && typeof msg.ticket === 'string' && verifyWsTicket(msg.ticket)) {
          authed = true;
          clearTimeout(authTimer);
          clients.add(ws);
          resetIdleTimer();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'state', state: getBrowserState() }));
          }
          if (clients.size > 0 && status === 'running' && !paused) {
            void startScreencast().catch((err) => {
              console.error('[browser] Falha ao iniciar screencast:', (err as any)?.message || err);
            });
          }
        } else {
          try {
            ws.close(1008, 'unauthorized');
          } catch {
            // ignore
          }
        }
        return;
      }

      void handleClientMessage(ws, msg).catch((err) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'error', error: sanitizeError(err) }));
          } catch {
            // ignore
          }
        }
      });
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      clients.delete(ws);
      if (clients.size === 0) {
        void stopScreencast();
        resetIdleTimer();
      }
    });

    ws.on('error', () => {
      clearTimeout(authTimer);
      clients.delete(ws);
    });
  });
}
