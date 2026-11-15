import fs from 'fs';
import path from 'path';

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  ip: string;
  action: string;
  target?: string;
  details?: string;
  status: 'success' | 'failure' | 'info';
  meta?: Record<string, any>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');
const MAX_ENTRIES = 2000;

function ensureDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  ensureDir();
  const full: AuditEntry = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(full) + '\n', 'utf-8');
  } catch {}
}

export function getAuditLog(limit = 200): AuditEntry[] {
  ensureDir();
  if (!fs.existsSync(AUDIT_FILE)) return [];
  try {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const tail = lines.slice(-Math.max(1, Math.min(limit, MAX_ENTRIES)));
    const entries: AuditEntry[] = [];
    for (const line of tail) {
      try { entries.push(JSON.parse(line)); } catch {}
    }
    return entries.reverse();
  } catch {
    return [];
  }
}

export function clearAuditLog(): void {
  ensureDir();
  try { fs.writeFileSync(AUDIT_FILE, '', 'utf-8'); } catch {}
}
