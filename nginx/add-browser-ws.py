#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
import time

SITE = os.environ.get('NGINX_SITE', '/etc/nginx/sites-available/server-panel')
MARKER = 'location /browser-ws'
SNIPPET = '''    # Navegador Remoto - WebSocket do screencast (ticket validado no app)
    location /browser-ws {
        proxy_pass http://127.0.0.1:3000/browser-ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
'''


def main() -> int:
    if os.geteuid() != 0 and os.environ.get('ALLOW_NON_ROOT') != '1':
        print('Execute com sudo.', file=sys.stderr)
        return 1
    if not os.path.isfile(SITE):
        print(f'Arquivo nao encontrado: {SITE}', file=sys.stderr)
        return 1

    with open(SITE, 'r', encoding='utf-8') as f:
        text = f.read()

    if MARKER in text:
        print('Bloco /browser-ws ja existe; nada a fazer.')
        return 0

    stripped = text.rstrip()
    if not stripped.endswith('}'):
        print('O arquivo do site nao termina com "}", abortando sem alterar.', file=sys.stderr)
        return 1
    if 'server' not in stripped:
        print('Bloco server nao encontrado, abortando sem alterar.', file=sys.stderr)
        return 1

    idx = len(stripped) - 1
    new_text = stripped[:idx] + '\n' + SNIPPET + stripped[idx:] + '\n'

    backup = f'{SITE}.bak.{time.strftime("%Y%m%d-%H%M%S")}'
    shutil.copy2(SITE, backup)

    tmp = f'{SITE}.tmp.{os.getpid()}'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(new_text)
    shutil.copymode(SITE, tmp)
    os.replace(tmp, SITE)

    if os.environ.get('SKIP_NGINX_TEST') == '1' or os.environ.get('ALLOW_NON_ROOT') == '1':
        print(f'Bloco /browser-ws inserido. Backup: {backup}')
        return 0

    check = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    if check.returncode != 0:
        shutil.copy2(backup, SITE)
        print('nginx -t falhou; configuracao original restaurada.', file=sys.stderr)
        print(check.stderr, file=sys.stderr)
        return 1

    print(check.stderr.strip())
    print(f'Bloco /browser-ws inserido. Backup: {backup}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
