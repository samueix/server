import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import net from 'net';

const execAsync = util.promisify(exec);

export function isValidIp(rawIp: string): boolean {
  if (!rawIp) return false;
  const clean = rawIp.trim().replace(/^::ffff:/, '');
  return net.isIP(clean) !== 0;
}

export interface UfwRule {
  number: number;
  to: string;
  action: string;
  from: string;
  comment?: string;
}

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
  ufwRules?: UfwRule[];
  ufwActive?: boolean;
  externalThreatsCount?: number;
  lanAttemptsCount?: number;
  lastChecked: string;
}

// Armazena falhas de autenticação do próprio painel em memória
let panelFailedAttempts: { ip: string; user: string; timestamp: Date }[] = [];
let historyClearedAt: Date | null = null;

export function recordPanelFailedLogin(ip: string, user: string) {
  if (!isValidIp(ip)) return;
  panelFailedAttempts.unshift({ ip, user, timestamp: new Date() });
  if (panelFailedAttempts.length > 500) {
    panelFailedAttempts.length = 500;
  }
}

export function clearSecurityHistory() {
  panelFailedAttempts = [];
  historyClearedAt = new Date();
  return { success: true, message: 'Histórico de tentativas e auditoria limpo com sucesso.' };
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

  // 0. Obter regras reais e IPs bloqueados no UFW
  const blockedIpsInUfw: string[] = [];
  const ufwRules: UfwRule[] = [];
  let ufwActive = false;

  try {
    const { stdout: ufwOut } = await execAsync('sudo ufw status numbered 2>/dev/null || ufw status numbered 2>/dev/null || true');
    ufwActive = ufwOut.toLowerCase().includes('status: active') || ufwOut.toLowerCase().includes('estado: ativo');

    const ufwLines = ufwOut.split('\n');
    for (const line of ufwLines) {
      const ruleMatch = line.match(/^\s*\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)?\s+(.*?)(?:\s+#\s*(.*))?$/i);
      if (ruleMatch) {
        const num = parseInt(ruleMatch[1], 10);
        const to = ruleMatch[2].trim();
        const action = ruleMatch[3].trim().toUpperCase();
        const from = (ruleMatch[5] || '').trim();
        const comment = ruleMatch[6]?.trim();

        ufwRules.push({
          number: num,
          to,
          action,
          from,
          comment
        });

        if (action === 'DENY' || action === 'REJECT') {
          const ipCandidate = from.split(/\s+/)[0];
          if (isValidIp(ipCandidate)) {
            blockedIpsInUfw.push(ipCandidate);
          }
        }
      } else if (line.includes('DENY') || line.includes('REJECT')) {
        const ipMatch = line.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|[0-9a-fA-F:]{4,})/);
        if (ipMatch && isValidIp(ipMatch[1]) && !['0.0.0.0', '127.0.0.1'].includes(ipMatch[1])) {
          if (!blockedIpsInUfw.includes(ipMatch[1])) {
            blockedIpsInUfw.push(ipMatch[1]);
          }
        }
      }
    }
  } catch {}

  // 1. Ingestão robusta de logs do SSH com validação estrita de IP
  if (!historyClearedAt || (now.getTime() - historyClearedAt.getTime() > 10000)) {
    try {
      let authLogContent = '';
      
      try {
        const { stdout } = await execAsync('sudo journalctl -u ssh -u sshd -n 350 --no-pager 2>/dev/null || journalctl -u ssh -u sshd -n 350 --no-pager 2>/dev/null || true');
        authLogContent += stdout + '\n';
      } catch {}

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

      // Tenta lastb com validação estrita
      try {
        const { stdout: lastbOut } = await execAsync('sudo lastb -n 100 2>/dev/null || lastb -n 100 2>/dev/null || true');
        if (lastbOut) {
          const lastbLines = lastbOut.split('\n');
          for (const line of lastbLines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3 && parts[1].includes('ssh')) {
              const user = parts[0];
              const rawIp = parts[2];
              if (isValidIp(rawIp) && !rawIp.startsWith('0.0.0.0')) {
                totalFailedAttempts24h++;
                userCounts[user] = (userCounts[user] || 0) + 1;
                if (!ipCounts[rawIp]) {
                  ipCounts[rawIp] = {
                    count: 0,
                    lastAttempt: new Date().toLocaleTimeString('pt-BR'),
                    targetUser: user,
                    service: 'SSH (Porta 22)'
                  };
                }
                ipCounts[rawIp].count++;
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
            // Extrair IP estritamente após "from" ou "rhost="
            const ipMatch = line.match(/(?:from|rhost=)\s*([0-9a-fA-F:.]+)/);
            const rawCandidate = ipMatch ? ipMatch[1].replace(/^::ffff:/, '').trim() : '';

            // Rejeita strings que não são IPs válidos (ex: "a1", "port", etc)
            if (!isValidIp(rawCandidate)) {
              continue;
            }

            totalFailedAttempts24h++;

            // Extrair Usuário
            const userMatch = line.match(/(?:for|user=)\s*(?:invalid user\s+)?([a-zA-Z0-9._-]+)/);
            const user = (userMatch && userMatch[1] && userMatch[1] !== 'invalid' && userMatch[1] !== 'authenticating') 
              ? userMatch[1] 
              : 'root';

            if (user) {
              userCounts[user] = (userCounts[user] || 0) + 1;
            }

            if (!ipCounts[rawCandidate]) {
              ipCounts[rawCandidate] = {
                count: 0,
                lastAttempt: new Date().toLocaleTimeString('pt-BR'),
                targetUser: user,
                service: 'SSH (Porta 22)'
              };
            }
            ipCounts[rawCandidate].count++;

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
                sourceIp: rawCandidate,
                detail: `Tentativa de acesso para o usuário "${user}"`,
                severity: (ipCounts[rawCandidate]?.count || 0) > 6 ? 'alta' : 'media'
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[securityMonitor] Erro ao analisar logs de SSH:', err);
    }
  }

  // 2. Verificar logs de Nginx para varreduras de bots com validação de IP
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
              if (ipMatch && isValidIp(ipMatch[1])) {
                const cleanIp = ipMatch[1].replace(/^::ffff:/, '');
                if (!ipCounts[cleanIp]) {
                  ipCounts[cleanIp] = {
                    count: 0,
                    lastAttempt: new Date().toLocaleTimeString('pt-BR'),
                    targetUser: 'web_crawler',
                    service: 'Nginx (Porta 80/443)'
                  };
                }
                ipCounts[cleanIp].count++;
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

  // 4. Montar lista de atacantes com classificação criteriosa (LAN vs WAN)
  let externalThreatsCount = 0;
  let lanAttemptsCount = 0;

  const attackSources: AttackSource[] = Object.entries(ipCounts)
    .filter(([ip]) => isValidIp(ip))
    .map(([ip, data]) => {
      const classification = classifyIpNetwork(ip);
      const isBlockedInUfw = blockedIpsInUfw.includes(ip);

      if (classification.type === 'public') {
        externalThreatsCount += data.count;
      } else {
        lanAttemptsCount += data.count;
      }

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
    .slice(0, 30);

  const targetAccounts = Object.entries(userCounts)
    .map(([user, attempts]) => ({ user, attempts }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 10);

  const hourlyDistribution = Object.entries(hourlyBuckets).map(([hour, count]) => ({
    hour,
    count
  }));

  // Determinar Nível de Ameaça baseado em AMEAÇAS EXTERNAS REAIS (não conexões locais)
  let threatLevel: 'NORMAL' | 'MODERADO' | 'SOB ATAQUE' = 'NORMAL';
  const hasAggressiveExternalAttacker = attackSources.some(s => s.ipType === 'public' && s.count >= 15);

  if (hasAggressiveExternalAttacker || externalThreatsCount >= 25 || failedAttemptsLastHour >= 15) {
    threatLevel = 'SOB ATAQUE';
  } else if (externalThreatsCount >= 5 || totalScansDetected >= 15) {
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
    ufwRules,
    ufwActive,
    externalThreatsCount,
    lanAttemptsCount,
    lastChecked: new Date().toLocaleTimeString('pt-BR')
  };
}

export async function blockIpInUfw(ip: string): Promise<{ success: boolean; message: string }> {
  if (!isValidIp(ip)) {
    throw new Error(`Endereço IP inválido para bloqueio: "${ip}"`);
  }
  const cleanIp = ip.trim().replace(/[^0-9a-fA-F:.]/g, '');
  try {
    await execAsync(`sudo ufw insert 1 deny from ${cleanIp} comment 'ServerPanel' 2>/dev/null || true`);
    return { success: true, message: `IP ${cleanIp} inserido no topo da lista de bloqueios do UFW!` };
  } catch (err: any) {
    throw new Error(`Falha ao executar comando UFW: ${err.message}`);
  }
}

export async function unblockIpInUfw(ip: string): Promise<{ success: boolean; message: string }> {
  if (!isValidIp(ip)) {
    throw new Error(`Endereço IP inválido: "${ip}"`);
  }
  const cleanIp = ip.trim().replace(/[^0-9a-fA-F:.]/g, '');
  try {
    await execAsync(`sudo ufw delete deny from ${cleanIp} 2>/dev/null || true`);
    return { success: true, message: `Regra de bloqueio do IP ${cleanIp} removida do UFW com sucesso!` };
  } catch (err: any) {
    throw new Error(`Falha ao remover regra UFW: ${err.message}`);
  }
}
