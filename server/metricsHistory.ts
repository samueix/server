import fs from 'fs';
import path from 'path';
import os from 'os';

export interface MetricPoint {
  ts: number;
  cpu: number;
  ram: number;
  disk: number;
  temp: number | null;
  netRx: number;
  netTx: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'metrics-history.json');
const MAX_POINTS = 60 * 24 * 14; // ~14 days at 1-min resolution

let buffer: MetricPoint[] = [];
let lastSave = 0;

function ensureDir() { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {} }

export function loadMetricsHistory(): void {
  ensureDir();
  if (!fs.existsSync(FILE)) return;
  try { buffer = JSON.parse(fs.readFileSync(FILE, 'utf-8')) || []; } catch { buffer = []; }
}

export function addMetricPoint(p: MetricPoint): void {
  buffer.push(p);
  if (buffer.length > MAX_POINTS) buffer = buffer.slice(buffer.length - MAX_POINTS);
  const now = Date.now();
  if (now - lastSave > 60000) { // persist at most once/min
    lastSave = now;
    try { ensureDir(); fs.writeFileSync(FILE, JSON.stringify(buffer), 'utf-8'); } catch {}
  }
}

let loaded = false;
export function getMetricsHistory(rangeMs?: number): MetricPoint[] {
  if (!loaded) { loaded = true; loadMetricsHistory(); }
  if (!rangeMs) return buffer.slice(-500);
  const cutoff = Date.now() - rangeMs;
  return buffer.filter(p => p.ts >= cutoff);
}
