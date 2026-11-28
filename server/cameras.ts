import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import dgram from 'dgram';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { execFile, spawn as spawnProc } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export type CameraBrand = 'generic' | 'yoosee' | 'icsee' | 'v380' | 'camhi' | 'custom';

export interface CameraConfig {
  id: string;
  name: string;
  ip: string;
  mac?: string;
  username: string;
  password: string;
  mainStream: string;
  subStream: string;
  nvrEnabled?: boolean;
  profileToken?: string;
  brand?: CameraBrand;
  model?: string;
  onvifPort?: number;
  rtspPort?: number;
  enabled?: boolean;
}

interface CameraSecretsFile {
  cameras: Array<Partial<CameraConfig>>;
}

export interface CameraPublic {
  id: string;
  name: string;
  ip: string;
  mac?: string;
  nvrEnabled?: boolean;
  brand: CameraBrand;
  model?: string;
  onvifPort: number;
  rtspPort: number;
  enabled: boolean;
  mainPath: string;
  subPath: string;
  streamNameMain: string;
  streamNameSub: string;
}

const ROOT = process.cwd();
const SECRETS_PATH = path.join(ROOT, '.camera-secrets.json');
const GO2RTC_BIN = path.join(ROOT, 'bin', 'go2rtc');
const GO2RTC_CONFIG = path.join(ROOT, 'data', 'go2rtc.yaml');
const GO2RTC_API_HOST = '127.0.0.1';
const GO2RTC_API_PORT = 1984;
const GO2RTC_WEBRTC_PORT = 8555;

let go2rtcProc: ChildProcess | null = null;
let go2rtcStarting: Promise<void> | null = null;
let lastStartError = '';

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function safeCamId(id: string) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64) || 'cam';
}

function sanitizeBrand(v: any): CameraBrand {
  const b = String(v || 'generic').toLowerCase().trim();
  return (['generic','yoosee','icsee','v380','camhi','custom'] as const).includes(b as CameraBrand) ? (b as CameraBrand) : 'generic';
}

function normalizeStream(urlOrPath: string, ip: string, port: number, fallbackPath: string) {
  const raw = String(urlOrPath || '').trim();
  if (/^rtsp:\/\//i.test(raw)) return raw;
  const p = raw.startsWith('/') ? raw : (raw ? `/${raw}` : fallbackPath);
  return `rtsp://${ip}:${port}${p}`;
}

export function loadCameraConfigs(): CameraConfig[] {
  if (!fs.existsSync(SECRETS_PATH)) return [];
  const stat = fs.statSync(SECRETS_PATH);
  // allow 600 or 400
  if ((stat.mode & 0o077) !== 0) throw new Error('Permissões inseguras em .camera-secrets.json (esperado 600)');
  const raw = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8')) as CameraSecretsFile;
  const cams = Array.isArray(raw?.cameras) ? raw.cameras : [];
  return cams.map((c, idx) => {
    const id = safeCamId(c.id || `cam${idx+1}`);
    const ip = String(c.ip || '').trim();
    const username = String(c.username || 'admin').trim();
    const password = String(c.password || '');
    const rtspPort = Number(c.rtspPort || 554) || 554;
    const onvifPort = Number(c.onvifPort || 5000) || 5000;
    const brand = sanitizeBrand((c as any).brand);
    return {
      id,
      name: String(c.name || `Câmera ${idx+1}`).trim(),
      ip,
      mac: c.mac ? String(c.mac).trim() : undefined,
      username,
      password,
      mainStream: normalizeStream(String(c.mainStream || ''), ip, rtspPort, '/onvif1'),
      subStream: normalizeStream(String(c.subStream || ''), ip, rtspPort, '/onvif2'),
      nvrEnabled: !!c.nvrEnabled,
      profileToken: String(c.profileToken || 'IPCProfilesToken0'),
      brand,
      model: c.model ? String(c.model).trim() : undefined,
      onvifPort,
      rtspPort,
      enabled: c.enabled !== false,
    } as CameraConfig;
  }).filter(c => c.ip && c.password && c.enabled !== false);
}

export function getPublicCameras(): CameraPublic[] {
  return loadCameraConfigs().map(c => ({
    id: c.id, name: c.name, ip: c.ip, mac: c.mac, nvrEnabled: c.nvrEnabled,
    brand: c.brand || 'generic', model: c.model, onvifPort: c.onvifPort || 5000, rtspPort: c.rtspPort || 554, enabled: c.enabled !== false,
    mainPath: `/api/cameras/${c.id}/stream/main`,
    subPath: `/api/cameras/${c.id}/stream/sub`,
    streamNameMain: `${c.id}_main`,
    streamNameSub: `${c.id}_sub`,
  }));
}

function saveCameraConfigs(cams: CameraConfig[]) {
  const payload: CameraSecretsFile = { cameras: cams.map(c => ({
    id: c.id, name: c.name, ip: c.ip, mac: c.mac, username: c.username, password: c.password,
    mainStream: c.mainStream, subStream: c.subStream, nvrEnabled: !!c.nvrEnabled, profileToken: c.profileToken,
    brand: c.brand || 'generic', model: c.model, onvifPort: c.onvifPort || 5000, rtspPort: c.rtspPort || 554, enabled: c.enabled !== false,
  })) };
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(SECRETS_PATH, 0o600); } catch {}
}

