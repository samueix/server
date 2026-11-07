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
  country?: string;
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

export async function getSecurityAttackStatus(): Promise<SecurityStatusResponse> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const ipCounts: Record<string, { count: number; lastAttempt: string; targetUser: string; service: string }> = {};
  const userCounts: Record<string, number> = {};
  const recentIncidents: SecurityStatusResponse['recentIncidents'] = [];

  let totalFailedAttempts24h = 0;
  let failedAttemptsLastHour = 0;
  let totalScansDetected = 0;

  // 1. Verificar logs do SSH (/var/log/auth.log ou journalctl)
  try {
    let authLogContent = '';
    if (fs.existsSync('/var/log/auth.log')) {
      try {
        authLogContent = fs.readFileSync('/var/log/auth.log', 'utf-8');
      } catch {
        // Sem permissão direta de leitura, tenta via journalctl se disponível
      }
    }

    if (!authLogContent) {
      try {
        const { stdout } = await execAsync('journalctl -u ssh -n 150 --no-pager 2>/dev/null || true');
        authLogContent = stdout;
      } catch {
        // journalctl indisponível
      }
    }

    if (authLogContent) {
      const lines = authLogContent.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        // Expressões comuns de falhas de autenticação SSH
        const isFailed = line.includes('Failed password') || line.includes('Invalid user') || line.includes('authentication failure');
        if (isFailed) {
          totalFailedAttempts24h++;

          // Extrair IP
          const ipMatch = line.match(/(?:from|rhost=)\s*([0-9a-fA-F:.]+)/);
          const ip = ipMatch ? ipMatch[1].replace('::ffff:', '') : 'Origem externa';

          // Extrair Usuário
          const userMatch = line.match(/(?:for|user=)\s*([a-zA-Z0-9._-]+)/);
          const user = userMatch ? userMatch[1] : 'root';

          if (user) {
            userCounts[user] = (userCounts[user] || 0) + 1;
          }

          if (ip) {
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

          if (recentIncidents.length < 8) {
            recentIncidents.push({
              timestamp: new Date().toLocaleTimeString('pt-BR'),
              service: 'SSH',
              sourceIp: ip,
              detail: `Tentativa de login não autorizada para o usuário "${user}"`,
              severity: ipCounts[ip]?.count > 5 ? 'alta' : 'media'
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
    if (fs.existsSync('/var/log/nginx/access.log')) {
      const nginxContent = fs.readFileSync('/var/log/nginx/access.log', 'utf-8');
      const lines = nginxContent.split('\n').slice(-300);
      for (const line of lines) {
        if (
          line.includes('.env') ||
          line.includes('wp-login') ||
          line.includes('phpmyadmin') ||
          line.includes('/shell') ||
          line.includes('404 ') ||
          line.includes('403 ')
        ) {
          totalScansDetected++;
          const ipMatch = line.match(/^([0-9a-fA-F:.]+)/);
          if (ipMatch) {
            const ip = ipMatch[1];
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
    }
  } catch {
    // Permissão ou ausência do log do Nginx
  }

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
    }
  }

  // Montar lista de atacantes ordenada por número de tentativas
  const attackSources: AttackSource[] = Object.entries(ipCounts)
    .map(([ip, data]) => ({
      ip,
      count: data.count,
      lastAttempt: data.lastAttempt,
      targetUser: data.targetUser,
      service: data.service,
      status: (data.count >= 10 ? 'bloqueado' : data.count >= 4 ? 'investigando' : 'detectado') as AttackSource['status']
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const targetAccounts = Object.entries(userCounts)
    .map(([user, attempts]) => ({ user, attempts }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8);

  // Determinar Nível de Ameaça
  let threatLevel: 'NORMAL' | 'MODERADO' | 'SOB ATAQUE' = 'NORMAL';
  if (failedAttemptsLastHour >= 15 || totalFailedAttempts24h >= 40 || attackSources.some(s => s.count >= 20)) {
    threatLevel = 'SOB ATAQUE';
  } else if (failedAttemptsLastHour >= 4 || totalFailedAttempts24h >= 10 || totalScansDetected >= 15) {
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
    lastChecked: new Date().toLocaleTimeString('pt-BR')
  };
}
