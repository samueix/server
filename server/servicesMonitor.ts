import { execSync } from 'child_process';

export interface MonitoredService {
  name: string;
  nome: string;
  canonical: string;
  status: 'ONLINE' | 'OFFLINE' | 'ERRO';
  ativo: boolean;
  habilitado_boot: boolean;
  installed: boolean;
  sub_state?: string;
  pid?: number | null;
  tempo_ativo: string;
  ultima_inicializacao: string;
  descricao: string;
  porta?: number | string | null;
  cpu: string;
  memory: string;
  uptime: string;
}

const CANONICAL_SERVICES = [
  {
    canonical: 'ssh',
    aliases: ['ssh', 'sshd', 'openssh-server'],
    name: 'OpenSSH Server',
    porta: 22,
    descricao: 'Serviço de acesso remoto seguro SSH'
  },
  {
    canonical: 'AdGuardHome',
    aliases: ['AdGuardHome', 'adguard-home', 'adguardhome'],
    name: 'AdGuard Home',
    porta: '53, 8081',
    descricao: 'Servidor DNS com bloqueio de anúncios e rastreadores'
  },
  {
    canonical: 'server-panel',
    aliases: ['server-panel', 'server-monitor', 'serverpanel'],
    name: 'Server Panel',
    porta: 3000,
    descricao: 'Daemon de monitoramento em tempo real'
  },
  {
    canonical: 'nginx',
    aliases: ['nginx'],
    name: 'Nginx Web Server',
    porta: '80, 443',
    descricao: 'Servidor proxy reverso HTTP'
  },
  {
    canonical: 'cron',
    aliases: ['cron', 'crond'],
    name: 'Cron Daemon',
    porta: null,
    descricao: 'Agendador de tarefas periódicas'
  },
  {
    canonical: 'systemd-resolved',
    aliases: ['systemd-resolved', 'resolved'],
    name: 'systemd-resolved',
    porta: 53,
    descricao: 'Resolvedor DNS local do Ubuntu'
  },
  {
    canonical: 'ufw',
    aliases: ['ufw'],
    name: 'UFW Firewall',
    porta: null,
    descricao: 'Firewall do Ubuntu Server'
  },
  {
    canonical: 'docker',
    aliases: ['docker', 'dockerd'],
    name: 'Docker Engine',
    porta: null,
    descricao: 'Mecanismo de contêineres Docker'
  },
  {
    canonical: 'tailscaled',
    aliases: ['tailscaled', 'tailscale'],
    name: 'Tailscale VPN',
    porta: null,
    descricao: 'Rede privada mesh VPN'
  },
  {
    canonical: 'n8n',
    aliases: ['n8n', 'n8n.service'],
    name: 'n8n Workflow Automation',
    porta: 5678,
    descricao: 'Automação de fluxos e integrações (container Docker)'
  }
];

import fs from 'fs';