export function addCameraConfig(input: Partial<CameraConfig>) {
  const ip = String(input.ip || '').trim();
  if (!ip) throw new Error('IP obrigatório');
  const cams = loadCameraConfigs();
  const id = safeCamId(String(input.id || input.name || ip).trim() || `cam${cams.length+1}`);
  if (cams.some(c => c.id === id)) throw new Error('ID de câmera já existe');
  const rtspPort = Number(input.rtspPort || 554) || 554;
  const onvifPort = Number(input.onvifPort || 5000) || 5000;
  const cam: CameraConfig = {
    id,
    name: String(input.name || `Câmera ${ip}`).trim(),
    ip,
    mac: input.mac ? String(input.mac).trim() : undefined,
    username: String(input.username || 'admin').trim(),
    password: String(input.password || ''),
    mainStream: normalizeStream(String(input.mainStream || ''), ip, rtspPort, '/onvif1'),
    subStream: normalizeStream(String(input.subStream || ''), ip, rtspPort, '/onvif2'),
    nvrEnabled: !!input.nvrEnabled,
    profileToken: String(input.profileToken || 'IPCProfilesToken0'),
    brand: sanitizeBrand(input.brand),
    model: input.model ? String(input.model).trim() : undefined,
    onvifPort, rtspPort, enabled: input.enabled !== false,
  };
  if (!cam.password) throw new Error('Senha obrigatória');
  cams.push(cam);
  saveCameraConfigs(cams);
  return getPublicCameras().find(c => c.id === cam.id);
}

export function deleteCameraConfig(id: string) {
  const sid = safeCamId(id);
  const cams = loadCameraConfigs();
  const next = cams.filter(c => c.id !== sid);
  if (next.length === cams.length) throw new Error('Câmera não encontrada');
  saveCameraConfigs(next);
  return { ok: true };
}

export function brandCapabilities(brand: CameraBrand) {
  const common = { live: true, onvif: true, rtsp: true };
  if (brand === 'yoosee') return { ...common, ptz: 'onvif-unstable', led: 'proprietary', sdPlayback: 'proprietary', notes: 'Yoosee: PTZ/LED/SD geralmente via P2P proprietário; ONVIF parcial.' };
  if (brand === 'icsee') return { ...common, ptz: 'onvif-or-proprietary', led: 'unknown', sdPlayback: 'unknown', notes: 'iCSee: validar ONVIF/RTSP por modelo.' };
  if (brand === 'v380') return { ...common, ptz: 'proprietary', led: 'unknown', sdPlayback: 'proprietary', notes: 'V380: geralmente depende de protocolo proprietário.' };
  if (brand === 'camhi') return { ...common, ptz: 'onvif-or-proprietary', led: 'unknown', sdPlayback: 'unknown', notes: 'CamHi: alguns modelos expõem ONVIF.' };
  return { ...common, ptz: 'onvif', led: 'unknown', sdPlayback: 'unknown', notes: 'Genérica: usa RTSP/ONVIF padrão quando disponível.' };
}

function rtspUrlWithAuth(url: string, username: string, password: string) {
  // Do not log this. Build rtsp://user:pass@host...
  const u = new URL(url);
  u.username = encodeURIComponent(username);
  u.password = encodeURIComponent(password);
  return u.toString();
}

function buildGo2rtcConfig(cams: CameraConfig[]) {
  const streams: Record<string, string> = {};
  for (const c of cams) {
    const main = rtspUrlWithAuth(c.mainStream, c.username, c.password);
    const sub = rtspUrlWithAuth(c.subStream, c.username, c.password);
    // Low-resource defaults: TCP transport, no transcoding; consumer picks WebRTC/MSE.
    streams[`${c.id}_main`] = `${main}#transport=tcp`;
    streams[`${c.id}_sub`] = `${sub}#transport=tcp`;
  }
  const cfg: any = {
    log: { level: 'info' },
    api: { listen: `${GO2RTC_API_HOST}:${GO2RTC_API_PORT}`, origin: '*' },
    rtsp: { listen: '' }, // disable rtsp server
    webrtc: {
      listen: `127.0.0.1:${GO2RTC_WEBRTC_PORT}`,
      ice_servers: [],
    },
    ffmpeg: {
      mjpeg: "-c:v mjpeg -q:v 5 -r 15 -f mjpeg -",
    },
    streams,
  };
  return cfg;
}

function yamlDump(obj: any, indent = 0): string {
  const sp = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(v => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const entries = Object.entries(v);
        if (entries.length === 0) return `${sp}- {}`;
        const [k0, v0] = entries[0];
        const first = (v0 && typeof v0 === 'object' && !(Array.isArray(v0) && v0.length === 0) && !( !Array.isArray(v0) && Object.keys(v0).length===0))
      ? [`${sp}- ${k0}:`, yamlDump(v0, indent + 2)]
      : [`${sp}- ${k0}: ${yamlDump(v0,0)}`];
        const rest = entries.slice(1).map(([k,val]) => {
          const isObj = val && typeof val === 'object';
          const isEmpty = isObj && ((Array.isArray(val) && val.length===0) || (!Array.isArray(val) && Object.keys(val).length===0));
          return (isObj && !isEmpty) ? `${sp}  ${k}:\n${yamlDump(val, indent + 2)}` : `${sp}  ${k}: ${yamlDump(val,0)}`;
        });
        return [...first, ...rest].join('\n');
      }
      return `${sp}- ${yamlDump(v, 0)}`;
    }).join('\n');
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';
  return entries.map(([k,v]) => {
    const isObj = v && typeof v === 'object';
    const isEmpty = isObj && ((Array.isArray(v) && v.length===0) || (!Array.isArray(v) && Object.keys(v).length===0));
    return (isObj && !isEmpty) ? `${sp}${k}:\n${yamlDump(v, indent + 1)}` : `${sp}${k}: ${yamlDump(v,0)}`;
  }).join('\n');
}

