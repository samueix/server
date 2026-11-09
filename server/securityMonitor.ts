import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export interface AttackSource {
  ip: string;
  count: number;
  lastAttempt: string;
  targetUser: string;
  service: string;
  status: 'detectado' | 'bloqueado' | 'investigando';
  ipType: 'local' | 'tailscale' | 'public' | 'docker' | 'loopback';
  ipTypeLabel: string;
  country?: string;
  flag?: string;
}

export interface SecurityStatusResponse {
  threatLevel: 'NORMAL' | 'MODERADO' | 'SOB ATAQUE';
  isUnderAttack: boolean;
  totalFailedAttempts24h: number;
  failedAttemptsLastHour: number;
  totalScansDetected: number;
  sshStatus: 'ativo' | 'alerta' | 'normal';
  nginxStatus: 'normal' | 'scans_detectados';
  attackSources: AttackSource[];
  targetAccounts: { user: string; attempts: number }[];
  recentIncidents: {
    timestamp: string;
    service: string;
    sourceIp: string;
    detail: string;
    severity: 'baixa' | 'media' | 'alta';
  }[];
  hourlyDistribution: { hour: string; count: number }[];
  blockedIpsInUfw: string[];
  lastChecked: string;
}

// Armazena falhas de autenticação do próprio painel em memória
const panelFailedAttempts: { ip: string; user: string; timestamp: Date }[] = [];

export function recordPanelFailedLogin(ip: string, user: string) {
  panelFailedAttempts.unshift({ ip, user, timestamp: new Date() });
  if (panelFailedAttempts.length > 500) {
    panelFailedAttempts.length = 500;
  }
}

export function classifyIpNetwork(rawIp: string): {
  type: AttackSource['ipType'];
  label: string;
  country: string;
  flag: string;
} {
  const ip = (rawIp || '').trim().replace(/^::ffff:/, '');

  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return { type: 'loopback', label: 'Loopback Interno', country: 'Localhost', flag: '💻' };
  }
  if (ip.startsWith('192.168.')) {
    return { type: 'local', label: 'Wi-Fi / LAN Doméstica (192.168.x.x)', country: 'Rede Local', flag: '🏠' };
  }
  if (ip.startsWith('100.') || ip.startsWith('fd7a:115c:a1e0:')) {
    return { type: 'tailscale', label: 'Tailscale WireGuard VPN', country: 'Tailnet Fixa', flag: '🔒' };
  }
  if (ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') || ip.startsWith('172.20.')) {
    return { type: 'docker', label: 'Docker Bridge / Contêiner', country: 'Docker Intranet', flag: '🐳' };
  }
  if (ip.startsWith('10.')) {
    return { type: 'local', label: 'Rede Privada Interna (10.x.x.x)', country: 'Intranet Privada', flag: '🏢' };
  }

  return {
    type: 'public',
    label: 'Internet Pública (WAN / Acesso Externo)',
    country: 'Origem Externa',
    flag: '🌐'
  };
}

