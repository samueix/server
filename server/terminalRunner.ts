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

export function runShellCommand(commandString: string, requestedCwd?: string): Promise<TerminalExecutionResult> {
  return new Promise((resolve) => {
    const trimmed = (commandString || '').trim();
    if (!trimmed) {
      return resolve({
        success: false,
        command: commandString,
        stdout: '',
        stderr: 'Comando em branco.',
        exitCode: 1,
        cwd: requestedCwd || process.cwd(),
        executionTimeMs: 0
      });
    }

    // Bloqueia comandos comprovadamente autodestrutivos no sistema
    const destructivePatterns = [
      /rm\s+-rf\s+\/\s*$/,
      /mkfs\./,
      /dd\s+if=.*of=\/dev\/(sd[a-z]|nvme)/
    ];

    for (const pattern of destructivePatterns) {
      if (pattern.test(trimmed)) {
        return resolve({
          success: false,
          command: trimmed,
          stdout: '',
          stderr: 'Comando bloqueado por segurança: operação destrutiva crítica não permitida via painel web.',
          exitCode: 1,
          cwd: requestedCwd || process.cwd(),
          executionTimeMs: 0
        });
      }
    }

    let targetCwd = requestedCwd ? path.resolve(requestedCwd) : process.cwd();
    if (!fs.existsSync(targetCwd)) {
      targetCwd = process.cwd();
    }

    const startTime = Date.now();

    exec(
      trimmed,
      {
        cwd: targetCwd,
        shell: '/bin/bash',
        timeout: 20000, // 20s timeout
        maxBuffer: 1024 * 1024 * 3 // 3MB max buffer
      },
      (error, stdout, stderr) => {
        const executionTimeMs = Date.now() - startTime;
        const exitCode = error ? (error.code ?? 1) : 0;
        const success = !error;

        resolve({
          success,
          command: trimmed,
          stdout: stdout || '',
          stderr: stderr || (error ? error.message : ''),
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          cwd: targetCwd,
          executionTimeMs
        });
      }
    );
  });
}
