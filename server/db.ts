import fs from 'fs';
import path from 'path';

export interface DomainAnalysis {
  domain: string;
  organization: string;
  category: string;
  purpose: string;
  tracker: boolean;
  telemetry: boolean;
  analytics: boolean;
  malware: boolean;
  phishing: boolean;
  cdn?: boolean;
  legitimate?: boolean;
  risk: 'baixo' | 'médio' | 'alto' | 'crítico' | 'desconhecido';
  explanation: string;
  is_blocked_by_adguard?: boolean;
  block_count?: number;
  analyzed_at?: string;
  source?: 'cache' | 'ai' | 'seed';
}

const DATA_DIR = path.join(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'adguard_ai.sqlite');
const JSON_BACKUP_FILE = path.join(DATA_DIR, 'adguard_ai_cache.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e: any) {
  console.warn('[Cache] Aviso: Não foi possível criar diretório de dados local:', e.message);
}

let sqliteDb: any = null;
let memoryCache: Map<string, DomainAnalysis> = new Map();
export function getSqliteDb() { return sqliteDb; }

// Initialize native SQLite or JSON backup
try {
  // Safe dynamic require that functions seamlessly in both CJS bundle and TSX
  const getSqlite = () => {
    try {
      // @ts-ignore
      if (typeof require !== 'undefined') return require('node:sqlite');
    } catch {}
    return null;
  };
  const sqliteModule = getSqlite();
  const DatabaseSync = sqliteModule?.DatabaseSync;
  if (DatabaseSync) {
    sqliteDb = new DatabaseSync(SQLITE_FILE);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS domain_analyses (
      domain TEXT PRIMARY KEY,
      organization TEXT,
      category TEXT,
      purpose TEXT,
      tracker INTEGER DEFAULT 0,
      telemetry INTEGER DEFAULT 0,
      analytics INTEGER DEFAULT 0,
      malware INTEGER DEFAULT 0,
      phishing INTEGER DEFAULT 0,
      cdn INTEGER DEFAULT 0,
      legitimate INTEGER DEFAULT 0,
      risk TEXT DEFAULT 'baixo',
      explanation TEXT,
      is_blocked_by_adguard INTEGER DEFAULT 1,
      block_count INTEGER DEFAULT 1,
      analyzed_at TEXT,
      source TEXT DEFAULT 'cache'
    );
    CREATE INDEX IF NOT EXISTS idx_category ON domain_analyses(category);
    CREATE INDEX IF NOT EXISTS idx_risk ON domain_analyses(risk);
  `);
    initMikrotikTables(sqliteDb);
    console.log('[SQLite] Conectado com sucesso ao banco adguard_ai.sqlite');
  } else {
    loadJsonCache();
  }
} catch (err: any) {
  console.warn('[SQLite Fallback] Usando cache JSON local:', err.message);
  loadJsonCache();
}

function loadJsonCache() {
  try {
    if (fs.existsSync(JSON_BACKUP_FILE)) {
      const raw = fs.readFileSync(JSON_BACKUP_FILE, 'utf-8');
      const list: DomainAnalysis[] = JSON.parse(raw);
      list.forEach(item => memoryCache.set(item.domain.toLowerCase(), item));
    }
  } catch (err) {
    console.error('Erro ao ler cache JSON:', err);
  }
}

function persistJsonCache() {
  try {
    const list = Array.from(memoryCache.values());
    fs.writeFileSync(JSON_BACKUP_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar cache JSON:', err);
  }
}

export function getAnalyzedDomain(domain: string): DomainAnalysis | null {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return null;

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare('SELECT * FROM domain_analyses WHERE domain = ?');
      const row = stmt.get(normalized);
      if (row) {
        return {
          domain: row.domain,
          organization: row.organization,
          category: row.category,
          purpose: row.purpose,
          tracker: Boolean(row.tracker),
          telemetry: Boolean(row.telemetry),
          analytics: Boolean(row.analytics),
          malware: Boolean(row.malware),
          phishing: Boolean(row.phishing),
          cdn: Boolean(row.cdn),
          legitimate: Boolean(row.legitimate),
          risk: row.risk,
          explanation: row.explanation,
          is_blocked_by_adguard: Boolean(row.is_blocked_by_adguard),
          block_count: row.block_count,
          analyzed_at: row.analyzed_at,
          source: row.source
        };
      }
    } catch (err) {
      console.error('Erro na consulta SQLite:', err);
    }
  }

  return memoryCache.get(normalized) || null;
}

export function getAllAnalyzedDomains(): DomainAnalysis[] {
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare('SELECT * FROM domain_analyses ORDER BY block_count DESC, analyzed_at DESC');
      const rows = stmt.all();
      return rows.map((row: any) => ({
        domain: row.domain,
        organization: row.organization,
        category: row.category,
        purpose: row.purpose,
        tracker: Boolean(row.tracker),
        telemetry: Boolean(row.telemetry),
        analytics: Boolean(row.analytics),
        malware: Boolean(row.malware),
        phishing: Boolean(row.phishing),
        cdn: Boolean(row.cdn),
        legitimate: Boolean(row.legitimate),
        risk: row.risk,
        explanation: row.explanation,
        is_blocked_by_adguard: Boolean(row.is_blocked_by_adguard),
        block_count: row.block_count,
        analyzed_at: row.analyzed_at,
        source: row.source
      }));
    } catch (err) {
      console.error('Erro ao listar análises SQLite:', err);
    }
  }

  return Array.from(memoryCache.values()).sort((a, b) => (b.block_count || 0) - (a.block_count || 0));
}

export function saveAnalyzedDomain(item: DomainAnalysis): void {
  const normalized = item.domain.trim().toLowerCase();
  const entry: DomainAnalysis = {
    ...item,
    domain: normalized,
    analyzed_at: item.analyzed_at || new Date().toISOString()
  };

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO domain_analyses (
          domain, organization, category, purpose, tracker, telemetry,
          analytics, malware, phishing, cdn, legitimate, risk, explanation,
          is_blocked_by_adguard, block_count, analyzed_at, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(domain) DO UPDATE SET
          organization = excluded.organization,
          category = excluded.category,
          purpose = excluded.purpose,
          tracker = excluded.tracker,
          telemetry = excluded.telemetry,
          analytics = excluded.analytics,
          malware = excluded.malware,
          phishing = excluded.phishing,
          cdn = excluded.cdn,
          legitimate = excluded.legitimate,
          risk = excluded.risk,
          explanation = excluded.explanation,
          is_blocked_by_adguard = excluded.is_blocked_by_adguard,
          block_count = excluded.block_count,
          analyzed_at = excluded.analyzed_at,
          source = excluded.source
      `);

      stmt.run(
        entry.domain,
        entry.organization || 'Desconhecida',
        entry.category || 'Outros',
        entry.purpose || 'Não especificada',
        entry.tracker ? 1 : 0,
        entry.telemetry ? 1 : 0,
        entry.analytics ? 1 : 0,
        entry.malware ? 1 : 0,
        entry.phishing ? 1 : 0,
        entry.cdn ? 1 : 0,
        entry.legitimate ? 1 : 0,
        entry.risk || 'baixo',
        entry.explanation || '',
        entry.is_blocked_by_adguard !== false ? 1 : 0,
        entry.block_count || 1,
        entry.analyzed_at,
        entry.source || 'ai'
      );
    } catch (err) {
      console.error('Erro ao salvar no SQLite:', err);
    }
  }

  memoryCache.set(normalized, entry);
  persistJsonCache();
}

