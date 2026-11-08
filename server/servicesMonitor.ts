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
    aliases: ['ssh', 'sshd'],
    name: 'OpenSSH Server',
    porta: 22,
    descricao: 'Serviço de acesso remoto seguro SSH'
  },
  {
    canonical: 'AdGuardHome',
    aliases: ['AdGuardHome', 'adguard-home'],
    name: 'AdGuard Home',
    porta: '53, 8081',
    descricao: 'Servidor DNS com bloqueio de anúncios e rastreadores'
  },
  {
    canonical: 'server-panel',
    aliases: ['server-panel', 'server-monitor'],
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
    aliases: ['systemd-resolved'],
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
    aliases: ['docker'],
    name: 'Docker Engine',
    porta: null,
    descricao: 'Mecanismo de contêineres Docker'
  },
  {
    canonical: 'fail2ban',
    aliases: ['fail2ban'],
    name: 'Fail2Ban Security',
    porta: null,
    descricao: 'Proteção contra ataques de força bruta'
  },
  {
    canonical: 'tailscaled',
    aliases: ['tailscaled'],
    name: 'Tailscale VPN',
    porta: null,
    descricao: 'Rede privada mesh VPN'
  },
  {
    canonical: 'n8n',
    aliases: ['n8n'],
    name: 'n8n Workflow Automation',
    porta: 5678,
    descricao: 'Automação de fluxos e integrações'
  }
];

export function getSystemdServiceStatus(serviceName: string): Partial<MonitoredService> {
  const clean = serviceName.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const unit = clean.endsWith('.service') ? clean : `${clean}.service`;

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
      const isOnline = activeState === 'active' && (subState === 'running' || subState === 'listening');
      const isError = activeState === 'failed' || subState === 'failed';
      const status: 'ONLINE' | 'OFFLINE' | 'ERRO' = isOnline ? 'ONLINE' : (isError ? 'ERRO' : 'OFFLINE');
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
        status,
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
  } catch {}

  // Fallback seguro com ZERO dados falsos: verifica se o processo existe de verdade no sistema
  try {
    const pgrepOut = execSync(`pgrep -f "${clean}" | head -n 1`, {
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

  // Sem processo rodando e sem systemd: estado honesto OFFLINE
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
    const statusInfo = getSystemdServiceStatus(item.canonical);
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