async function waitForGo2rtc(timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${GO2RTC_API_HOST}:${GO2RTC_API_PORT}/api`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(lastStartError || 'go2rtc não respondeu na API local');
}

export async function ensureGo2rtcRunning(): Promise<{ ok: boolean; error?: string }> {
  try {
    const cams = loadCameraConfigs();
    if (cams.length === 0) return { ok: false, error: 'Nenhuma câmera configurada em .camera-secrets.json' };
    if (!fs.existsSync(GO2RTC_BIN)) return { ok: false, error: 'Binário go2rtc ausente em /opt/server-panel/bin/go2rtc' };
    ensureDir(path.join(ROOT, 'data'));
    const cfg = buildGo2rtcConfig(cams);
    fs.writeFileSync(GO2RTC_CONFIG, yamlDump(cfg) + '\n', { mode: 0o600 });

    try { const r = await fetch(`http://${GO2RTC_API_HOST}:${GO2RTC_API_PORT}/api`); if (r.ok) return { ok: true }; } catch {}

    if (go2rtcStarting) { await go2rtcStarting; return { ok: true }; }
    go2rtcStarting = (async () => {
      lastStartError = '';
      if (go2rtcProc && !go2rtcProc.killed) return;
      go2rtcProc = spawn(GO2RTC_BIN, ['-c', GO2RTC_CONFIG], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      go2rtcProc.stdout?.on('data', (d) => { const s = String(d); if (s.toLowerCase().includes('error')) lastStartError = s.slice(0,300); });
      go2rtcProc.stderr?.on('data', (d) => { const s = String(d); if (s.toLowerCase().includes('error')) lastStartError = s.slice(0,300); });
      go2rtcProc.on('exit', () => { go2rtcProc = null; });
      await waitForGo2rtc();
    })();
    try { await go2rtcStarting; } finally { go2rtcStarting = null; }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function getCameraStatus() {
  const cams = getPublicCameras();
  const go2rtc = await ensureGo2rtcRunning();
  const result: any[] = [];
  for (const c of cams) {
    const base = { ...c, online: false, error: go2rtc.ok ? null : go2rtc.error, latencyMs: null as number|null, producer: null as any };
    if (!go2rtc.ok) { result.push(base); continue; }
    try {
      const t0 = Date.now();
      const r = await fetch(`http://${GO2RTC_API_HOST}:${GO2RTC_API_PORT}/api/streams?src=${encodeURIComponent(c.streamNameMain)}`);
      const latencyMs = Date.now() - t0;
      const j: any = await r.json();
      const producer = Array.isArray(j?.producers) ? j.producers[0] : null;
      base.online = !!producer;
      base.latencyMs = latencyMs;
      base.producer = producer ? { type: producer.format_name || producer.type, medias: producer.medias, recv: producer.recv } : null;
      if (!producer) base.error = 'Sem produtor RTSP ativo';
    } catch (e: any) {
      base.error = e?.message || 'Falha ao consultar go2rtc';
    }
    result.push(base);
  }
  return { ok: true, go2rtc: { ok: go2rtc.ok, error: go2rtc.error || null }, cameras: result };
}

export async function proxyCameraRequest(req: http.IncomingMessage, res: http.ServerResponse, camId: string, kind: 'main'|'sub', action: string) {
  const cams = loadCameraConfigs();
  const cam = cams.find(c => c.id === safeCamId(camId));
  if (!cam) { res.statusCode = 404; res.end('camera not found'); return; }
  const up = await ensureGo2rtcRunning();
  if (!up.ok) { res.statusCode = 503; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({error:up.error})); return; }
  const src = `${cam.id}_${kind}`;
  const url = new URL(req.url || '/', 'http://localhost');
  url.searchParams.set('src', src);
  const targetPath = `/api/${action}${url.search}`;
  const opts: http.RequestOptions = { hostname: GO2RTC_API_HOST, port: GO2RTC_API_PORT, path: targetPath, method: req.method, headers: { ...req.headers, host: `${GO2RTC_API_HOST}:${GO2RTC_API_PORT}` } };
  delete (opts.headers as any)['authorization'];
  const proxy = http.request(opts, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(res);
  });
  proxy.on('error', (e) => { if (!res.headersSent) { res.statusCode = 502; res.setHeader('Content-Type','application/json'); } res.end(JSON.stringify({error:String(e.message||e)})); });
  req.pipe(proxy);
}

export async function proxyWebrtcOffer(req: http.IncomingMessage, res: http.ServerResponse, camId: string, kind: 'main'|'sub') {
  const cams = loadCameraConfigs();
  const cam = cams.find(c => c.id === safeCamId(camId));
  if (!cam) { res.statusCode = 404; res.end('camera not found'); return; }
  const up = await ensureGo2rtcRunning();
  if (!up.ok) { res.statusCode = 503; res.end(up.error); return; }
  const src = `${cam.id}_${kind}`;
  const targetPath = `/api/webrtc?src=${encodeURIComponent(src)}`;
  const opts: http.RequestOptions = { hostname: GO2RTC_API_HOST, port: GO2RTC_API_PORT, path: targetPath, method: 'POST', headers: { 'Content-Type': req.headers['content-type'] || 'application/sdp' } };
  const proxy = http.request(opts, (upRes) => { res.writeHead(upRes.statusCode || 502, upRes.headers); upRes.pipe(res); });
  proxy.on('error', (e) => { if (!res.headersSent) res.statusCode=502; res.end(String(e)); });
  req.pipe(proxy);
}