export function saveBatchAnalyzedDomains(items: DomainAnalysis[]): void {
  for (const item of items) {
    saveAnalyzedDomain(item);
  }
}

// Seed initial verified data from real top AdGuard Home telemetry
const INITIAL_VERIFIED_SEEDS: DomainAnalysis[] = [
  {
    domain: 'googleads.g.doubleclick.net',
    organization: 'Google DoubleClick',
    category: 'Publicidade',
    purpose: 'Distribuição e veiculação de anúncios patrocinados da rede Google Ads',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Servidor central de leilão e entrega de banners publicitários da rede Google DoubleClick.',
    is_blocked_by_adguard: true,
    block_count: 20,
    source: 'seed'
  },
  {
    domain: 'ad.doubleclick.net',
    organization: 'Google DoubleClick',
    category: 'Publicidade',
    purpose: 'Rastreamento de impressões de anúncios e conversão de cliques publicitários',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Plataforma de ad tracking e monetização da Google para sites e aplicativos terceiros.',
    is_blocked_by_adguard: true,
    block_count: 20,
    source: 'seed'
  },
  {
    domain: 'tpc.googlesyndication.com',
    organization: 'Google Syndication',
    category: 'Publicidade',
    purpose: 'Hospedagem de criativos e scripts de anúncios dinâmicos do Google AdSense',
    tracker: true,
    telemetry: false,
    analytics: false,
    malware: false,
    phishing: false,
    cdn: true,
    legitimate: false,
    risk: 'baixo',
    explanation: 'CDN proprietária de carregamento de peças publicitárias visuais e interativas do Google.',
    is_blocked_by_adguard: true,
    block_count: 14,
    source: 'seed'
  },
  {
    domain: 'ade.googlesyndication.com',
    organization: 'Google Syndication',
    category: 'Publicidade',
    purpose: 'Entrega de leilão de publicidade programática para navegadores web',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Mecanismo de leilão em tempo real do ecossistema Google AdSense/AdExchange.',
    is_blocked_by_adguard: true,
    block_count: 12,
    source: 'seed'
  },
  {
    domain: 'clienttracing-pa.googleapis.com',
    organization: 'Google Cloud Platform',
    category: 'Telemetria',
    purpose: 'Telemetria de performance de requisições de clientes para APIs do ecossistema Google',
    tracker: false,
    telemetry: true,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: true,
    risk: 'baixo',
    explanation: 'Serviço de rastreamento de latência e tracing de chamadas internas da infraestrutura Google APIs.',
    is_blocked_by_adguard: true,
    block_count: 10,
    source: 'seed'
  },
  {
    domain: 'pagead2.googlesyndication.com',
    organization: 'Google AdSense',
    category: 'Publicidade',
    purpose: 'Biblioteca javascript principal para renderização de anúncios em páginas web',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Script do Google AdSense injetado em sites para exibir publicidade aos visitantes.',
    is_blocked_by_adguard: true,
    block_count: 6,
    source: 'seed'
  },
  {
    domain: 'sb.scorecardresearch.com',
    organization: 'Comscore / Full Circle Studies',
    category: 'Rastreamento',
    purpose: 'Coleta de dados de audiência web e medição de tráfego de mercado',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Domínio de medição de audiência e rastreamento de comportamento de navegação mantido pela Comscore.',
    is_blocked_by_adguard: true,
    block_count: 5,
    source: 'seed'
  },
  {
    domain: 'functional.events.data.microsoft.com',
    organization: 'Microsoft Corporation',
    category: 'Telemetria',
    purpose: 'Envio de telemetria funcional, diagnóstico de erros e uso do sistema Windows/Office',
    tracker: false,
    telemetry: true,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: true,
    risk: 'baixo',
    explanation: 'Endpoint oficial de telemetria da Microsoft para coleta de diagnósticos operacionais e estabilidade do Windows.',
    is_blocked_by_adguard: true,
    block_count: 3,
    source: 'seed'
  },
  {
    domain: 'browser.events.data.msn.com',
    organization: 'Microsoft MSN',
    category: 'Telemetria',
    purpose: 'Métricas de navegação, telemetria de feeds de notícias e eventos do Microsoft Edge/MSN',
    tracker: true,
    telemetry: true,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: true,
    risk: 'baixo',
    explanation: 'Domínio responsável por coletar estatísticas de uso e interação com cartões de conteúdo no portal MSN.',
    is_blocked_by_adguard: true,
    block_count: 3,
    source: 'seed'
  },
  {
    domain: 'bzr.openai.com',
    organization: 'OpenAI',
    category: 'Telemetria',
    purpose: 'Telemetria de performance e relatórios de clientes ChatGPT/OpenAI',
    tracker: false,
    telemetry: true,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: true,
    risk: 'baixo',
    explanation: 'Servidor de telemetria e diagnóstico operacional utilizado pela aplicação do ChatGPT.',
    is_blocked_by_adguard: true,
    block_count: 2,
    source: 'seed'
  },
  {
    domain: 'c.msn.com',
    organization: 'Microsoft MSN',
    category: 'Publicidade',
    purpose: 'Entrega de publicidade segmentada e contadores de cliques nos serviços MSN',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Servidor de entrega e rastreamento de anúncios publicitários associado à rede Microsoft Advertising.',
    is_blocked_by_adguard: true,
    block_count: 1,
    source: 'seed'
  },
  {
    domain: 'srtb.msn.com',
    organization: 'Microsoft MSN',
    category: 'Publicidade',
    purpose: 'Real-Time Bidding (RTB) e leilão programático de anúncios',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Infraestrutura de leilão instantâneo de publicidade (RTB) utilizada para veicular anúncios na rede MSN.',
    is_blocked_by_adguard: true,
    block_count: 1,
    source: 'seed'
  },
  {
    domain: 'dit.whatsapp.net',
    organization: 'Meta / WhatsApp',
    category: 'Telemetria',
    purpose: 'Telemetria de qualidade de chamadas e diagnóstico de conectividade do aplicativo WhatsApp',
    tracker: false,
    telemetry: true,
    analytics: false,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: true,
    risk: 'baixo',
    explanation: 'Serviço de diagnóstico de integridade e telemetria operacional mantido pelo WhatsApp.',
    is_blocked_by_adguard: true,
    block_count: 1,
    source: 'seed'
  },
  {
    domain: 'beacons.gcp.gvt2.com',
    organization: 'Google / YouTube',
    category: 'Telemetria',
    purpose: 'Sinalizadores de medição de latência e qualidade de streaming de vídeo',
    tracker: false,
    telemetry: true,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: true,
    legitimate: true,
    risk: 'baixo',
    explanation: 'Infraestrutura da Google para envio de beacons de telemetria de entrega de mídia e performance de CDN.',
    is_blocked_by_adguard: true,
    block_count: 1,
    source: 'seed'
  },
  {
    domain: 'c.bing.com',
    organization: 'Microsoft Bing',
    category: 'Rastreamento',
    purpose: 'Rastreamento de cliques em resultados de busca e personalização publicitária',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Servidor de cliques e conversões de anúncios do mecanismo de busca Microsoft Bing.',
    is_blocked_by_adguard: true,
    block_count: 1,
    source: 'seed'
  },
  {
    domain: 'doubleclick.net',
    organization: 'Google',
    category: 'Publicidade',
    purpose: 'Entrega de anúncios e medição de campanhas em tempo real',
    tracker: true,
    telemetry: false,
    analytics: true,
    malware: false,
    phishing: false,
    cdn: false,
    legitimate: false,
    risk: 'baixo',
    explanation: 'Domínio central associado à infraestrutura de publicidade e remarketing do Google DoubleClick.',
    is_blocked_by_adguard: true,
    block_count: 10,
    source: 'seed'
  }
];

