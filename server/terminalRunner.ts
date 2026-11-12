import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TerminalExecutionResult {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  executionTimeMs: number;
}

export interface TerminalAuditRecord {
  timestamp: string;
  command: string;
  cwd: string;
  exitCode: number;
  executionTimeMs: number;
  success: boolean;
  clientIp?: string;
}

// Histórico de auditoria em memória (mantém os últimos 500 registros para compliance)
const auditTrail: TerminalAuditRecord[] = [];

// Lista estrita de comandos base / binários autorizados para administração do servidor Ubuntu
const ALLOWED_BINARIES = new Set([
  // Diagnóstico do sistema, hardware e métricas
  'uptime',
  'free',
  'hostnamectl',
  'uname',
  'df',
  'lsblk',
  'du',
  'lscpu',
  'arch',
  'date',
  'whoami',
  'id',
  'env',
  'pwd',
  'cd',
  'echo',
  'printf',
  'clear',
  'sleep',
  'which',
  'whereis',
  'test',
  '[',
  ']',
  'true',
  'false',

  // Serviços, daemons e processos
  'systemctl',
  'journalctl',
  'service',
  'ps',
  'top',
  'htop',
  'kill',
  'pkill',
  'ss',
  'netstat',
  'lsof',

  // Rede, firewall e conectividade
  'ip',
  'ifconfig',
  'ping',
  'traceroute',
  'curl',
  'wget',
  'dig',
  'nslookup',
  'host',
  'ufw',
  'iptables',
  'tailscale',

  // Processamento de texto, filtros e utilitários de shell
  'cat',
  'head',
  'tail',
  'grep',
  'egrep',
  'fgrep',
  'awk',
  'sed',
  'cut',
  'tr',
  'sort',
  'uniq',
  'wc',
  'tee',
  'base64',
  'diff',
  'find',
  'xargs',
  'read',
  'export',
  'unset',

  // Arquivos, diretórios e permissões do servidor
  'ls',
  'mkdir',
  'rmdir',
  'cp',
  'mv',
  'rm',
  'touch',
  'chmod',
  'chown',
  'truncate',
  'tar',
  'gzip',
  'gunzip',
  'zip',
  'unzip',
  'file',
  'stat',

  // Diagnóstico térmico, logs e auditoria
  'sensors',
  'last',
  'lastb',
  'w',
  'dmesg',

  // Gerenciamento de pacotes Ubuntu (instalação e manutenção)
  'apt',
  'apt-get',
  'dpkg',

  // Runtimes, servidores e automações
  'nginx',
  'git',
  'npm',
  'npx',
  'node',
  'python3',
  'docker',
  'docker-compose',
  'crontab',
  'opencode',

  // Palavras-chave de shell para scripts/blocos (bash -c)
  'if', 'then', 'else', 'elif', 'fi',
  'for', 'while', 'until', 'do', 'done', 'in',
  'case', 'esac', 'select', 'function',
  'return', 'break', 'continue', 'local', 'declare', 'typeset', 'readonly',
  'shift', 'set', 'eval', 'source', '.',
  'wait', 'trap', 'exit', 'exec'
]);

// Lista de arquivos confidenciais terminantemente proibidos de acesso via terminal
const RESTRICTED_FILE_PATTERNS = [
  /\/etc\/shadow/i,
  /\/etc\/gshadow/i,
  /\/etc\/sudoers/i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /\.env(\.|$|\s)/i,
  /server-config\.json/i
];

// Padrões de reverse shell, injeção perigosa e download-pipe de código arbitrário
const DANGEROUS_PATTERNS = [
  /\|\s*(ba)?sh(\s+|$)/i,
  /\|\s*zsh(\s+|$)/i,
  /\/dev\/(tcp|udp)\//i,
  /\b(nc|ncat|netcat|socat)\b/i,
  /\bmkfifo\b/i,
  /\bpython[0-9.]*\s+-c\b/i,
  /\bperl\s+-e\b/i,
  /\bruby\s+-e\b/i,
  /\bphp\s+-r\b/i,
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\/|\/\*|\/\.\*)(\s+|$)/i,
  /mkfs\./i,
  /dd\s+if=.*of=\/dev\/(sd[a-z]|nvme)/i
];

