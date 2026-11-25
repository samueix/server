import net from 'net';

export interface MikrotikConfig { host: string; port: number; user: string; password: string; timeoutMs?: number; }
export interface RosSentence { [k: string]: string; _type: string; }

export function mikrotikCfgFromEnv(): MikrotikConfig {
  return {
    host: process.env.MIKROTIK_HOST || '192.168.100.39',
    port: Number(process.env.MIKROTIK_PORT || 8728),
    user: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASS || '',
    timeoutMs: 10000,
  };
}

class RosClient {
  private s: net.Socket | null = null;
  private buf = Buffer.alloc(0);
  private pending: { resolve: (v: RosSentence[]) => void; reject: (e: any) => void; sentences: RosSentence[]; cur: RosSentence | null; timer: NodeJS.Timeout } | null = null;
  private queue: Array<{ words: string[]; resolve: (v: RosSentence[]) => void; reject: (e: any) => void }> = [];
  private cfg: MikrotikConfig;
  constructor(cfg: MikrotikConfig) { this.cfg = cfg; }
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.cfg.host, port: this.cfg.port });
      this.s = s;
      const to = setTimeout(() => { s.destroy(); reject(new Error('MikroTik timeout')); }, this.cfg.timeoutMs || 10000);
      s.on('connect', () => { clearTimeout(to); resolve(); });
      s.on('error', (e) => { clearTimeout(to); this.failAll(e); reject(e); });
      s.on('close', () => this.failAll(new Error('MikroTik connection closed')));
      s.on('data', (d) => this.onData(d));
    });
  }
  private failAll(e: any) { if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(e); this.pending = null; } while (this.queue.length) this.queue.shift()!.reject(e); }
  private onData(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    while (true) {
      const lenRes = this.readLen(); if (!lenRes) return;
      const [len, off] = lenRes; if (this.buf.length < off + len) return;
      const word = len === 0 ? '' : this.buf.subarray(off, off + len).toString('utf8');
      this.buf = this.buf.subarray(off + len);
      if (!this.pending) continue;
      if (word === '') {
        if (this.pending.cur) {
          this.pending.sentences.push(this.pending.cur);
          const t = this.pending.cur._type; this.pending.cur = null;
          if (t === '!done' || t === '!trap' || t === '!fatal') {
            const p = this.pending; this.pending = null; clearTimeout(p.timer); p.resolve(p.sentences); this.flush();
          }
        }
      } else {
        if (word.startsWith('!')) this.pending.cur = { _type: word };
        else if (this.pending.cur && word.startsWith('=')) { const i = word.indexOf('=', 1); if (i > 0) this.pending.cur[word.slice(1, i)] = word.slice(i + 1); else this.pending.cur[word.slice(1)] = ''; }
      }
    }
  }
  private readLen(): [number, number] | null {
    if (this.buf.length < 1) return null; const c = this.buf[0];
    if ((c & 0x80) === 0) return [c, 1];
    if ((c & 0xC0) === 0x80) { if (this.buf.length < 2) return null; return [((c & ~0xC0) << 8) + this.buf[1], 2]; }
    if ((c & 0xE0) === 0xC0) { if (this.buf.length < 3) return null; return [((c & ~0xE0) << 16) + (this.buf[1] << 8) + this.buf[2], 3]; }
    if ((c & 0xF0) === 0xE0) { if (this.buf.length < 4) return null; return [((c & ~0xF0) << 24) + (this.buf[1] << 16) + (this.buf[2] << 8) + this.buf[3], 4]; }
    if (this.buf.length < 5) return null; return [this.buf.readUInt32BE(1), 5];
  }
  private sendLen(n: number) {
    let b: Buffer;
    if (n < 0x80) b = Buffer.from([n]);
    else if (n < 0x4000) { n |= 0x8000; b = Buffer.from([(n >> 8) & 0xff, n & 0xff]); }
    else if (n < 0x200000) { n |= 0xC00000; b = Buffer.from([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]); }
    else if (n < 0x10000000) { n |= 0xE0000000; b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); }
    else { b = Buffer.alloc(5); b[0] = 0xF0; b.writeUInt32BE(n >>> 0, 1); }
    this.s!.write(b);
  }
  talk(words: string[]): Promise<RosSentence[]> {
    return new Promise((resolve, reject) => { this.queue.push({ words, resolve, reject }); this.flush(); });
  }
  private flush() {
    if (this.pending || !this.queue.length || !this.s) return;
    const q = this.queue.shift()!;
    const timer = setTimeout(() => { if (this.pending) { this.pending.reject(new Error('MikroTik command timeout')); this.pending = null; this.flush(); } }, this.cfg.timeoutMs || 10000);
    this.pending = { resolve: q.resolve, reject: q.reject, sentences: [], cur: null, timer };
    for (const w of q.words) { const bw = Buffer.from(w, 'utf8'); this.sendLen(bw.length); this.s!.write(bw); }
    this.sendLen(0);
  }
  close() { try { this.s?.destroy(); } catch {} this.s = null; this.failAll(new Error('closed')); }
}

