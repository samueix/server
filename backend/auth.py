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
    user_name = os.getenv("USER_USERNAME", "user")
    user_pass = os.getenv("USER_PASSWORD", "user")
    api_key = os.getenv("API_KEY", "")
    return {
        "admin": (admin_user, admin_pass),
        "user": (user_name, user_pass),
        "api_key": api_key
    }

def verify_token_string(token: Optional[str]) -> bool:
    if not token:
        return False
    creds = get_env_credentials()
    api_key = creds["api_key"]
    # Check against API_KEY if set
    if api_key and secrets.compare_digest(token, api_key):
        return True
    # Check against admin password
    if secrets.compare_digest(token, creds["admin"][1]):
        return True
    # Check against user password
    if secrets.compare_digest(token, creds["user"][1]):
        return True
    return False

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

    # 1. Check custom Header X-API-Key
    x_api_key = request.headers.get("X-API-Key")
    if x_api_key and verify_token_string(x_api_key):
        return "api-client"

    # 2. Check Bearer token
    if bearer and verify_token_string(bearer.credentials):
        return "bearer-user"

    # 3. Check Basic Auth (username / password)
    if credentials:
        # Check admin
        if secrets.compare_digest(credentials.username, admin_user) and secrets.compare_digest(credentials.password, admin_pass):
            return admin_user
        # Check standard user
        if secrets.compare_digest(credentials.username, user_name) and secrets.compare_digest(credentials.password, user_pass):
            return user_name

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