export async function getSecurityAttackStatus(): Promise<SecurityStatusResponse> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const ipCounts: Record<string, { count: number; lastAttempt: string; targetUser: string; service: string }> = {};
  const userCounts: Record<string, number> = {};
  const recentIncidents: SecurityStatusResponse['recentIncidents'] = [];
  const hourlyBuckets: Record<string, number> = {};

  // Inicializa últimas 12 horas para o gráfico
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourKey = `${String(d.getHours()).padStart(2, '0')}:00`;
    hourlyBuckets[hourKey] = 0;
  }

  let totalFailedAttempts24h = 0;
  let failedAttemptsLastHour = 0;
  let totalScansDetected = 0;

  // 0. Obter IPs atualmente bloqueados no UFW
  const blockedIpsInUfw: string[] = [];
  try {
    const { stdout: ufwOut } = await execAsync('sudo ufw status numbered 2>/dev/null || ufw status numbered 2>/dev/null || true');
    const ufwLines = ufwOut.split('\n');
    for (const line of ufwLines) {
      if (line.includes('DENY') || line.includes('REJECT')) {
        const ipMatch = line.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|[0-9a-fA-F:]{4,})/);
        if (ipMatch && !['0.0.0.0/0', 'Anywhere'].includes(ipMatch[1])) {
          blockedIpsInUfw.push(ipMatch[1]);
        }
      }
    }
  } catch {}

  // 1. Ingestão robusta de logs do SSH (Ubuntu 24.04: journalctl com sudo, sem sudo e /var/log/auth.log)
  try {
    let authLogContent = '';
    
    // Tenta journalctl com sudo e sem sudo
    try {
      const { stdout } = await execAsync('sudo journalctl -u ssh -u sshd -n 350 --no-pager 2>/dev/null || journalctl -u ssh -u sshd -n 350 --no-pager 2>/dev/null || true');
      authLogContent += stdout + '\n';
    } catch {}

    // Tenta arquivo tradicional /var/log/auth.log
    if (fs.existsSync('/var/log/auth.log')) {
      try {
        const fileLog = fs.readFileSync('/var/log/auth.log', 'utf-8');
        authLogContent += fileLog.slice(-100000) + '\n';
      } catch {
        try {
          const { stdout: sudoCat } = await execAsync('sudo tail -n 350 /var/log/auth.log 2>/dev/null || true');
          authLogContent += sudoCat + '\n';
        } catch {}
      }
    }

    // Tenta utilitário nativo Linux 'lastb' (rastreador oficial do kernel de logins com falha)
    try {
      const { stdout: lastbOut } = await execAsync('sudo lastb -n 100 2>/dev/null || lastb -n 100 2>/dev/null || true');
      if (lastbOut) {
        const lastbLines = lastbOut.split('\n');
        for (const line of lastbLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3 && parts[1].includes('ssh')) {
            const user = parts[0];
            const ip = parts[2];
            if (ip && (ip.includes('.') || ip.includes(':')) && !ip.startsWith('0.0.0.0')) {
              totalFailedAttempts24h++;
              userCounts[user] = (userCounts[user] || 0) + 1;
              if (!ipCounts[ip]) {
                ipCounts[ip] = {
                  count: 0,
                  lastAttempt: new Date().toLocaleTimeString('pt-BR'),
                  targetUser: user,
                  service: 'SSH (Porta 22)'
                };
              }
              ipCounts[ip].count++;
            }
          }
        }
      }
    } catch {}

    if (authLogContent) {
      const lines = authLogContent.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        const isFailed = 
          line.includes('Failed password') || 
          line.includes('Invalid user') || 
          line.includes('authentication failure') ||
          line.includes('Connection closed by authenticating user') ||
          line.includes('Connection reset by authenticating user');

        if (isFailed) {
          totalFailedAttempts24h++;

          // Extrair IP
          const ipMatch = line.match(/(?:from|rhost=|user\s+|client\s+)\s*([0-9a-fA-F:.]+)/);
          const rawIp = ipMatch ? ipMatch[1].replace('::ffff:', '') : '';
          const ip = (rawIp && !rawIp.includes('port') && !rawIp.includes('ssh')) ? rawIp : 'Origem externa';

          // Extrair Usuário
          const userMatch = line.match(/(?:for|user=|by)\s*(?:invalid user\s+)?([a-zA-Z0-9._-]+)/);
          const user = (userMatch && userMatch[1] && userMatch[1] !== 'invalid' && userMatch[1] !== 'authenticating') 
            ? userMatch[1] 
            : 'root';

          if (user) {
            userCounts[user] = (userCounts[user] || 0) + 1;
          }

          if (ip && ip !== 'Origem externa') {
            if (!ipCounts[ip]) {
              ipCounts[ip] = {
                count: 0,
                lastAttempt: new Date().toLocaleTimeString('pt-BR'),
                targetUser: user,
                service: 'SSH (Porta 22)'
              };
            }
            ipCounts[ip].count++;
          }

          // Horário do evento para o gráfico
          const timeMatch = line.match(/(\d{2}):(\d{2}):\d{2}/);
          if (timeMatch) {
            const hourKey = `${timeMatch[1]}:00`;
            if (hourlyBuckets[hourKey] !== undefined) {
              hourlyBuckets[hourKey]++;
            }
          }

          if (recentIncidents.length < 10) {
            recentIncidents.push({
              timestamp: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : new Date().toLocaleTimeString('pt-BR'),
              service: 'SSH',
              sourceIp: ip,
              detail: `Tentativa de força bruta contra conta "${user}"`,
              severity: (ipCounts[ip]?.count || 0) > 6 ? 'alta' : 'media'
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[securityMonitor] Erro ao analisar logs de SSH:', err);
  }

  // 2. Verificar logs de Nginx para varreduras de bots (.env, wp-login, phpmyadmin, shell)
  try {
    const nginxLogPaths = ['/var/log/nginx/access.log', '/var/log/nginx/error.log'];
    for (const logPath of nginxLogPaths) {
      if (fs.existsSync(logPath)) {
        try {
          const nginxContent = fs.readFileSync(logPath, 'utf-8');
          const lines = nginxContent.split('\n').slice(-400);
          for (const line of lines) {
            if (
              line.includes('.env') ||
              line.includes('wp-login') ||
              line.includes('phpmyadmin') ||
              line.includes('/shell') ||
              line.includes('cgi-bin') ||
              line.includes('404 ') ||
              line.includes('403 ')
            ) {
              totalScansDetected++;
              const ipMatch = line.match(/^([0-9a-fA-F:.]+)/);
              if (ipMatch) {
                const ip = ipMatch[1].replace('::ffff:', '');
                if (!ipCounts[ip]) {
                  ipCounts[ip] = {
                    count: 0,
                    lastAttempt: new Date().toLocaleTimeString('pt-BR'),
                    targetUser: 'web_crawler',
                    service: 'Nginx (Porta 80/443)'
                  };
                }
                ipCounts[ip].count++;
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  // 3. Incorporar tentativas registradas no painel
  for (const item of panelFailedAttempts) {
    if (item.timestamp >= oneDayAgo) {
      totalFailedAttempts24h++;
      if (item.timestamp >= oneHourAgo) {
        failedAttemptsLastHour++;
      }
      userCounts[item.user] = (userCounts[item.user] || 0) + 1;
      if (!ipCounts[item.ip]) {
        ipCounts[item.ip] = {
          count: 0,
          lastAttempt: item.timestamp.toLocaleTimeString('pt-BR'),
          targetUser: item.user,
          service: 'Server Panel Web'
        };
      }
      ipCounts[item.ip].count++;

      const hourKey = `${String(item.timestamp.getHours()).padStart(2, '0')}:00`;
      if (hourlyBuckets[hourKey] !== undefined) {
        hourlyBuckets[hourKey]++;
      }
    }
  }

  // 4. Montar lista de atacantes enriquecida com IP, geolocalização e classificação
  const attackSources: AttackSource[] = Object.entries(ipCounts)
    .map(([ip, data]) => {
      const classification = classifyIpNetwork(ip);
      const isBlockedInUfw = blockedIpsInUfw.includes(ip);

      return {
        ip,
        count: data.count,
        lastAttempt: data.lastAttempt,
        targetUser: data.targetUser,
        service: data.service,
        status: isBlockedInUfw
          ? 'bloqueado'
          : (data.count >= 10 ? 'bloqueado' : data.count >= 3 ? 'investigando' : 'detectado') as AttackSource['status'],
        ipType: classification.type,
        ipTypeLabel: classification.label,
        country: classification.country,
        flag: classification.flag
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const targetAccounts = Object.entries(userCounts)
    .map(([user, attempts]) => ({ user, attempts }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 10);

  const hourlyDistribution = Object.entries(hourlyBuckets).map(([hour, count]) => ({
    hour,
    count
  }));

  // Determinar Nível de Ameaça
  let threatLevel: 'NORMAL' | 'MODERADO' | 'SOB ATAQUE' = 'NORMAL';
  if (failedAttemptsLastHour >= 15 || totalFailedAttempts24h >= 40 || attackSources.some(s => s.count >= 20)) {
    threatLevel = 'SOB ATAQUE';
  } else if (failedAttemptsLastHour >= 4 || totalFailedAttempts24h >= 8 || totalScansDetected >= 15) {
    threatLevel = 'MODERADO';
  }

  return {
    threatLevel,
    isUnderAttack: threatLevel === 'SOB ATAQUE',
    totalFailedAttempts24h,
    failedAttemptsLastHour,
    totalScansDetected,
    sshStatus: threatLevel === 'SOB ATAQUE' ? 'alerta' : 'normal',
    nginxStatus: totalScansDetected > 10 ? 'scans_detectados' : 'normal',
    attackSources,
    targetAccounts,
    recentIncidents,
    hourlyDistribution,
    blockedIpsInUfw,
    lastChecked: new Date().toLocaleTimeString('pt-BR')
  };
}