type LiveStream = { proc: ChildProcess; clients: Set<http.ServerResponse>; lastData: number; stopTimer?: NodeJS.Timeout; boundary: string };
const liveStreams = new Map<string, LiveStream>();

type CamLiveToken = { camId: string; kind: 'main'|'sub'; expiresAt: number };
const camLiveTokens = new Map<string, CamLiveToken>();
function cleanCamLiveTokens(){ const now=Date.now(); for(const [k,v] of camLiveTokens) if(v.expiresAt<=now) camLiveTokens.delete(k); }
export function createCameraLiveToken(camId: string, kind: 'main'|'sub'='sub', ttlMs=5*60*1000){
  cleanCamLiveTokens();
  const token = crypto.randomBytes(18).toString('hex');
  const rec = { camId: safeCamId(camId), kind, expiresAt: Date.now()+Math.max(30000,ttlMs) };
  camLiveTokens.set(token, rec);
  return { token, camId: rec.camId, kind, expiresAt: rec.expiresAt, path: `/api/cameras/live/${token}`, streamPath: `/api/cameras/live/${token}/stream.mjpeg`, framePath: `/api/cameras/live/${token}/frame.jpeg` };
}
export function getCameraLiveToken(token: string){ cleanCamLiveTokens(); const r=camLiveTokens.get(String(token||'')); if(!r || r.expiresAt<=Date.now()) return null; return r; }

function stopLiveStream(key: string) {
  const s = liveStreams.get(key);
  if (!s) return;
  if (s.stopTimer) clearTimeout(s.stopTimer);
  for (const c of s.clients) { try { c.end(); } catch {} }
  s.clients.clear();
  try { s.proc.kill('SIGKILL'); } catch {}
  liveStreams.delete(key);
}

export async function serveLiveMjpeg(req: http.IncomingMessage, res: http.ServerResponse, camId: string, kind: 'main'|'sub') {
  const cams = loadCameraConfigs();
  const cam = cams.find(c => c.id === safeCamId(camId));
  if (!cam) { res.statusCode = 404; res.end('camera not found'); return; }
  const srcUrl = rtspUrlWithAuth(cam.subStream, cam.username, cam.password); // SD only for stability
  const key = `${cam.id}_sub`;
  let stream = liveStreams.get(key);

  if (!stream || stream.proc.killed || stream.proc.exitCode !== null) {
    if (stream) stopLiveStream(key);
    const boundary = 'frameboundary';
    const args = ['-hide_banner','-loglevel','warning','-fflags','nobuffer','-flags','low_delay','-i',srcUrl,'-an','-c:v','mjpeg','-q:v','7','-r','10','-f','mpjpeg','-boundary_tag',boundary,'pipe:1'];
    const proc = spawnProc('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] });
    stream = { proc, clients: new Set(), lastData: Date.now(), boundary };
    liveStreams.set(key, stream);
    proc.stdout?.on('data', (chunk: Buffer) => {
      const s = liveStreams.get(key); if (!s) return;
      s.lastData = Date.now();
      for (const c of s.clients) { try { c.write(chunk); } catch {} }
    });
    proc.stderr?.on('data', (d) => { const msg = String(d).slice(0,200); if (msg && /error|fail|invalid/i.test(msg)) (stream as any).lastErr = msg; });
    const cleanup = () => {
      const s = liveStreams.get(key);
      if (s && s.proc === proc) {
        for (const c of s.clients) { try { c.end(); } catch {} }
        liveStreams.delete(key);
      }
    };
    proc.on('exit', cleanup);
    proc.on('error', cleanup);
  }

  if (stream.stopTimer) { clearTimeout(stream.stopTimer); stream.stopTimer = undefined; }
  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${stream.boundary}`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Connection': 'close',
    'X-Accel-Buffering': 'no',
  });
  stream.clients.add(res);

  const remove = () => {
    const s = liveStreams.get(key); if (!s) return;
    s.clients.delete(res);
    if (s.clients.size === 0) {
      s.stopTimer = setTimeout(() => {
        const cur = liveStreams.get(key);
        if (cur && cur.clients.size === 0) stopLiveStream(key);
      }, 3000);
    }
  };
  req.on('close', remove);
  req.on('error', remove);
}

export async function serveLiveAudio(req: http.IncomingMessage, res: http.ServerResponse, camId: string) {
  const cams = loadCameraConfigs();
  const cam = cams.find(c => c.id === safeCamId(camId));
  if (!cam) { res.statusCode = 404; res.end('camera not found'); return; }
  // onvif1/main usually carries audio; onvif2/sub often video-only
  const srcUrl = rtspUrlWithAuth(cam.mainStream || cam.subStream, cam.username, cam.password);
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Connection': 'close',
    'X-Accel-Buffering': 'no',
    'Accept-Ranges': 'none',
  });
  const args = [
    '-hide_banner','-loglevel','error',
    '-timeout','5000000',
    '-i', srcUrl,
    '-vn','-ac','1','-ar','16000',
    '-c:a','libmp3lame','-b:a','64k',
    '-f','mp3','pipe:1'
  ];
  const proc = spawnProc('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] });
  proc.stdout.pipe(res);
  const kill = () => { try { proc.kill('SIGKILL'); } catch {} };
  req.on('close', kill); req.on('error', kill);
  proc.on('error', () => { try { res.end(); } catch {} });
  proc.on('exit', () => { try { res.end(); } catch {} });
}

export function stopGo2rtc() {
  if (go2rtcProc && !go2rtcProc.killed) try { go2rtcProc.kill('SIGTERM'); } catch {}
}

export async function discoverYooseeCameras(timeoutMs = 2500): Promise<any[]> {
  return await new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Map<string, any>();
    const probes = [
      Buffer.from('70021c000000000000000000737f759d00000000000001020a00c422', 'hex'),
      Buffer.alloc(1024, 0),
    ];
    const done = () => { try { sock.close(); } catch {} resolve([...found.values()]); };
    const timer = setTimeout(done, timeoutMs);
    sock.on('message', (msg, rinfo) => {
      const hex = msg.toString('hex');
      const ascii = msg.toString('utf8').replace(/[^\x20-\x7E]/g, '').slice(0, 200);
      found.set(rinfo.address, { ip: rinfo.address, port: rinfo.port, bytes: msg.length, hex: hex.slice(0, 120), ascii, source: 'xm-udp-8899' });
    });
    sock.on('error', () => { clearTimeout(timer); done(); });
    sock.bind(0, () => {
      try { sock.setBroadcast(true); } catch {}
      for (const p of probes) {
        try { sock.send(p, 8899, '255.255.255.255'); } catch {}
      }
    });
  });
}


function wsse(user: string, pass: string) {
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const nonce = crypto.randomBytes(16);
  const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(pass)])).digest('base64');
  return `<Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken><Username>${user}</Username><Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password><Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</Nonce><Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created></UsernameToken></Security>`;
}

const ptzLocks = new Map<string, Promise<void>>();
async function withPtzLock<T>(camId: string, fn: () => Promise<T>): Promise<T> {
  const prev = ptzLocks.get(camId) || Promise.resolve();
  let release!: () => void;
  const cur = new Promise<void>(r => { release = r; });
  ptzLocks.set(camId, prev.then(() => cur));
  await prev.catch(() => {});
  try { return await fn(); } finally { release(); if (ptzLocks.get(camId) === cur) ptzLocks.delete(camId); }
}

async function onvifPost(cam: CameraConfig, servicePath: string, bodyXml: string, timeoutMs = 6000): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const xml = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl"><s:Header><wsa:Action>http://www.onvif.org/ver20/ptz/wsdl/${bodyXml.includes('ContinuousMove')?'ContinuousMove':bodyXml.includes('Stop')?'Stop':'Action'}</wsa:Action><wsa:To>http://${cam.ip}:${cam.onvifPort || 5000}${servicePath}</wsa:To>${wsse(cam.username, cam.password)}</s:Header><s:Body>${bodyXml}</s:Body></s:Envelope>`;
  return await new Promise((resolve) => {
    const req = http.request({ hostname: cam.ip, port: cam.onvifPort || 5000, path: servicePath, method: 'POST', timeout: timeoutMs, headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(xml), 'Connection': 'close' } }, (res) => {
      let buf=''; res.setEncoding('utf8'); res.on('data', c=>buf+=c); res.on('end', ()=> resolve({ ok: (res.statusCode||500) < 400 && !/Fault/i.test(buf), status: res.statusCode, body: buf.slice(0, 120000) }));
    });
    req.on('timeout', ()=> req.destroy(new Error('timeout')));
    req.on('error', (e)=> resolve({ ok:false, error:String(e?.message||e) }));
    req.write(xml); req.end();
  });
}

function parseXmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^:>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`, 'gi');
  const out: string[] = []; let m: RegExpExecArray|null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

function parseXmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^:>]*:?${tag}\\b[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`, 'gi');
  const out: string[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function xmlVal(xml: string, tag: string): string { return parseXmlTags(xml, tag)[0] || ''; }

async function probeCameraWifi(cam: CameraConfig) {
  const attempts: any[] = [];
  const probes: Array<{name:string; path:string; body:string}> = [
    { name: 'GetDot11Status', path: '/onvif/device_service', body: '<tds:GetDot11Status><tds:InterfaceToken>eth0</tds:InterfaceToken></tds:GetDot11Status>' },
    { name: 'GetDot11Status-wlan0', path: '/onvif/device_service', body: '<tds:GetDot11Status><tds:InterfaceToken>wlan0</tds:InterfaceToken></tds:GetDot11Status>' },
    { name: 'GetDot11Capabilities', path: '/onvif/device_service', body: '<tds:GetDot11Capabilities/>' },
    { name: 'GetNetworkInterfaces', path: '/onvif/device_service', body: '<tds:GetNetworkInterfaces/>' },
  ];
  for (const p of probes) {
    try {
      const r = await onvifPost(cam, p.path, p.body, 5000);
      const b = r.body || '';
      const hasSignal = /SignalStrength|Signal|RSSI|dBm|SSID/i.test(b);
      attempts.push({ name: p.name, ok: r.ok, status: r.status, hasSignal, fault: /Fault/i.test(b) });
      if (r.ok && hasSignal) {
        const ssid = xmlVal(b, 'SSID');
        const strength = xmlVal(b, 'SignalStrength') || xmlVal(b, 'Strength') || xmlVal(b, 'SignalQuality');
        const signal = xmlVal(b, 'Signal');
        return { supported: true, ssid: ssid || null, signalStrength: strength || signal || null, source: p.name, attempts };
      }
      // Parse network interfaces for wireless extensions
      if (p.name === 'GetNetworkInterfaces' && b) {
        const ifaces = parseXmlBlocks(b, 'NetworkInterface');
        for (const iface of ifaces) {
          const ssid = xmlVal(iface, 'SSID');
          const strength = xmlVal(iface, 'SignalStrength') || xmlVal(iface, 'Strength') || xmlVal(iface, 'SignalQuality');
          const wireless = /Wireless|Dot11|Wifi|802\.11/i.test(iface);
          if (wireless || ssid || strength) {
            return { supported: !!(ssid || strength), ssid: ssid || null, signalStrength: strength || null, wireless, source: 'GetNetworkInterfaces', attempts };
          }
        }
      }
    } catch (e:any) { attempts.push({ name: p.name, ok:false, error: String(e?.message||e).slice(0,120) }); }
  }
  return { supported: false, ssid: null, signalStrength: null, reason: 'Câmera não expõe RSSI/SSID por ONVIF padrão; pode exigir API proprietária Yoosee.', attempts };
}

async function probeCameraStorage(cam: CameraConfig) {
  const attempts: any[] = [];
  const probes: Array<{name:string; path:string; body:string}> = [
    { name: 'GetStorageConfigurations', path: '/onvif/device_service', body: '<tds:GetStorageConfigurations/>' },
    { name: 'GetStorageConfiguration', path: '/onvif/device_service', body: '<tds:GetStorageConfiguration><tds:Token>SD_CARD</tds:Token></tds:GetStorageConfiguration>' },
    { name: 'GetRecordingSummary', path: '/onvif/recording_service', body: '<trc:GetRecordingSummary xmlns:trc="http://www.onvif.org/ver10/recording/wsdl"/>' },
    { name: 'GetRecordings', path: '/onvif/recording_service', body: '<trc:GetRecordings xmlns:trc="http://www.onvif.org/ver10/recording/wsdl"/>' },
  ];
  for (const p of probes) {
    try {
      const r = await onvifPost(cam, p.path, p.body, 5000);
      const b = r.body || '';
      const fault = /Fault/i.test(b);
      attempts.push({ name: p.name, ok: r.ok, status: r.status, fault, len: b.length });
      if (r.ok && !fault) {
        const configs = parseXmlBlocks(b, 'StorageConfiguration').concat(parseXmlBlocks(b, 'RecordingInformation'));
        if (configs.length) {
          const items = configs.map(c => ({
            token: xmlVal(c,'Token') || xmlVal(c,'RecordingToken') || null,
            type: xmlVal(c,'Type') || null,
            state: xmlVal(c,'State') || null,
            total: xmlVal(c,'TotalCapacity') || xmlVal(c,'TotalSpace') || null,
            free: xmlVal(c,'FreeSpace') || xmlVal(c,'Remaining') || null,
          }));
          return { supported: true, items, source: p.name, attempts };
        }
        // Even without parseable items, a successful non-fault response is informative
        if (/StorageConfiguration|Recording/i.test(b)) return { supported: true, raw: b.slice(0, 2000), source: p.name, attempts };
      }
    } catch (e:any) { attempts.push({ name: p.name, ok:false, error: String(e?.message||e).slice(0,120) }); }
  }
  return { supported: false, items: [], reason: 'Armazenamento/SD não exposto por ONVIF padrão nesta câmera; Yoosee geralmente usa API proprietária.', attempts };
}

export async function getCameraDetails(camId: string) {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  const [dev, caps, netifs, wifi, storage] = await Promise.all([
    onvifPost(cam, '/onvif/device_service', '<tds:GetDeviceInformation/>'),
    onvifPost(cam, '/onvif/device_service', '<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>'),
    onvifPost(cam, '/onvif/device_service', '<tds:GetNetworkInterfaces/>'),
    probeCameraWifi(cam),
    probeCameraStorage(cam),
  ]);
  const devBody = dev.body || ''; const capsBody = caps.body || ''; const netBody = netifs.body || '';
  const get = (b:string,t:string)=>parseXmlTags(b,t)[0]||'';
  const interfaces = [];
  const hw = get(netBody,'HwAddress'); const addr = get(netBody,'Address'); const dhcp = get(netBody,'DHCP');
  if (hw || addr) interfaces.push({ hwAddress: hw, ipv4: addr, dhcp });
  return {
    ok: true,
    camera: { id: cam.id, name: cam.name, ip: cam.ip, mac: cam.mac, nvrEnabled: !!cam.nvrEnabled, mainStream: cam.mainStream, subStream: cam.subStream, brand: cam.brand || 'generic' },
    device: { manufacturer: get(devBody,'Manufacturer'), model: get(devBody,'Model'), firmware: get(devBody,'FirmwareVersion'), serial: get(devBody,'SerialNumber'), hardwareId: get(devBody,'HardwareId') },
    network: { interfaces, wifi },
    storage,
    capabilities: {
      ptz: /PTZ/i.test(capsBody),
      imaging: /Imaging/i.test(capsBody),
      events: /Events/i.test(capsBody),
      deviceIO: /DeviceIO/i.test(capsBody),
      media: /Media/i.test(capsBody),
      audio: true,
    },
    controls: {
      ptz: { supported: true, actions: ['left','right','up','down','stop'], speedRange: [0.1, 1], note: 'ONVIF PTZ com fallback RTSP SET_PARAMETER (Yoosee).' },
      led: { supported: (cam.brand||'generic') === 'yoosee', note: 'LED/IR: tentativa best-effort (ONVIF/CGI). Yoosee geralmente exige protocolo proprietário/P2P; pode não funcionar.' },
      audio: { supported: true, note: 'Áudio via ffmpeg/RTSP (PCMA).' },
      recordingPlayback: { supported: !!storage.supported, note: storage.supported ? 'Armazenamento detectado via ONVIF.' : 'Replay microSD/NVR não exposto por ONVIF padrão nesta câmera.' },
      wifi: { supported: !!wifi.supported, note: wifi.supported ? 'Wi-Fi reportado por ONVIF.' : (wifi.reason || 'Wi-Fi/RSSI não exposto por ONVIF padrão.') },
    },
    rawOk: { dev: dev.ok, caps: caps.ok, netifs: netifs.ok },
  };
}

export async function cameraLed(camId: string, mode: 'on'|'off'|'auto') {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  const attempts: any[] = [];
  // Best-effort ONVIF probes
  const auxCmd = mode === 'on' ? 'tt:IRCutFilterOn' : mode === 'off' ? 'tt:IRCutFilterOff' : 'tt:IRCutFilterAuto';
  const probes: Array<{name:string; path:string; body:string}> = [
    { name:'SendAuxiliaryCommand', path:'/onvif/device_service', body:`<tds:SendAuxiliaryCommand><tds:AuxiliaryCommand>${auxCmd}</tds:AuxiliaryCommand></tds:SendAuxiliaryCommand>` },
    { name:'SetRelayOutputState', path:'/onvif/deviceio_service', body:`<tmd:SetRelayOutputState xmlns:tmd="http://www.onvif.org/ver10/deviceIO/wsdl"><tmd:RelayOutputToken>relay0</tmd:RelayOutputToken><tmd:LogicalState>${mode==='off'?'inactive':'active'}</tmd:LogicalState></tmd:SetRelayOutputState>` },
  ];
  for (const p of probes) {
    try {
      const r = await onvifPost(cam, p.path, p.body, 5000);
      const fault = /Fault|not implemented|not supported|ActionNotSupported/i.test(r.body || '');
      attempts.push({ name:p.name, ok:r.ok, status:r.status, fault });
      if (r.ok && !fault) return { ok:true, supported:true, mode, method:p.name, attempts };
    } catch (e:any) { attempts.push({ name:p.name, ok:false, error:String(e?.message||e).slice(0,120) }); }
  }

  // Best-effort Yoosee CGI/HTTP probes observed across firmwares (proprietary, may vary by model)
  if ((cam.brand || 'generic') === 'yoosee' || /yoosee|gwell/i.test(String(cam.model||''))) {
    const cgi: Array<{name:string; path:string}> = [
      { name:'set_whiteLight_on', path:`/cgi-bin/set_whiteLight?mode=${mode==='off'?0:1}` },
      { name:'set_ir_on', path:`/cgi-bin/set_ir?mode=${mode==='off'?0:1}` },
      { name:'set_led_on', path:`/cgi-bin/set_led?mode=${mode==='off'?0:1}` },
      { name:'set_lamp', path:`/cgi-bin/set_lamp?status=${mode==='off'?0:1}` },
    ];
    for (const p of cgi) {
      try {
        const r = await fetch(`http://${cam.ip}${p.path}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${cam.username}:${cam.password}`).toString('base64') }, signal: AbortSignal.timeout(4000) as any });
        const body = await r.text().catch(()=>'');
        const ok = r.ok && !/error|not support|404|fail/i.test(body);
        attempts.push({ name:p.name, ok, status:r.status, body: body.slice(0,120) });
        if (ok) return { ok:true, supported:true, mode, method:p.name, attempts };
      } catch (e:any) { attempts.push({ name:p.name, ok:false, error:String(e?.message||e).slice(0,120) }); }
    }
  }
  return { ok:false, supported:false, mode, error:'LED/IR não confirmado por ONVIF/CGI nesta câmera. Yoosee costuma exigir protocolo proprietário/P2P.', attempts };
}

