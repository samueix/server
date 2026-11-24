import fs from 'fs';
import path from 'path';

export interface AdGuardHistoryPoint {
  ts: number;
  totalQueries: number;
  totalBlocked: number;
  deltaQueries: number;
  deltaBlocked: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'adguard-history.json');
const MAX_POINTS = 60 * 24 * 8; // 1-min buckets, ~8 days

let buffer: AdGuardHistoryPoint[] = [];
let lastSave = 0;
let lastSample: { ts: number; totalQueries: number; totalBlocked: number } | null = null;

function ensureDir() { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {} }

export function loadAdGuardHistory(): void {
  ensureDir();
  if (!fs.existsSync(FILE)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    buffer = Array.isArray(parsed?.points) ? parsed.points : (Array.isArray(parsed) ? parsed : []);
    lastSample = parsed?.lastSample || null;
  } catch { buffer = []; lastSample = null; }
}

function persist() {
  const now = Date.now();
  if (now - lastSave < 60000) return;
  lastSave = now;
  try { ensureDir(); fs.writeFileSync(FILE, JSON.stringify({ lastSample, points: buffer }), 'utf-8'); } catch {}
}

export function addAdGuardSample(totalQueries: number, totalBlocked: number): void {
  const ts = Date.now();
  const tq = Math.max(0, Number(totalQueries) || 0);
  const tb = Math.max(0, Number(totalBlocked) || 0);
  if (!lastSample) {
    lastSample = { ts, totalQueries: tq, totalBlocked: tb };
    persist();
    return;
  }
  const dt = ts - lastSample.ts;
  if (dt < 55 * 1000) return; // enforce ~1 min
  let deltaQueries = tq - lastSample.totalQueries;
  let deltaBlocked = tb - lastSample.totalBlocked;
  // Counter reset/stats cleared: avoid negative spike
  if (deltaQueries < 0) deltaQueries = tq;
  if (deltaBlocked < 0) deltaBlocked = tb;
  // Cap absurd deltas (protect from corruption)
  const maxReasonable = Math.max(100000, deltaQueries);
  if (deltaQueries > 10_000_000) deltaQueries = 0;
  if (deltaBlocked > 10_000_000) deltaBlocked = 0;
  if (deltaBlocked > deltaQueries) deltaBlocked = deltaQueries;

  buffer.push({ ts, totalQueries: tq, totalBlocked: tb, deltaQueries, deltaBlocked });
  if (buffer.length > MAX_POINTS) buffer = buffer.slice(buffer.length - MAX_POINTS);
  lastSample = { ts, totalQueries: tq, totalBlocked: tb };
  lastSave = 0;
  persist();
  lastSave = Date.now();
}

export function getAdGuardHistory(rangeMs: number): AdGuardHistoryPoint[] {
  const cutoff = Date.now() - rangeMs;
  return buffer.filter(p => p.ts >= cutoff);
}

export function getAdGuardHistoryMeta() {
  return { points: buffer.length, lastSampleTs: lastSample?.ts || null, intervalMs: 10 * 60 * 1000 };
}
