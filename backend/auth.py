import os
import secrets
from typing import Optional
from fastapi import Depends, HTTPException, status, Query, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPBearer, HTTPAuthorizationCredentials

security_basic = HTTPBasic(auto_error=False)
security_bearer = HTTPBearer(auto_error=False)

def get_env_credentials():
    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "")
    user_name = os.getenv("USER_USERNAME", "user")
    user_pass = os.getenv("USER_PASSWORD", "")
    api_key = os.getenv("API_KEY", "")
    return {
        "admin": (admin_user, admin_pass),
        "user": (user_name, user_pass),
        "api_key": api_key
    }

def check_admin_password(password: Optional[str]) -> bool:
    if not password:
        return False
    env_pass = os.getenv("ADMIN_PASSWORD")
    if not env_pass:
        return False
    return secrets.compare_digest(password, env_pass)

def check_user_password(password: Optional[str]) -> bool:
    if not password:
        return False
    env_pass = os.getenv("USER_PASSWORD")
    if not env_pass:
        return False
    return secrets.compare_digest(password, env_pass)

def verify_token_string(token: Optional[str]) -> Optional[str]:
    """Retorna a role ('admin') se o token coincidir com a API_KEY em tempo constante."""
    if not token:
        return None
    creds = get_env_credentials()
    api_key = creds["api_key"]
    if api_key and secrets.compare_digest(token, api_key):
        return "admin"
    return None

def verify_credentials(
    request: Request,
    credentials: Optional[HTTPBasicCredentials] = Depends(security_basic),
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    token_query: Optional[str] = Query(None, alias="token"),
    api_key_query: Optional[str] = Query(None, alias="api_key"),
) -> str:
    creds = get_env_credentials()
    admin_user, admin_pass = creds["admin"]
    user_name, user_pass = creds["user"]
    api_key = creds["api_key"]

    # Se a requisição vem do proxy local (127.0.0.1 / ::1 / localhost)
    client_ip = request.client.host if request.client else ""
    is_local_proxy = client_ip in ("127.0.0.1", "::1", "localhost", "testclient")
    
    # 1. Validação de Header X-Client-Role (aceito unicamente se vier do proxy local Node.js)
    if is_local_proxy:
        forwarded_role = request.headers.get("X-Client-Role")
        if forwarded_role in ("admin", "user"):
            return forwarded_role

    # 2. Check custom Header X-API-Key
    x_api_key = request.headers.get("X-API-Key")
    if x_api_key and api_key and secrets.compare_digest(x_api_key, api_key):
        return "admin"

    # 3. Check Bearer token
    if bearer and bearer.credentials and api_key and secrets.compare_digest(bearer.credentials, api_key):
        return "admin"

    # 4. Check Basic Auth (exige usuário E senha)
    if credentials:
        u_clean = credentials.username.strip().lower()
        admin_clean = admin_user.strip().lower()
        user_clean = user_name.strip().lower()

        if admin_pass and secrets.compare_digest(u_clean, admin_clean) and check_admin_password(credentials.password):
            return "admin"
        if user_pass and secrets.compare_digest(u_clean, user_clean) and check_user_password(credentials.password):
            return "user"

    # 5. Check Query Parameter (para WebSocket autenticado por chave)
    token_val = token_query or api_key_query
    if token_val and api_key and secrets.compare_digest(token_val, api_key):
        return "admin"

    # Se nenhuma credencial válida foi enviada:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas ou ausentes.",
        headers={"WWW-Authenticate": "Basic"},
    )

def require_admin(user_role: str = Depends(verify_credentials)) -> str:
    """Valida se o usuário autenticado possui perfil de Administrador (admin). Retorna 403 se for usuário comum."""
    if user_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito: Esta funcionalidade exige privilégios de Administrador."
        )
    return user_role

def verify_ws_auth(token: Optional[str]) -> bool:
    """Validação para conexões WebSocket onde headers customizados não podem ser enviados pelo browser nativo."""
    if not token:
        return False
    return verify_token_string(token) is not None