async function rtspSetParameter(cam: CameraConfig, body: string, timeoutMs=5000): Promise<{ok:boolean;status?:number;error?:string;raw?:string}> {
  return await new Promise((resolve) => {
    const socket = net.connect(cam.rtspPort || 554, cam.ip);
    let buf = ''; let cseq = 1; let session = ''; let authed = false; let finished = false;
    const done = (r:any) => { if (finished) return; finished = true; try{socket.destroy();}catch{} resolve(r); };
    const timer = setTimeout(()=>done({ok:false,error:'timeout'}), timeoutMs);
    const send = (msg: string) => socket.write(msg);
    const req = (method: string, headers: Record<string,string>, extra='') => {
      const h = { CSeq: String(cseq++), 'User-Agent': 'server-panel', ...headers };
      send(`${method} rtsp://${cam.ip}:${cam.rtspPort||554}/onvif1 RTSP/1.0\r\n${Object.entries(h).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n${extra}`);
    };
    const parse = (raw: string) => {
      const m = raw.match(/RTSP\/1\.0 (\d+)/); const status = m ? Number(m[1]) : 0;
      const sm = raw.match(/Session:\s*([^\r\n;]+)/i); if (sm) session = sm[1].trim();
      const wm = raw.match(/WWW-Authenticate:\s*Digest\s+(.+)/i);
      return { status, raw, www: wm?.[1] || '' };
    };
    const digest = (www: string, method: string, uri: string) => {
      const kv: Record<string,string> = {};
      www.replace(/(\w+)="?([^",]+)"?/g, (_,k,v)=>{kv[k]=v; return '';});
      const realm=kv.realm||'', nonce=kv.nonce||'', qop=kv.qop||'auth';
      const nc='00000001', cnonce=crypto.randomBytes(8).toString('hex');
      const ha1=crypto.createHash('md5').update(`${cam.username}:${realm}:${cam.password}`).digest('hex');
      const ha2=crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
      const resp=crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
      return `Digest username="${cam.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${resp}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    };
    socket.on('error', (e)=>{ clearTimeout(timer); done({ok:false,error:String(e.message||e)}); });
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      if (!buf.includes('\r\n\r\n')) return;
      const r = parse(buf); buf='';
      if (r.status === 401 && !authed && r.www) {
        authed = true;
        const uri = `rtsp://${cam.ip}:${cam.rtspPort||554}/onvif1`;
        const auth = digest(r.www, 'OPTIONS', uri);
        req('OPTIONS', { Authorization: auth });
        return;
      }
      if (!session) { req('DESCRIBE', authed ? { Authorization: digest(r.www||'', 'DESCRIBE', `rtsp://${cam.ip}:${cam.rtspPort||554}/onvif1`), Accept:'application/sdp' } : { Accept:'application/sdp' }); return; }
      // send SET_PARAMETER
      const uri = `rtsp://${cam.ip}:${cam.rtspPort||554}/onvif1`;
      const headers: Record<string,string> = { 'Content-Type':'text/parameters', 'Content-Length': String(Buffer.byteLength(body)), Session: session };
      if (authed) headers.Authorization = digest(r.www||'', 'SET_PARAMETER', uri);
      send(`SET_PARAMETER ${uri} RTSP/1.0\r\n${Object.entries({CSeq:String(cseq++),'User-Agent':'server-panel',...headers}).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n${body}`);
      socket.once('data', (d2)=>{ clearTimeout(timer); const rr=parse(d2.toString('utf8')); done({ok: rr.status>=200 && rr.status<300, status: rr.status, raw: rr.raw.slice(0,300)}); });
    });
    req('OPTIONS', {});
  });
}