export async function withMikrotik<T>(fn: (c: RosClient) => Promise<T>, cfg = mikrotikCfgFromEnv()): Promise<T> {
  const c = new RosClient(cfg);
  await c.connect();
  try {
    const login = await c.talk(['/login', `=name=${cfg.user}`, `=password=${cfg.password}`]);
    if (login.some(s => s._type === '!trap')) throw new Error(login.map(s => (s as any).message || s._type).join('; '));
    return await fn(c);
  } finally { c.close(); }
}

export function rosRows(sentences: RosSentence[]) { return sentences.filter(s => s._type === '!re').map(({ _type, ...r }) => r); }
export function rosOne(sentences: RosSentence[]) { return rosRows(sentences)[0] || null; }
export async function rosSafe(c: RosClient, cmd: string[]) { try { return await c.talk(cmd); } catch { return []; } }

export async function mikrotikGetStatus() {
  const cfg = mikrotikCfgFromEnv();
  return await withMikrotik(async (c) => {
    const identity = await rosSafe(c, ['/system/identity/print']);
    const resource = await rosSafe(c, ['/system/resource/print']);
    const routerboard = await rosSafe(c, ['/system/routerboard/print']);
    const addresses = await rosSafe(c, ['/ip/address/print']);
    const interfaces = await rosSafe(c, ['/interface/print']);
    const leases = await rosSafe(c, ['/ip/dhcp-server/lease/print']);
    const wifi = await rosSafe(c, ['/interface/wireless/registration-table/print']);
    const arp = await rosSafe(c, ['/ip/arp/print']);
    const dns = await rosSafe(c, ['/ip/dns/print']);
    const routes = await rosSafe(c, ['/ip/route/print']);
    const nat = await rosSafe(c, ['/ip/firewall/nat/print']);
    const firewall = await rosSafe(c, ['/ip/firewall/filter/print']);
    const dhcpServers = await rosSafe(c, ['/ip/dhcp-server/print']);
    const bridgePorts = await rosSafe(c, ['/interface/bridge/port/print']);
    const bridgeHosts = await rosSafe(c, ['/interface/bridge/host/print']);
    const capsman = await rosSafe(c, ['/caps-man/registration-table/print']);
    const services = await rosSafe(c, ['/ip/service/print']);
    return {
      ok: true, host: cfg.host, port: cfg.port,
      identity: rosOne(identity), resource: rosOne(resource), routerboard: rosOne(routerboard),
      addresses: rosRows(addresses), interfaces: rosRows(interfaces), leases: rosRows(leases),
      wifi: [...rosRows(wifi), ...rosRows(capsman)], arp: rosRows(arp), dns: rosOne(dns), routes: rosRows(routes),
      nat: rosRows(nat), firewall: rosRows(firewall), dhcpServers: rosRows(dhcpServers),
      bridgePorts: rosRows(bridgePorts), bridgeHosts: rosRows(bridgeHosts), services: rosRows(services),
      fetchedAt: new Date().toISOString(),
    };
  }, cfg);
}

export async function mikrotikTestConnection() {
  try { const s = await mikrotikGetStatus(); return { ok: true, identity: s.identity?.name, version: s.resource?.version, board: s.resource?.['board-name'] }; }
  catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}
