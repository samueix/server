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
  city?: string;
  isp?: string;
  flag?: string;
  failureReason?: 'senha_incorreta' | 'usuario_inexistente' | 'conexao_abortada' | 'scan_http' | 'outro';
  failureReasonLabel?: string;
}

export interface SecurityIncident {
  id: string;
  timestamp: string;
  hora: string;
  service: string;
  sourceIp: string;
  targetUser: string;
  failureReason: 'senha_incorreta' | 'usuario_inexistente' | 'conexao_abortada' | 'scan_http' | 'outro';
  failureReasonLabel: string;
  location: string;
  country?: string;
  city?: string;
  isp?: string;
  flag?: string;
  detail: string;
  severity: 'baixa' | 'media' | 'alta';
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
  recentIncidents: SecurityIncident[];
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

// Cache local de GeoIP em memória para resposta instantânea
const geoCache = new Map<string, { country: string; city: string; isp: string; flag: string }>();

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export async function resolveIpLocation(ip: string): Promise<{ country: string; city: string; isp: string; flag: string }> {
  const cleanIp = ip.trim().replace(/^::ffff:/, '');
  if (geoCache.has(cleanIp)) {
    return geoCache.get(cleanIp)!;
  }
  const netInfo = classifyIpNetwork(cleanIp);
  if (netInfo.type !== 'public') {
    const loc = {
      country: netInfo.country,
      city: netInfo.type === 'local' ? 'Rede Local' : netInfo.type === 'tailscale' ? 'Tailscale' : 'Interno',
      isp: 'Rede Local / VPN Segura',
      flag: netInfo.flag
    };
    geoCache.set(cleanIp, loc);
    return loc;
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,city,isp,org`, {
      signal: AbortSignal.timeout(1200)
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.status === 'success') {
        const flag = data.countryCode ? getFlagEmoji(data.countryCode) : '🌐';
        const loc = {
          country: data.country || 'Desconhecido',
          city: data.city || 'Desconhecida',
          isp: data.org || data.isp || 'Provedor Desconhecido',
          flag
        };
        geoCache.set(cleanIp, loc);
        return loc;
      }
    }
  } catch {}

  const fallback = { country: 'Internet Pública (WAN)', city: 'WAN', isp: 'Externo', flag: '🌐' };
  geoCache.set(cleanIp, fallback);
  return fallback;
}

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

  const ipCounts: Record<string, { 
    count: number; 
    lastAttempt: string; 
    targetUser: string; 
    service: string;
    failureReason: 'senha_incorreta' | 'usuario_inexistente' | 'conexao_abortada' | 'scan_http' | 'outro';
    failureReasonLabel: string;
  }> = {};
  const userCounts: Record<string, number> = {};
  const recentIncidents: SecurityIncident[] = [];
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

  // 1. Ingestão robusta de logs do SSH com detecção detalhada do motivo e hora exata
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
          authLogContent += fileLog.slice(-120000) + '\n';
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
                    service: 'SSH (Porta 22)',
                    failureReason: 'senha_incorreta',
                    failureReasonLabel: 'Senha Incorreta'
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

            // Identificação precisa do motivo do ataque / erro
            let failureReason: 'senha_incorreta' | 'usuario_inexistente' | 'conexao_abortada' | 'outro' = 'outro';
            let failureReasonLabel = 'Falha de autenticação';

            if (line.includes('Invalid user')) {
              failureReason = 'usuario_inexistente';
              failureReasonLabel = 'Usuário Inexistente no Sistema';
            } else if (line.includes('Failed password')) {
              failureReason = 'senha_incorreta';
              failureReasonLabel = 'Senha Incorreta (Usuário Existente)';
            } else if (line.includes('Connection closed') || line.includes('Connection reset')) {
              failureReason = 'conexao_abortada';
              failureReasonLabel = 'Conexão Abortada / Timeout';
            }

            // Horário do evento para o gráfico e auditoria
            let incidentTime = new Date().toLocaleTimeString('pt-BR');
            let incidentHour = `${String(new Date().getHours()).padStart(2, '0')}:00`;
            const dateMatch = line.match(/^([A-Za-z]{3}\s+\d+\s+\d{2}:\d{2}:\d{2})/);
            const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);

            if (dateMatch) {
              incidentTime = dateMatch[1];
              const hMatch = dateMatch[1].match(/(\d{2}):/);
              if (hMatch) incidentHour = `${hMatch[1]}:00`;
            } else if (isoMatch) {
              const d = new Date(isoMatch[1]);
              incidentTime = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`;
              incidentHour = `${String(d.getHours()).padStart(2, '0')}:00`;
            }

            if (hourlyBuckets[incidentHour] !== undefined) {
              hourlyBuckets[incidentHour]++;
            }

            if (!ipCounts[rawCandidate]) {
              ipCounts[rawCandidate] = {
                count: 0,
                lastAttempt: incidentTime,
                targetUser: user,
                service: 'SSH (Porta 22)',
                failureReason,
                failureReasonLabel
              };
            }
            ipCounts[rawCandidate].count++;
            ipCounts[rawCandidate].lastAttempt = incidentTime;
            ipCounts[rawCandidate].targetUser = user;
            ipCounts[rawCandidate].failureReason = failureReason;
            ipCounts[rawCandidate].failureReasonLabel = failureReasonLabel;

            if (recentIncidents.length < 20) {
              recentIncidents.push({
                id: 'inc_' + Math.random().toString(36).slice(2, 9),
                timestamp: incidentTime,
                hora: incidentTime.includes(':') ? incidentTime.split(' ').pop() || incidentTime : incidentTime,
                service: 'SSH (Porta 22)',
                sourceIp: rawCandidate,
                targetUser: user,
                failureReason,
                failureReasonLabel,
                location: 'Carregando geolocalização...',
                detail: `${failureReasonLabel} para usuário "${user}"`,
                severity: failureReason === 'senha_incorreta' ? 'alta' : 'media'
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
                    service: 'Nginx (Porta 80/443)',
                    failureReason: 'scan_http',
                    failureReasonLabel: 'Varredura HTTP / Path Traversal'
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
          service: 'Server Panel Web',
          failureReason: 'senha_incorreta',
          failureReasonLabel: 'Senha Incorreta no Painel Web'
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
        flag: classification.flag,
        failureReason: data.failureReason,
        failureReasonLabel: data.failureReasonLabel
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // 5. Enriquecer geolocalização (País, Cidade, Provedor e Bandeira) em paralelo
  await Promise.all([
    ...attackSources.map(async s => {
      const loc = await resolveIpLocation(s.ip);
      s.country = loc.country;
      s.city = loc.city;
      s.isp = loc.isp;
      s.flag = loc.flag;
    }),
    ...recentIncidents.map(async inc => {
      const loc = await resolveIpLocation(inc.sourceIp);
      inc.country = loc.country;
      inc.city = loc.city;
      inc.isp = loc.isp;
      inc.flag = loc.flag;
      inc.location = loc.city && loc.city !== 'Desconhecida' && loc.city !== 'WAN' 
        ? `${loc.city}, ${loc.country} ${loc.flag}`
        : `${loc.country} ${loc.flag}`;
    })
  ]);

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