export async function cameraPtz(camId: string, action: string, speedInput?: number) {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  const token = cam.profileToken || 'IPCProfilesToken0';
  const speed = Math.max(0.1, Math.min(1, Number(speedInput) || 1));
  const panTilt = (x:number,y:number) => `<tt:PanTilt x="${x}" y="${y}"/><tt:Zoom x="0"/>`;
  let body = '';
  // Some Yoosee/XM firmwares invert X axis on ONVIF ContinuousMove; swap left/right by default.
  if (action === 'left') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(speed,0)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'right') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(-speed,0)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'up') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,speed)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'down') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,-speed)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'stop') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,0)}</tptz:Velocity></tptz:ContinuousMove>`;
  else throw new Error('ação PTZ inválida');
  return await withPtzLock(cam.id, async () => {
    const r = await onvifPost(cam, '/onvif/ptz_service', body, 5000);
    if (r.ok) return { ok: true, status: r.status, action, speed, method: 'onvif' };
    if (action === 'stop') {
      const stopBody = `<tptz:Stop><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`;
      const r2 = await onvifPost(cam, '/onvif/ptz_service', stopBody, 5000);
      if (r2.ok) return { ok: true, status: r2.status, action, speed, fallback: 'stop' };
      const r3 = await onvifPost(cam, '/onvif/ptz_service', `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,0)}</tptz:Velocity></tptz:ContinuousMove>`, 5000);
      if (r3.ok) return { ok: true, status: r3.status, action, speed, fallback: 'zero-velocity' };
    }
    // RTSP SET_PARAMETER fallback (Yoosee/public research); DWON typo is intentional for compatibility.
    const cmdMap: Record<string,string> = { left:'LEFT', right:'RIGHT', up:'UP', down:'DWON', stop:'STOP' };
    const ptzCmd = cmdMap[action];
    if (ptzCmd) {
      const rr = await rtspSetParameter(cam, `ptzCmd: ${ptzCmd}\r\n`);
      if (rr.ok) return { ok: true, status: rr.status, action, speed, method: 'rtsp-set-parameter' };
      return { ok: false, status: rr.status || r.status, error: rr.error || r.error, action, speed, method: 'onvif+rtsp-failed' };
    }
    return { ok: r.ok, status: r.status, error: r.error, action, speed };
  });
}

export async function cameraProbeRecordings(camId: string) {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  // ONVIF replay/recording search is not exposed by this model; report clearly.
  // Probe RTSP common paths quickly with ffprobe DESCRIBE-like via rtsp url options? Use ffmpeg low timeout.
  const storage = await probeCameraStorage(cam);
  const common = ['/onvif1','/onvif2','/playback','/record','/replay','/sd','/stream1','/cam/playback?channel=1&subtype=0','/onvif/recording'];
  const findings: any[] = [];
  for (const p of common) {
    const url = rtspUrlWithAuth(`rtsp://${cam.ip}:${cam.rtspPort || 554}${p}`, cam.username, cam.password);
    try {
      const { stdout } = await execFileAsync('ffprobe', ['-v','error','-rtsp_transport','tcp','-timeout','2000000','-rw_timeout','2000000','-show_streams','-of','json', url], { timeout: 7000, maxBuffer: 1024*1024 });
      findings.push({ path:p, ok:true, out:(stdout||'').slice(0,300) });
    } catch (e:any) {
      const msg = String(e?.stderr || e?.message || e).slice(0,180);
      findings.push({ path:p, ok:false, error: msg });
    }
  }
  return { ok:true, supported:!!storage.supported, storage, reason: storage.supported ? 'Armazenamento detectado via ONVIF; playback ainda pode ser proprietário.' : 'ONVIF replay/search não exposto por esta câmera; gravações parecem proprietárias/SD local. Nenhum path RTSP de playback confirmado.', findings };
}
