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
    const ethernet = await rosSafe(c, ['/interface/ethernet/print']);
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
      addresses: rosRows(addresses), interfaces: rosRows(interfaces), ethernet: rosRows(ethernet), leases: rosRows(leases),
      wifi: [...rosRows(wifi), ...rosRows(capsman)], arp: rosRows(arp), dns: rosOne(dns), routes: rosRows(routes),
      nat: rosRows(nat), firewall: rosRows(firewall), dhcpServers: rosRows(dhcpServers),
      bridgePorts: rosRows(bridgePorts), bridgeHosts: rosRows(bridgeHosts), services: rosRows(services),
      fetchedAt: new Date().toISOString(),
    };
  }, cfg);
}

export async function mikrotikGetBandwidth(knownIps: string[] = []) {
  const known = new Set(knownIps.map(s => String(s || '').trim()).filter(Boolean));
  return await withMikrotik(async (c) => {
    const conns = rosRows(await rosSafe(c, ['/ip/firewall/connection/print']));
    const byIp = new Map<string, { rx_bps: number; tx_bps: number; connections: number }>();
    const ipOnly = (v: any) => String(v || '').split(':')[0].trim();
    for (const con of conns) {
      const orig = Number(con['orig-rate'] || 0);
      const repl = Number(con['repl-rate'] || 0);
      if (!orig && !repl) continue;
      const src = ipOnly(con['src-address']);
      const dst = ipOnly(con['reply-dst-address']);
      const srcKnown = known.size ? known.has(src) : Boolean(src);
      const dstKnown = known.size ? known.has(dst) : false;
      if (srcKnown && src) {
        const r = byIp.get(src) || { rx_bps: 0, tx_bps: 0, connections: 0 };
        r.tx_bps += orig; r.rx_bps += repl; r.connections++;
        byIp.set(src, r);
      }
      if (dstKnown && dst && dst !== src) {
        const r = byIp.get(dst) || { rx_bps: 0, tx_bps: 0, connections: 0 };
        r.rx_bps += orig; r.tx_bps += repl; r.connections++;
        byIp.set(dst, r);
      }
    }
    return {
      ok: true,
      ts: new Date().toISOString(),
      source: 'connection-tracking',
      devices: Array.from(byIp.entries()).map(([ip, v]) => ({ ip, ...v }))
    };
  });
}

export async function mikrotikTestConnection() {
  try { const s = await mikrotikGetStatus(); return { ok: true, identity: s.identity?.name, version: s.resource?.version, board: s.resource?.['board-name'] }; }
  catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}

export async function mikrotikBlockDevice(mac: string, comment = 'blocked by server-panel') {
  const m = mac.toUpperCase();
  return await withMikrotik(async (c) => {
    const exists = rosRows(await rosSafe(c, ['/ip/firewall/address-list/print', `?address=${m}`, '?list=NC_BLOCKED'])).length > 0
      || rosRows(await rosSafe(c, ['/ip/firewall/address-list/print', `?comment=${comment}`, '?list=NC_BLOCKED'])).some(r => String(r.address).toUpperCase()===m || String(r.comment||'').includes(m));
    if (!exists) await c.talk(['/ip/firewall/address-list/add', '=list=NC_BLOCKED', `=address=${m}`, `=comment=${comment} ${m}`]);
    const fw = rosRows(await rosSafe(c, ['/ip/firewall/filter/print', '?comment=NC_BLOCKED_DROP']));
    if (!fw.length) await c.talk(['/ip/firewall/filter/add', '=chain=forward', '=action=drop', '=src-address-list=NC_BLOCKED', '=comment=NC_BLOCKED_DROP', '=place-before=0']);
    return { ok: true, mac: m };
  });
}

export async function mikrotikUnblockDevice(mac: string) {
  const m = mac.toUpperCase();
  return await withMikrotik(async (c) => {
    const items = rosRows(await rosSafe(c, ['/ip/firewall/address-list/print', '?list=NC_BLOCKED']));
    for (const it of items) if (String(it.address||'').toUpperCase()===m || String(it.comment||'').includes(m)) await c.talk(['/ip/firewall/address-list/remove', `=.id=${it['.id']}`]);
    const left = rosRows(await rosSafe(c, ['/ip/firewall/address-list/print', '?list=NC_BLOCKED']));
    if (!left.length) {
      const fw = rosRows(await rosSafe(c, ['/ip/firewall/filter/print', '?comment=NC_BLOCKED_DROP']));
      for (const f of fw) await c.talk(['/ip/firewall/filter/remove', `=.id=${f['.id']}`]);
    }
    return { ok: true, mac: m };
  });
}

