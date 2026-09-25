import os
import secrets
from typing import Optional
from fastapi import Depends, HTTPException, status, Query, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPBearer, HTTPAuthorizationCredentials

security_basic = HTTPBasic(auto_error=False)
security_bearer = HTTPBearer(auto_error=False)

def get_env_credentials():
    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "admin")
    api_key = os.getenv("API_KEY", "")
    return admin_user, admin_pass, api_key

def verify_token_string(token: Optional[str]) -> bool:
    if not token:
        return False
    admin_user, admin_pass, api_key = get_env_credentials()
    # Check against API_KEY if set
    if api_key and secrets.compare_digest(token, api_key):
        return True
    # Check against password
    if secrets.compare_digest(token, admin_pass):
        return True
    return False

def verify_credentials(
    request: Request,
    credentials: Optional[HTTPBasicCredentials] = Depends(security_basic),
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    token_query: Optional[str] = Query(None, alias="token"),
    api_key_query: Optional[str] = Query(None, alias="api_key"),
) -> str:
    admin_user, admin_pass, api_key = get_env_credentials()

    # 1. Check custom Header X-API-Key
    x_api_key = request.headers.get("X-API-Key")
    if x_api_key and verify_token_string(x_api_key):
        return "api-client"

    # 2. Check Bearer token
    if bearer and verify_token_string(bearer.credentials):
        return "bearer-user"

    # 3. Check Basic Auth (username / password)
    if credentials:
        correct_username = secrets.compare_digest(credentials.username, admin_user)
        correct_password = secrets.compare_digest(credentials.password, admin_pass)
        if correct_username and correct_password:
            return credentials.username

    # 4. Check Query Parameter (for WebSocket or direct polling fallback)
    if token_query and verify_token_string(token_query):
        return "query-token"
    if api_key_query and verify_token_string(api_key_query):
        return "query-api-key"

    # If neither matched:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas ou ausentes.",
        headers={"WWW-Authenticate": "Basic"},
    )

def verify_ws_auth(token: Optional[str]) -> bool:
    """Validação para conexões WebSocket onde headers customizados não podem ser enviados pelo browser nativo."""
    if not token:
        return False
    return verify_token_string(token)
