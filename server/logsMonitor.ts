import fs from 'fs';
import { execSync } from 'child_process';

export interface LogEntry {
  id: string;
  timestamp: string;
  raw: string;
  host?: string;
  process?: string;
  pid?: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'debug';
}

export interface LogsResult {
  source: 'syslog' | 'agent' | 'panel' | 'adguard' | 'auth' | 'dmesg';
  source_path: string;
  file_exists: boolean;
  total_lines: number;
  returned_lines: number;
  last_updated: string;
  logs: LogEntry[];
  raw_lines: string[];
}

// Histórico em memória de eventos recentes gerados pelo servidor
const memoryLogHistory: string[] = [];

export function recordServerEvent(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `${ts} samuelserver server-panel[${process.pid}]: [${level}] ${message}`;
  memoryLogHistory.push(line);
  if (memoryLogHistory.length > 200) {
    memoryLogHistory.shift();
  }
}

function parseLogLine(raw: string, index: number): LogEntry {
  const clean = raw.trim();
  let level: 'info' | 'warn' | 'error' | 'debug' = 'info';

  const lower = clean.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('crit') || lower.includes('err') || lower.includes('fatal')) {
    level = 'error';
  } else if (lower.includes('warn') || lower.includes('timeout') || lower.includes('retry') || lower.includes('drop')) {
    level = 'warn';
  } else if (lower.includes('debug') || lower.includes('trace')) {
    level = 'debug';
  }

  // Tenta extrair formato padrão syslog: "Oct  5 05:30:12 hostname process[123]: message"
  // ou ISO timestamp: "2026-10-05T05:30:12.345Z hostname process: message"
  let timestamp = '';
  let host = '';
  let proc = '';
  let pid = '';
  let message = clean;

  const syslogMatch = clean.match(/^([A-Za-z]{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+([^:\[]+)(?:\[(\d+)\])?:\s*(.*)$/);
  if (syslogMatch) {
    timestamp = syslogMatch[1];
    host = syslogMatch[2];
    proc = syslogMatch[3];
    pid = syslogMatch[4] || '';
    message = syslogMatch[5] || '';
  } else {
    const isoMatch = clean.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+([^\s]+)\s+([^:\[]+)(?:\[(\d+)\])?:\s*(.*)$/);
    if (isoMatch) {
      timestamp = isoMatch[1];
      host = isoMatch[2];
      proc = isoMatch[3];
      pid = isoMatch[4] || '';
      message = isoMatch[5] || '';
    }
  }

  return {
    id: `log-${index}-${Date.now()}`,
    timestamp: timestamp || new Date().toISOString().slice(11, 19),
    raw: clean,
    host,
    process: proc,
    pid,
    message: message || clean,
    level
  };
}

export function getSystemLogs(source: string = 'syslog', linesCount: number = 50, filterTerm: string = ''): LogsResult {
  const count = Math.min(Math.max(Number(linesCount) || 50, 10), 300);
  let rawLines: string[] = [];
  let sourcePath = '/var/log/syslog';
  let fileExists = false;

  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (source === 'agent') {
    sourcePath = 'systemd: server-monitor.service (Agente Python :8000)';
    // Tenta journalctl
    try {
      const output = execSync(`journalctl -u server-monitor.service -n ${count} --no-pager 2>/dev/null`, { timeout: 2000, encoding: 'utf-8' });
      if (output && output.trim()) {
        rawLines = output.split('\n').filter(l => l.trim().length > 0);
        fileExists = true;
      }
    } catch {}

    // Fallback: se não tiver journalctl disponível, tenta log do supervisor ou arquivo em /opt/server-monitor
    if (rawLines.length === 0) {
      const agentLogPaths = ['/opt/server-monitor/agent.log', '/var/log/server-monitor.log'];
      for (const p of agentLogPaths) {
        if (fs.existsSync(p)) {
          try {
            const content = fs.readFileSync(p, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            rawLines = lines.slice(-count);
            sourcePath = p;
            fileExists = true;
            break;
          } catch {}
        }
      }
    }

    if (rawLines.length === 0) {
      rawLines = [];
      fileExists = false;
    }
  } else if (source === 'panel') {
    sourcePath = 'systemd: server-panel.service (Painel Web Node.js :3000)';
    for (const unit of ['server-panel.service', 'adguard-ai.service']) {
      try {
        const output = execSync(`journalctl -u ${unit} -n ${count} --no-pager 2>/dev/null`, { timeout: 2000, encoding: 'utf-8' });
        if (output && output.trim()) {
          rawLines = output.split('\n').filter(l => l.trim().length > 0);
          sourcePath = `systemd: ${unit} (Painel Web Node.js :3000)`;
          fileExists = true;
          break;
        }
      } catch {}
    }

    if (rawLines.length === 0 && memoryLogHistory.length > 0) {
      rawLines = memoryLogHistory.slice(-count);
      fileExists = true;
    }
  } else if (source === 'adguard') {
    sourcePath = '/opt/AdGuardHome/data/adguardhome.log';
    if (fs.existsSync(sourcePath)) {
      try {
        const content = fs.readFileSync(sourcePath, 'utf-8');
        rawLines = content.split('\n').filter(l => l.trim()).slice(-count);
        fileExists = true;
      } catch {}
    } else {
      try {
        const output = execSync(`journalctl -u AdGuardHome.service -n ${count} --no-pager 2>/dev/null`, { timeout: 2000, encoding: 'utf-8' });
        if (output && output.trim()) {
          rawLines = output.split('\n').filter(l => l.trim().length > 0);
          sourcePath = 'systemd: AdGuardHome.service';
          fileExists = true;
        }
      } catch {}
    }

    if (rawLines.length === 0) {
      // Sem dados reais: não inventa logs. UI exibirá estado vazio/hint.
      rawLines = [];
      fileExists = false;
    }
  } else if (source === 'auth') {
    sourcePath = '/var/log/auth.log';
    if (fs.existsSync(sourcePath)) {
      try {
        const content = fs.readFileSync(sourcePath, 'utf-8');
        rawLines = content.split('\n').filter(l => l.trim()).slice(-count);
        fileExists = true;
      } catch {}
    } else {
      try {
        const output = execSync(`journalctl -u ssh.service -n ${count} --no-pager 2>/dev/null`, { timeout: 2000, encoding: 'utf-8' });
        if (output && output.trim()) {
          rawLines = output.split('\n').filter(l => l.trim().length > 0);
          sourcePath = 'systemd: ssh.service';
          fileExists = true;
        }
      } catch {}
    }

    if (rawLines.length === 0) {
      rawLines = [];
      fileExists = false;
    }
  } else if (source === 'dmesg') {
    sourcePath = '/var/log/dmesg';
    try {
      const output = execSync(`dmesg -T 2>/dev/null | tail -n ${count}`, { timeout: 2000, encoding: 'utf-8' });
      if (output && output.trim()) {
        rawLines = output.split('\n').filter(l => l.trim().length > 0);
        fileExists = true;
      }
    } catch {}

    if (rawLines.length === 0) {
      rawLines = [];
      fileExists = false;
    }
  } else {
    // Padrão: /var/log/syslog
    sourcePath = '/var/log/syslog';
    if (fs.existsSync('/var/log/syslog')) {
      try {
        const content = fs.readFileSync('/var/log/syslog', 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        rawLines = lines.slice(-count);
        fileExists = true;
      } catch {}
    }

    // Se syslog tradicional não estiver acessível, tenta journalctl do sistema
    if (rawLines.length === 0) {
      try {
        const output = execSync(`journalctl -n ${count} --no-pager 2>/dev/null`, { timeout: 2000, encoding: 'utf-8' });
        if (output && output.trim()) {
          rawLines = output.split('\n').filter(l => l.trim().length > 0);
          sourcePath = 'systemd-journald (/var/log/journal)';
          fileExists = true;
        }
      } catch {}
    }

    if (rawLines.length === 0) {
      rawLines = [];
      fileExists = false;
    }
  }

  // Aplica filtro de texto se fornecido
  let filteredLines = rawLines;
  if (filterTerm && filterTerm.trim()) {
    const term = filterTerm.trim().toLowerCase();
    filteredLines = rawLines.filter(line => line.toLowerCase().includes(term));
  }

  const parsedLogs = filteredLines.map((line, idx) => parseLogLine(line, idx));

  return {
    source: (source as any) || 'syslog',
    source_path: sourcePath,
    file_exists: fileExists,
    total_lines: rawLines.length,
    returned_lines: parsedLogs.length,
    last_updated: new Date().toLocaleTimeString('pt-BR'),
    logs: parsedLogs,
    raw_lines: filteredLines
  };
}