export async function mikrotikRunPing(target: string, count = 4) {
  const safeTarget = String(target||'').trim(); if (!/^[a-zA-Z0-9.\-:]+$/.test(safeTarget)) throw new Error('target inválido');
  return await withMikrotik(async (c) => {
    const r = rosRows(await c.talk(['/ping', `=address=${safeTarget}`, `=count=${Math.max(1,Math.min(10,count))}`]));
    return { ok: true, target: safeTarget, results: r };
  });
}

export async function mikrotikMakeLeaseStatic(mac: string, address?: string, comment?: string) {
  const m = mac.toUpperCase();
  return await withMikrotik(async (c) => {
    const leases = rosRows(await c.talk(['/ip/dhcp-server/lease/print']));
    const lease = leases.find(l => String(l['mac-address']||'').toUpperCase()===m);
    if (!lease) throw new Error('Lease não encontrado para MAC');
    const id = lease['.id'];
    const words = ['/ip/dhcp-server/lease/make-static', `=.id=${id}`];
    await c.talk(words);
    const setWords = ['/ip/dhcp-server/lease/set', `=.id=${id}`];
    if (address) setWords.push(`=address=${address}`);
    if (comment) setWords.push(`=comment=${comment}`);
    if (setWords.length>2) await c.talk(setWords);
    return { ok:true, mac:m, id };
  });
}

export async function mikrotikTraceroute(target: string) {
  const safeTarget = String(target||'').trim(); if (!/^[a-zA-Z0-9.\-:]+$/.test(safeTarget)) throw new Error('target inválido');
  return await withMikrotik(async (c) => {
    const r = rosRows(await c.talk(['/tool/traceroute', `=address=${safeTarget}`, '=count=1', '=duration=5']));
    const results = r.map((h: any, i: number) => ({
      hop: i + 1,
      address: String(h.address || h['ip-address'] || '').trim(),
      loss: Number(h.loss ?? 0),
      sent: Number(h.sent ?? 1),
      last: Number(h.last ?? h['last-rtt'] ?? 0),
      avg: Number(h.avg ?? h['avg-rtt'] ?? 0),
      best: Number(h.best ?? h['min-rtt'] ?? 0),
      worst: Number(h.worst ?? h['max-rtt'] ?? 0),
      'std-dev': Number(h['std-dev'] ?? 0),
      status: String(h.status || '')
    })).filter((h: any) => h.address || h.sent > 0 || h.status);
    return { ok:true, target:safeTarget, results };
  });
}

export async function mikrotikDnsLookup(name: string) {
  const safe = String(name||'').trim(); if (!/^[a-zA-Z0-9.\-:]+$/.test(safe)) throw new Error('name inválido');
  return await withMikrotik(async (c) => {
    const sentences = await c.talk(['/resolve', `=name=${safe}`]);
    const trap = sentences.find(s => s._type === '!trap');
    if (!trap) {
      const rows = rosRows(sentences);
      const ret = sentences.filter(s=>s._type==='!done').flatMap(s => Object.entries(s).filter(([k])=>k!=='_type').map(([k,v])=>({[k]:v})));
      return { ok:true, name:safe, results: rows.length?rows:ret, raw: sentences, method:'resolve' };
    }
    const ping = rosRows(await rosSafe(c, ['/ping', `=address=${safe}`, '=count=1']));
    const ips = Array.from(new Set(ping.map(p => String(p.host || '')).filter(h => h && h !== safe)));
    return {
      ok: true,
      name: safe,
      results: ips.map(ip => ({ address: ip, source: 'ping/roteador' })),
      raw: sentences,
      method: 'ping-fallback',
      note: 'RouterOS 7.5 não aceitou /resolve via API; a resolução foi validada pelo ping do roteador.',
    };
  });
}

