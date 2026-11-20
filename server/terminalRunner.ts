import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

const auditTrail: TerminalAuditRecord[] = [];

export function sanitizeCwd(requestedCwd?: string): string {
  if (!requestedCwd) return process.cwd();
  const resolved = path.resolve(requestedCwd);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {}
  return process.cwd();
}

export function runShellCommand(commandString: string, requestedCwd?: string, clientIp?: string): Promise<TerminalExecutionResult> {
  return new Promise((resolve) => {
    const trimmed = (commandString || '').trim();
    const targetCwd = sanitizeCwd(requestedCwd);

    if (!trimmed) {
      const result: TerminalExecutionResult = {
        success: false,
        command: '',
        stdout: '',
        stderr: 'Comando vazio.',
        exitCode: 1,
        cwd: targetCwd,
        executionTimeMs: 0
      };
      return resolve(result);
    }

    const startTime = Date.now();
    const sanitizedCommand = trimmed.replace(/\\\s*[\r\n]+\s*/g, ' ').trim();

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
        timeout: 300000,
        maxBuffer: 1024 * 1024 * 20,
        env: {
          ...process.env,
          PATH: process.env.PATH
            ? `${process.env.PATH}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`
            : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        }
      },
      (error, stdout, stderr) => {
        const executionTimeMs = Date.now() - startTime;
        const exitCode = error ? ((error as any).code ?? 1) : 0;
        const success = !error;

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
          stderr: stderr || (error ? (error as any).message : ''),
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          cwd: finalCwd,
          executionTimeMs
        };

        recordAudit({
          timestamp: new Date().toISOString(),
          command: trimmed,
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