// Seed on startup if database is fresh
for (const seed of INITIAL_VERIFIED_SEEDS) {
  if (!getAnalyzedDomain(seed.domain)) {
    saveAnalyzedDomain(seed);
  }
}

function initMikrotikTables(db: any) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mikrotik_devices (
        mac TEXT PRIMARY KEY, ip TEXT, hostname TEXT, vendor TEXT, device_type TEXT,
        nickname TEXT, interface TEXT, connection TEXT, ssid TEXT, signal_dbm REAL,
        tx_rate TEXT, rx_rate TEXT, first_seen TEXT, last_seen TEXT, last_ip TEXT,
        online INTEGER DEFAULT 0, blocked INTEGER DEFAULT 0, trusted INTEGER DEFAULT 0,
        total_uptime_seconds INTEGER DEFAULT 0, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS mikrotik_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, event_type TEXT, mac TEXT, ip TEXT, hostname TEXT, details TEXT
      );
      CREATE TABLE IF NOT EXISTS mikrotik_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, resource_json TEXT, interfaces_json TEXT, leases_json TEXT, wifi_json TEXT, arp_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mt_events_ts ON mikrotik_events(ts);
      CREATE INDEX IF NOT EXISTS idx_mt_snap_ts ON mikrotik_snapshots(ts);
    `);
  } catch (e) { console.warn('[MikroTik DB] init failed', e); }
}

export function upsertMikrotikDevices(devices: any[]) {
  if (!sqliteDb) return;
  const now = new Date().toISOString();
  const stmt = sqliteDb.prepare(`
    INSERT INTO mikrotik_devices (mac,ip,hostname,vendor,device_type,nickname,interface,connection,ssid,signal_dbm,tx_rate,rx_rate,first_seen,last_seen,last_ip,online,blocked,trusted,notes)
    VALUES (@mac,@ip,@hostname,@vendor,@device_type,@nickname,@interface,@connection,@ssid,@signal_dbm,@tx_rate,@rx_rate,@first_seen,@last_seen,@last_ip,@online,@blocked,@trusted,@notes)
    ON CONFLICT(mac) DO UPDATE SET ip=COALESCE(excluded.ip,mikrotik_devices.ip), hostname=COALESCE(NULLIF(excluded.hostname,''),mikrotik_devices.hostname), vendor=COALESCE(excluded.vendor,mikrotik_devices.vendor),
      device_type=COALESCE(excluded.device_type,mikrotik_devices.device_type), interface=COALESCE(excluded.interface,mikrotik_devices.interface), connection=COALESCE(excluded.connection,mikrotik_devices.connection), ssid=COALESCE(excluded.ssid,mikrotik_devices.ssid),
      signal_dbm=excluded.signal_dbm, tx_rate=excluded.tx_rate, rx_rate=excluded.rx_rate, last_seen=excluded.last_seen, last_ip=COALESCE(excluded.ip,mikrotik_devices.last_ip), online=excluded.online,
      blocked=excluded.blocked
  `);
  for (const d of devices) stmt.run({
    mac: d.mac ?? null,
    ip: d.ip ?? null,
    hostname: d.hostname ?? null,
    vendor: d.vendor ?? null,
    device_type: d.device_type ?? null,
    nickname: d.nickname ?? null,
    interface: d.interface ?? null,
    connection: d.connection ?? null,
    ssid: d.ssid ?? null,
    signal_dbm: d.signal_dbm ?? null,
    tx_rate: d.tx_rate ?? null,
    rx_rate: d.rx_rate ?? null,
    first_seen: d.first_seen || now,
    last_seen: now,
    last_ip: d.last_ip ?? d.ip ?? null,
    online: d.online ? 1 : 0,
    blocked: d.blocked ? 1 : 0,
    trusted: d.trusted ? 1 : 0,
    notes: d.notes ?? null,
  });
}
export function listMikrotikDevices() {
  if (!sqliteDb) return [];
  return sqliteDb.prepare('SELECT * FROM mikrotik_devices ORDER BY online DESC, last_seen DESC').all();
}
export function addMikrotikEvent(ev: any) {
  if (!sqliteDb) return;
  sqliteDb.prepare('INSERT INTO mikrotik_events (ts,event_type,mac,ip,hostname,details) VALUES (?,?,?,?,?,?)')
    .run(ev.ts || new Date().toISOString(), ev.event_type, ev.mac||null, ev.ip||null, ev.hostname||null, ev.details||null);
}
export function listMikrotikEvents(limit=100) {
  if (!sqliteDb) return [];
  return sqliteDb.prepare('SELECT * FROM mikrotik_events ORDER BY id DESC LIMIT ?').all(limit);
}
export function saveMikrotikSnapshot(s: any) {
  if (!sqliteDb) return;
  sqliteDb.prepare('INSERT INTO mikrotik_snapshots (ts,resource_json,interfaces_json,leases_json,wifi_json,arp_json) VALUES (?,?,?,?,?,?)')
    .run(s.ts || new Date().toISOString(), JSON.stringify(s.resource||{}), JSON.stringify(s.interfaces||[]), JSON.stringify(s.leases||[]), JSON.stringify(s.wifi||[]), JSON.stringify(s.arp||[]));
  sqliteDb.prepare("DELETE FROM mikrotik_snapshots WHERE ts < datetime('now','-7 days')").run();
}
export function listMikrotikSnapshots(limit=200) {
  if (!sqliteDb) return [];
  return sqliteDb.prepare('SELECT * FROM mikrotik_snapshots ORDER BY id DESC LIMIT ?').all(limit).map((r:any)=>({ ...r, resource: safeJson(r.resource_json), interfaces: safeJson(r.interfaces_json), leases: safeJson(r.leases_json), wifi: safeJson(r.wifi_json), arp: safeJson(r.arp_json) }));
}
function safeJson(v:string){ try{return JSON.parse(v||'null')}catch{return null} }
export function setMikrotikDeviceNickname(mac:string, nickname:string) {
  if (!sqliteDb) return;
  sqliteDb.prepare('UPDATE mikrotik_devices SET nickname=? WHERE mac=?').run(nickname, mac.toUpperCase());
}