function isIpLike(v: string) { return /^[0-9a-fA-F:.]+$/.test(v) && (v.includes('.') || v.includes(':')); }

export async function mikrotikGetDnsSettings() {
  return await withMikrotik(async (c) => {
    const dns = rosOne(await rosSafe(c, ['/ip/dns/print']));
    const networks = rosRows(await rosSafe(c, ['/ip/dhcp-server/network/print']));
    return { ok: true, dns, dhcpNetworks: networks };
  });
}

export async function mikrotikSetDnsServers(servers: string[], opts?: { dhcpDns?: string; applyDhcp?: boolean }) {
  const list = (servers || []).map(s => String(s || '').trim()).filter(Boolean);
  if (!list.length) throw new Error('informe ao menos um servidor DNS');
  if (!list.every(isIpLike)) throw new Error('servidor DNS inválido');
  const dhcpDns = String(opts?.dhcpDns || '').trim();
  if (dhcpDns && !isIpLike(dhcpDns)) throw new Error('DNS DHCP inválido');
  const applyDhcp = opts?.applyDhcp !== false && Boolean(dhcpDns);
  return await withMikrotik(async (c) => {
    const prevDns = rosOne(await rosSafe(c, ['/ip/dns/print']));
    const networks = rosRows(await rosSafe(c, ['/ip/dhcp-server/network/print']));
    const previous = {
      servers: prevDns?.servers || '',
      allowRemoteRequests: prevDns?.['allow-remote-requests'] || '',
      dhcpNetworks: networks.map(n => ({ id: n['.id'], address: n.address, dnsServer: n['dns-server'] || '' })),
    };
    await c.talk(['/ip/dns/set', `=servers=${list.join(',')}`, '=allow-remote-requests=yes']);
    if (applyDhcp) {
      for (const n of networks) {
        const addr = String(n.address || '');
        if (addr.startsWith('192.168.88.') || addr.startsWith('192.168.88/')) {
          await c.talk(['/ip/dhcp-server/network/set', `=.id=${n['.id']}`, `=dns-server=${dhcpDns}`]);
        }
      }
    }
    const afterDns = rosOne(await rosSafe(c, ['/ip/dns/print']));
    const afterNetworks = rosRows(await rosSafe(c, ['/ip/dhcp-server/network/print']));
    return {
      ok: true,
      previous,
      dns: afterDns,
      dhcpNetworks: afterNetworks,
      applied: { servers: list.join(','), dhcpDns: applyDhcp ? dhcpDns : null },
    };
  });
}

export async function mikrotikGetLogs(linesCount = 100, filterTerm = '') {
  const count = Math.min(Math.max(Number(linesCount) || 100, 10), 500);
  return await withMikrotik(async (c) => {
    const rows = rosRows(await rosSafe(c, ['/log/print']));
    const rawAll = rows.map(r => `${r.time || ''} ${r.topics || ''} ${r.message || ''}`.replace(/\s+/g, ' ').trim());
    const term = String(filterTerm || '').trim().toLowerCase();
    const filtered = term ? rawAll.filter(l => l.toLowerCase().includes(term)) : rawAll;
    const sliced = filtered.slice(-count);
    const levelOf = (r: Record<string, string>) => {
      const t = `${r.topics || ''} ${r.message || ''}`.toLowerCase();
      if (t.includes('error') || t.includes('critical') || t.includes('fail')) return 'error';
      if (t.includes('warning') || t.includes('drop')) return 'warn';
      if (t.includes('debug')) return 'debug';
      return 'info';
    };
    const logs = sliced.map((line, idx) => {
      const row = rows[rows.length - sliced.length + idx] || {};
      return {
        id: `mt-${Date.now()}-${idx}`,
        timestamp: row.time || '',
        process: String(row.topics || 'routeros').split(',')[0],
        message: row.message || line,
        raw: line,
        level: levelOf(row as Record<string, string>),
      };
    });
    return {
      source: 'mikrotik',
      source_path: 'RouterOS /log',
      file_exists: true,
      total_lines: rawAll.length,
      returned_lines: logs.length,
      last_updated: new Date().toLocaleTimeString('pt-BR'),
      logs,
      raw_lines: sliced,
    };
  });
}
