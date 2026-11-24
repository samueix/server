import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { execFile, spawn as spawnProc } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

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
    return {
      id,
      name: String(c.name || `Câmera ${idx+1}`).trim(),
      ip,
      mac: c.mac ? String(c.mac).trim() : undefined,
      username,
      password,
      mainStream: String(c.mainStream || `rtsp://${ip}:554/onvif1`),
      subStream: String(c.subStream || `rtsp://${ip}:554/onvif2`),
      nvrEnabled: !!c.nvrEnabled,
      profileToken: String(c.profileToken || 'IPCProfilesToken0'),
    } as CameraConfig;
  }).filter(c => c.ip && c.password);
}

export function getPublicCameras(): CameraPublic[] {
  return loadCameraConfigs().map(c => ({
    id: c.id, name: c.name, ip: c.ip, mac: c.mac, nvrEnabled: c.nvrEnabled,
    mainPath: `/api/cameras/${c.id}/stream/main`,
    subPath: `/api/cameras/${c.id}/stream/sub`,
    streamNameMain: `${c.id}_main`,
    streamNameSub: `${c.id}_sub`,
    profileToken: c.profileToken,
  }));
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
  const srcUrl = rtspUrlWithAuth(cam.subStream, cam.username, cam.password);
  res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-cache, no-store', 'Connection': 'close', 'X-Accel-Buffering': 'no' });
  const args = ['-hide_banner','-loglevel','error','-i',srcUrl,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','wav','pipe:1'];
  const proc = spawnProc('ffmpeg', args, { stdio: ['ignore','pipe','ignore'] });
  proc.stdout.pipe(res);
  const kill = () => { try { proc.kill('SIGKILL'); } catch {} };
  req.on('close', kill); req.on('error', kill); proc.on('exit', () => { try { res.end(); } catch {} });
}

export function stopGo2rtc() {
  if (go2rtcProc && !go2rtcProc.killed) try { go2rtcProc.kill('SIGTERM'); } catch {}
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
  const xml = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl"><s:Header>${wsse(cam.username, cam.password)}</s:Header><s:Body>${bodyXml}</s:Body></s:Envelope>`;
  return await new Promise((resolve) => {
    const req = http.request({ hostname: cam.ip, port: 5000, path: servicePath, method: 'POST', timeout: timeoutMs, headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(xml), 'Connection': 'close' } }, (res) => {
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

export async function getCameraDetails(camId: string) {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  const [dev, caps, netifs] = await Promise.all([
    onvifPost(cam, '/onvif/device_service', '<tds:GetDeviceInformation/>'),
    onvifPost(cam, '/onvif/device_service', '<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>'),
    onvifPost(cam, '/onvif/device_service', '<tds:GetNetworkInterfaces/>'),
  ]);
  const devBody = dev.body || ''; const capsBody = caps.body || ''; const netBody = netifs.body || '';
  const get = (b:string,t:string)=>parseXmlTags(b,t)[0]||'';
  const interfaces = [];
  const hw = get(netBody,'HwAddress'); const addr = get(netBody,'Address'); const dhcp = get(netBody,'DHCP');
  if (hw || addr) interfaces.push({ hwAddress: hw, ipv4: addr, dhcp });
  return {
    ok: true,
    camera: { id: cam.id, name: cam.name, ip: cam.ip, mac: cam.mac, nvrEnabled: !!cam.nvrEnabled, mainStream: cam.mainStream, subStream: cam.subStream },
    device: { manufacturer: get(devBody,'Manufacturer'), model: get(devBody,'Model'), firmware: get(devBody,'FirmwareVersion'), serial: get(devBody,'SerialNumber'), hardwareId: get(devBody,'HardwareId') },
    network: { interfaces },
    capabilities: {
      ptz: /PTZ/i.test(capsBody),
      imaging: /Imaging/i.test(capsBody),
      events: /Events/i.test(capsBody),
      deviceIO: /DeviceIO/i.test(capsBody),
      media: /Media/i.test(capsBody),
      audio: true,
    },
    controls: {
      ptz: { supported: /PTZ/i.test(capsBody), actions: ['left','right','up','down','stop'] },
      led: { supported: 'unknown', note: 'ONVIF imaging não exposto; LED pode exigir API proprietária Yoosee.' },
      audio: { supported: true, note: 'Áudio via ffmpeg/RTSP (PCMA).' },
      recordingPlayback: { supported: false, note: 'Replay microSD/NVR não exposto por ONVIF padrão nesta câmera.' },
    },
    rawOk: { dev: dev.ok, caps: caps.ok, netifs: netifs.ok },
  };
}

export async function cameraLed(camId: string, mode: 'on'|'off'|'auto') {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  // Best-effort ONVIF imaging IR cut / auxiliary commands are model-specific; report unsupported if no clear endpoint.
  return { ok:false, supported:false, mode, error:'LED/IR não exposto por ONVIF padrão nesta Yoosee. Requer API proprietária.' };
}

export async function cameraPtz(camId: string, action: string) {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  const token = cam.profileToken || 'IPCProfilesToken0';
  const speed = 0.5;
  const panTilt = (x:number,y:number) => `<tt:PanTilt x="${x}" y="${y}"/><tt:Zoom x="0"/>`;
  let body = '';
  if (action === 'left') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(-speed,0)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'right') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(speed,0)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'up') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,speed)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'down') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,-speed)}</tptz:Velocity></tptz:ContinuousMove>`;
  else if (action === 'stop') body = `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,0)}</tptz:Velocity></tptz:ContinuousMove>`;
  else throw new Error('ação PTZ inválida');
  return await withPtzLock(cam.id, async () => {
    const r = await onvifPost(cam, '/onvif/ptz_service', body, 5000);
    if (!r.ok && action === 'stop') {
      const stopBody = `<tptz:Stop><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`;
      const r2 = await onvifPost(cam, '/onvif/ptz_service', stopBody, 5000);
      if (r2.ok) return { ok: true, status: r2.status, action, fallback: 'stop' };
      const r3 = await onvifPost(cam, '/onvif/ptz_service', `<tptz:ContinuousMove><tptz:ProfileToken>${token}</tptz:ProfileToken><tptz:Velocity>${panTilt(0,0)}</tptz:Velocity></tptz:ContinuousMove>`, 5000);
      return { ok: r3.ok, status: r3.status, error: r3.error || r2.error || r.error, action, fallback: 'zero-velocity' };
    }
    if (!r.ok && action !== 'stop') {
      await new Promise(res => setTimeout(res, 250));
      const r2 = await onvifPost(cam, '/onvif/ptz_service', body, 5000);
      return { ok: r2.ok, status: r2.status, error: r2.error || r.error, action, retried: !r2.ok ? false : true };
    }
    return { ok: r.ok, status: r.status, error: r.error, action };
  });
}

export async function cameraProbeRecordings(camId: string) {
  const cam = loadCameraConfigs().find(c => c.id === safeCamId(camId));
  if (!cam) throw new Error('camera not found');
  // ONVIF replay/recording search is not exposed by this model; report clearly.
  // Probe RTSP common paths quickly with ffprobe DESCRIBE-like via rtsp url options? Use ffmpeg low timeout.
  const common = ['/onvif1','/onvif2','/playback','/record','/replay','/sd','/stream1'];
  const findings: any[] = [];
  for (const p of common) {
    const url = rtspUrlWithAuth(`rtsp://${cam.ip}:554${p}`, cam.username, cam.password);
    try {
      const { stdout, stderr } = await execFileAsync('ffprobe', ['-v','error','-rtsp_transport','tcp','-stimeout','2000000','-show_streams','-of','json', url], { timeout: 5000, maxBuffer: 1024*1024 });
      findings.push({ path:p, ok:true, out:(stdout||'').slice(0,300) });
    } catch (e:any) {
      const msg = String(e?.stderr || e?.message || e).slice(0,180);
      findings.push({ path:p, ok:false, error: msg });
    }
  }
  return { ok:true, supported:false, reason:'ONVIF replay/search não exposto por esta câmera; gravações parecem proprietárias/SD local. Nenhum path RTSP de playback confirmado.', findings };
}