// Macros oficiais de atualização do painel (sequências pré-aprovadas de manutenção)
const CANONICAL_GIT_UPDATE_PREFIX = 'cd /opt/server-panel && git pull origin main && npm run build';
const CANONICAL_GIT_UPDATE_COMMANDS = [
  'cd /opt/server-panel && git pull origin main && npm run build',
  'cd /opt/server-panel && git fetch origin main && git checkout main && git pull origin main && chmod +x deploy-update.sh && ./deploy-update.sh',
  'cd /opt/server-panel && git fetch origin main && git checkout main && git pull origin main && chmod +x deploy-update.sh && bash deploy-update.sh'
];

/**
 * Mascara qualquer token, chave secreta ou parâmetro de senha para o log de auditoria
 */
export function sanitizeAuditCommand(cmd: string): string {
  return cmd
    .replace(/(password|passwd|pass|token|secret|key)=['"]?[^'"\s&|;]+['"]?/gi, '$1=[REDACTED]')
    .replace(/(--password|-p)\s+['"]?[^\s&|;]+['"]?/gi, '$1 [REDACTED]')
    .replace(/(bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(Basic\s+)[a-zA-Z0-9+/=]+/gi, '$1[REDACTED]');
}

/**
 * Divide uma linha em comandos respeitando aspas simples, duplas e profundidade de subshells $()
 */
function splitShellSegments(line: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let subshellDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : '';

    if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '$' && line[i + 1] === '(') {
        subshellDepth++;
        current += '$(';
        i++;
        continue;
      }

      if (char === ')' && subshellDepth > 0) {
        subshellDepth--;
        current += char;
        continue;
      }

      // Se estamos dentro de um subshell $(...), não divide por |, &&, ;, ||
      if (subshellDepth > 0) {
        current += char;
        continue;
      }

      // Operadores de controle no nível principal
      if (char === ';' || (char === '&' && line[i + 1] === '&') || (char === '|' && line[i + 1] === '|') || char === '|') {
        if (current.trim()) {
          segments.push(current.trim());
        }
        current = '';
        if (line[i + 1] === '&' || line[i + 1] === '|') {
          i++; // pula o segundo caractere de && ou ||
        }
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Valida a segurança de subshells $() e crases
 */
function checkSubshellSafety(segment: string): { safe: boolean; reason?: string } {
  // Backticks são obsoletos e inseguros
  if (/`[^`]+`/.test(segment)) {
    return { safe: false, reason: 'Tentativa de execução de subshell com crases (backticks) não é permitida.' };
  }

  // Verifica ocorrências de $(...)
  const subshellMatches = segment.match(/\$\(([^)]+)\)/g);
  if (subshellMatches) {
    // Se o segmento NÃO for uma atribuição de variável (VAR=... ou export VAR=...) E NÃO for comando seguro (echo/printf)
    const isAssignment = /^(export\s+)?[a-zA-Z_][a-zA-Z0-9_]*=/.test(segment.trim());
    const isSafeWrapper = /^(sudo\s+)?(echo|printf|logger)\s+/.test(segment.trim());

    if (!isAssignment && !isSafeWrapper) {
      return { safe: false, reason: 'Tentativa de execução arbitrária de subshell $() não autorizada.' };
    }

    // Para subshells em atribuições ou wrappers, valida o comando interno recursivamente
    for (const match of subshellMatches) {
      const innerCmd = match.slice(2, -1).trim();
      const innerValidation = isCommandAllowed(innerCmd);
      if (!innerValidation.allowed) {
        return { safe: false, reason: `Comando interno do subshell rejeitado: ${innerValidation.reason}` };
      }
    }
  }

  return { safe: true };
}

/**
 * Valida se um comando ou bloco de comandos é permitido pela política de segurança
 */
export function isCommandAllowed(commandString: string): { allowed: boolean; reason?: string } {
  const trimmed = commandString.trim();
  if (!trimmed) {
    return { allowed: false, reason: 'Comando em branco.' };
  }

  // Verifica proteção de arquivos do sistema
  for (const pattern of RESTRICTED_FILE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: 'Acesso negado: comando referencia arquivos confidenciais do sistema.' };
    }
  }

  // Verifica padrões de injeção destrutivos ou de shell perigoso
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: 'Comando bloqueado por segurança: padrão perigoso detectado.' };
    }
  }

  // Permite macros canônicas de deploy e atualização do painel
  const normalizedCommand = trimmed.replace(/\s+/g, ' ').trim();
  if (CANONICAL_GIT_UPDATE_COMMANDS.some(cmd => normalizedCommand === cmd || normalizedCommand.startsWith(cmd))) {
    return { allowed: true };
  }

  // Divide em linhas para suportar blocos colados (scripts multi-linha com comentários e comandos sequenciais)
  const lines = trimmed.split(/\r?\n/);
  let heredocTerminator: string | null = null;

  for (const rawLine of lines) {
    // Se estamos dentro de um heredoc, ignora até encontrar o terminador
    if (heredocTerminator !== null) {
      if (rawLine.replace(/\r$/, '') === heredocTerminator) {
        heredocTerminator = null;
      }
      continue;
    }

    const line = rawLine.trim();
    // Linhas em branco ou comentários puros do bash (# ...) são ignorados
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Detecta início de heredoc (<<EOF, <<'EOF', <<"EOF", <<-EOF, etc.)
    const heredocMatch = line.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
    if (heredocMatch) {
      heredocTerminator = heredocMatch[1];
    }

    // Divide comandos combinados por operadores lógicos ou pipes respeitando aspas e subshells
    const segments = splitShellSegments(line);

    for (const segment of segments) {
      // Ignora comentários no final de segmento
      if (segment.startsWith('#')) continue;

      // Validação de segurança de subshells $() e crases
      const subshellCheck = checkSubshellSafety(segment);
      if (!subshellCheck.safe) {
        return { allowed: false, reason: subshellCheck.reason };
      }

      // Suporte a atribuições de variáveis de ambiente no bash (ex: AUTH_B64=..., PORT=3000, export VAR=...)
      const cleanSegmentNoExport = segment.replace(/^export\s+/, '').trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*=/.test(cleanSegmentNoExport)) {
        // Atribuição de variável válida com subshell seguro já verificado acima
        continue;
      }

      // Remove "sudo" inicial para analisar o binário real invocado
      let cleanSegment = segment.replace(/^sudo\s+/, '').trim();

      // Remove variáveis prefixadas antes do binário (ex: DEBIAN_FRONTEND=noninteractive apt ...)
      cleanSegment = cleanSegment.replace(/^[a-zA-Z_][a-zA-Z0-9_]*=[^\s]+\s+/, '').trim();

      const tokens = cleanSegment.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;

      const baseBinary = tokens[0].toLowerCase();
      const normalizedBinary = path.basename(baseBinary);

      if (!ALLOWED_BINARIES.has(normalizedBinary)) {
        return { 
          allowed: false, 
          reason: `Comando "${normalizedBinary}" não está na lista de comandos permitidos (allowlist) do painel.` 
        };
      }

      // Regras específicas de proteção para binários permitidos
      if (normalizedBinary === 'systemctl') {
        const allowedActions = [
          'status', 'is-active', 'is-enabled', 'is-failed', 'reload', 'restart', 
          'start', 'stop', 'enable', 'disable', 'cat', 'list-units', 'daemon-reload'
        ];
        const action = tokens.find(t => allowedActions.includes(t.toLowerCase()));
        if (!action) {
          return { allowed: false, reason: 'systemctl: apenas ações administrativas de serviços (status, restart, reload, start, stop, daemon-reload, enable, disable) são permitidas.' };
        }
      }

      if (normalizedBinary === 'curl') {
        // Bloqueia flags perigosas de gravação direta em arquivos arbitrários
        if (/(-o|--output|-O|--upload-file|-T)\s+/i.test(segment)) {
          return { allowed: false, reason: 'curl: gravação ou upload de arquivos não é permitida pelo terminal.' };
        }
      }
    }
  }

  return { allowed: true };
}

/**
 * Valida e sanitiza o diretório de execução para evitar path traversal
 */
export function sanitizeCwd(requestedCwd?: string): string {
  if (!requestedCwd) return process.cwd();

  const resolved = path.resolve(requestedCwd);

  // Impede que o cwd aponte para diretórios confidenciais
  if (resolved === '/root' || resolved.startsWith('/etc/sudoers.d')) {
    return process.cwd();
  }

  if (fs.existsSync(resolved)) {
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return resolved;
      }
    } catch {}
  }

  return process.cwd();
}

/**
 * Executa comandos autorizados respeitando allowlist e gerando auditoria segura
 */
export function runShellCommand(commandString: string, requestedCwd?: string, clientIp?: string): Promise<TerminalExecutionResult> {
  return new Promise((resolve) => {
    const trimmed = (commandString || '').trim();
    const targetCwd = sanitizeCwd(requestedCwd);

    const validation = isCommandAllowed(trimmed);
    if (!validation.allowed) {
      const result: TerminalExecutionResult = {
        success: false,
        command: trimmed,
        stdout: '',
        stderr: validation.reason || 'Comando bloqueado por política de segurança.',
        exitCode: 1,
        cwd: targetCwd,
        executionTimeMs: 0
      };

      // Auditoria com comando sanitizado
      recordAudit({
        timestamp: new Date().toISOString(),
        command: sanitizeAuditCommand(trimmed),
        cwd: targetCwd,
        exitCode: 1,
        executionTimeMs: 0,
        success: false,
        clientIp
      });

      return resolve(result);
    }

    const startTime = Date.now();

    // Normaliza contra-barras seguidas de quebras de linha (continuação de linha do bash)
    const sanitizedCommand = trimmed
      .replace(/\\\s*[\r\n]+\s*/g, ' ')
      .trim();

    // Envolve a execução do script/bloco para rastrear o diretório final (suporte a 'cd')
    const wrappedScript = `
{
${sanitizedCommand}
}
__SCRIPT_EXIT_CODE__=$?
echo ""
echo "__SERVER_TERMINAL_CWD__:$PWD"
exit $__SCRIPT_EXIT_CODE__
`;

    exec(
      wrappedScript,
      {
        cwd: targetCwd,
        shell: '/bin/bash',
        timeout: 90000,
        maxBuffer: 1024 * 1024 * 10,
        env: {
          ...process.env,
          PATH: process.env.PATH 
            ? `${process.env.PATH}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`
            : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        }
      },
      (error, stdout, stderr) => {
        const executionTimeMs = Date.now() - startTime;
        const exitCode = error ? (error.code ?? 1) : 0;
        const success = !error;

        // Extrai o diretório final informado pelo marcador __SERVER_TERMINAL_CWD__
        let finalCwd = targetCwd;
        let cleanStdout = stdout || '';

        const cwdMatch = cleanStdout.match(/__SERVER_TERMINAL_CWD__:(.*)$/m);
        if (cwdMatch) {
          const detectedDir = cwdMatch[1]?.trim();
          if (detectedDir) {
            finalCwd = sanitizeCwd(detectedDir);
          }
          cleanStdout = cleanStdout.replace(/\r?\n?__SERVER_TERMINAL_CWD__:.*$/m, '').trimEnd();
        }

        const result: TerminalExecutionResult = {
          success,
          command: trimmed,
          stdout: cleanStdout,
          stderr: stderr || (error ? error.message : ''),
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          cwd: finalCwd,
          executionTimeMs
        };

        recordAudit({
          timestamp: new Date().toISOString(),
          command: sanitizeAuditCommand(trimmed),
          cwd: finalCwd,
          exitCode: result.exitCode,
          executionTimeMs,
          success,
          clientIp
        });

        resolve(result);
      }
    );
  });
}

function recordAudit(record: TerminalAuditRecord) {
  auditTrail.push(record);
  if (auditTrail.length > 500) {
    auditTrail.shift();
  }
}

export function getTerminalAuditTrail(): TerminalAuditRecord[] {
  return [...auditTrail];
}