export function getSystemdServiceStatus(serviceName: string, aliases: string[] = [], porta?: number | string | null): Partial<MonitoredService> {
  const candidates = [serviceName, ...aliases];

  // 1. Tenta systemctl show para cada alias do serviço
  for (const name of candidates) {
    const clean = name.replace(/[^a-zA-Z0-9_\-\.]/g, '');
    if (!clean) continue;
    const isTimer = clean.endsWith('.timer') || serviceName.endsWith('.timer');
    const unit = clean.endsWith('.service') || clean.endsWith('.timer') ? clean : `${clean}.service`;

    try {
      const stdout = execSync(
        `systemctl show ${unit} --property=ActiveState,SubState,LoadState,UnitFileState,MainPID,Description,ActiveEnterTimestamp,CPUUsageNSec,MemoryCurrent`,
        { encoding: 'utf-8', timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const props: Record<string, string> = {};
      for (const line of stdout.split('\n')) {
        const idx = line.indexOf('=');
        if (idx !== -1) {
          props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      }

      const loadState = props['LoadState'] || 'not-found';
      if (loadState !== 'not-found') {
        const activeState = props['ActiveState'] || 'inactive';
        const subState = props['SubState'] || 'dead';
        
        const timerOnline = isTimer && activeState === 'active' && (subState === 'waiting' || subState === 'running' || subState === 'elapsed');
        // Em serviços oneshot (como ufw), activeState é 'active' e subState é 'exited'. O serviço ESTÁ ATIVO!
        const isOnline = timerOnline || (activeState === 'active' && (
          subState === 'running' || 
          subState === 'listening' || 
          subState === 'active' || 
          subState === 'exited'
        ));
        const isError = activeState === 'failed' || subState === 'failed';

        if (isOnline || isError) {
          const mainPid = parseInt(props['MainPID'] || '0', 10) || null;

          let memStr = 'N/D';
          const memBytes = parseInt(props['MemoryCurrent'] || '0', 10);
          if (memBytes > 0 && memBytes < 1e15) {
            memStr = memBytes > 1024 ** 3
              ? `${(memBytes / (1024 ** 3)).toFixed(2)} GB`
              : `${(memBytes / (1024 ** 2)).toFixed(1)} MB`;
          }

          let cpuStr = 'N/D';
          const cpuNsec = parseInt(props['CPUUsageNSec'] || '0', 10);
          if (cpuNsec > 0) {
            cpuStr = `${(cpuNsec / 1e9).toFixed(1)}s total`;
          }

          return {
            status: isOnline ? 'ONLINE' : 'ERRO',
            ativo: isOnline,
            habilitado_boot: props['UnitFileState'] === 'enabled',
            installed: true,
            sub_state: subState,
            pid: mainPid,
            tempo_ativo: isOnline ? 'Ativo' : 'Inativo',
            ultima_inicializacao: props['ActiveEnterTimestamp'] || 'N/D',
            cpu: cpuStr,
            memory: memStr,
            uptime: isOnline ? 'Ativo' : 'Inativo'
          };
        }
      }
    } catch {}
  }

  // 2. Verificação direta do Firewall UFW
  if (serviceName.toLowerCase() === 'ufw') {
    try {
      const ufwOut = execSync('sudo ufw status 2>/dev/null || ufw status 2>/dev/null || true', {
        encoding: 'utf-8',
        timeout: 1000
      }).trim();
      if (ufwOut.toLowerCase().includes('status: active') || ufwOut.toLowerCase().includes('estado: ativo')) {
        return {
          status: 'ONLINE',
          ativo: true,
          habilitado_boot: true,
          installed: true,
          sub_state: 'active (regras ativas)',
          pid: null,
          tempo_ativo: 'Ativo',
          ultima_inicializacao: 'N/D',
          cpu: 'N/D',
          memory: 'N/D',
          uptime: 'Ativo'
        };
      }
    } catch {}
  }

  // 3. Verificação do Tailscale VPN (interface tailscale0 ou daemon ou tailscale status)
  if (serviceName.toLowerCase().startsWith('tailscale')) {
    try {
      if (fs.existsSync('/sys/class/net/tailscale0')) {
        return {
          status: 'ONLINE',
          ativo: true,
          habilitado_boot: true,
          installed: true,
          sub_state: 'running (tailscale0 ativa)',
          pid: null,
          tempo_ativo: 'Ativo',
          ultima_inicializacao: 'N/D',
          cpu: 'N/D',
          memory: 'N/D',
          uptime: 'Ativo'
        };
      }
      const tsStatus = execSync('tailscale status 2>/dev/null || sudo tailscale status 2>/dev/null || true', { encoding: 'utf-8', timeout: 1000 }).trim();
      if (tsStatus && !tsStatus.includes('failed') && !tsStatus.includes('not running')) {
        return {
          status: 'ONLINE',
          ativo: true,
          habilitado_boot: true,
          installed: true,
          sub_state: 'running',
          pid: null,
          tempo_ativo: 'Ativo',
          ultima_inicializacao: 'N/D',
          cpu: 'N/D',
          memory: 'N/D',
          uptime: 'Ativo'
        };
      }
    } catch {}
  }

  // 3.1 Verificação do Server Panel (o próprio serviço em execução)
  if (serviceName.toLowerCase() === 'server-panel' || serviceName.toLowerCase() === 'server-monitor') {
    return {
      status: 'ONLINE',
      ativo: true,
      habilitado_boot: true,
      installed: true,
      sub_state: 'running',
      pid: process.pid,
      tempo_ativo: 'Ativo',
      ultima_inicializacao: 'N/D',
      cpu: 'N/D',
      memory: 'N/D',
      uptime: 'Ativo'
    };
  }

  // 4. Verificação de portas escutando via ss -lnt
  if (porta) {
    try {
      const portList = String(porta).split(',').map(p => p.trim());
      const ssOut = execSync('ss -lnt 2>/dev/null || true', { encoding: 'utf-8', timeout: 1000 });
      for (const p of portList) {
        if (p && (ssOut.includes(`:${p} `) || ssOut.includes(`:${p}\n`))) {
          return {
            status: 'ONLINE',
            ativo: true,
            habilitado_boot: true,
            installed: true,
            sub_state: 'listening',
            pid: null,
            tempo_ativo: 'Ativo',
            ultima_inicializacao: 'N/D',
            cpu: 'N/D',
            memory: 'N/D',
            uptime: `Porta ${p} em escuta`
          };
        }
      }
    } catch {}
  }

  // 5. Fallback seguro por pgrep em todos os candidatos
  for (const name of candidates) {
    try {
      const pgrepOut = execSync(`pgrep -f "${name}" 2>/dev/null | head -n 1`, {
        encoding: 'utf-8',
        timeout: 1000,
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      const realPid = parseInt(pgrepOut, 10);
      if (realPid && !isNaN(realPid) && realPid > 0) {
        return {
          status: 'ONLINE',
          ativo: true,
          habilitado_boot: false,
          installed: true,
          sub_state: 'running',
          pid: realPid,
          tempo_ativo: 'Ativo',
          ultima_inicializacao: 'N/D',
          cpu: 'N/D',
          memory: 'N/D',
          uptime: 'Ativo'
        };
      }
    } catch {}
  }

  // Sem processo rodando e sem systemd ativo
  return {
    status: 'OFFLINE',
    ativo: false,
    habilitado_boot: false,
    installed: false,
    sub_state: 'inactive',
    pid: null,
    tempo_ativo: 'Inativo',
    ultima_inicializacao: 'N/D',
    cpu: 'N/D',
    memory: 'N/D',
    uptime: 'Inativo'
  };
}

export function getAllMonitoredServices(): MonitoredService[] {
  const results: MonitoredService[] = [];

  for (const item of CANONICAL_SERVICES) {
    const statusInfo = getSystemdServiceStatus(item.canonical, item.aliases, item.porta);
    results.push({
      name: item.name,
      nome: item.name,
      canonical: item.canonical,
      status: statusInfo.status || 'OFFLINE',
      ativo: Boolean(statusInfo.ativo),
      habilitado_boot: Boolean(statusInfo.habilitado_boot),
      installed: Boolean(statusInfo.installed),
      sub_state: statusInfo.sub_state,
      pid: statusInfo.pid,
      tempo_ativo: statusInfo.tempo_ativo || 'N/D',
      ultima_inicializacao: statusInfo.ultima_inicializacao || 'N/D',
      descricao: item.descricao,
      porta: item.porta,
      cpu: statusInfo.cpu || 'N/D',
      memory: statusInfo.memory || 'N/D',
      uptime: statusInfo.uptime || 'N/D'
    });
  }

  // Ordena: ONLINE primeiro, depois ERRO, depois OFFLINE
  const orderMap: Record<string, number> = { ONLINE: 0, ERRO: 1, OFFLINE: 2 };
  results.sort((a, b) => (orderMap[a.status] ?? 3) - (orderMap[b.status] ?? 3));

  return results;
}
