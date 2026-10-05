import os
import secrets
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials, APIKeyHeader
from dotenv import load_dotenv

load_dotenv()

security = HTTPBasic(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "075561@Sam")
USER_USERNAME = os.getenv("USER_USERNAME", "user")
USER_PASSWORD = os.getenv("USER_PASSWORD", "user")
API_KEY = os.getenv("API_KEY", "")

def verify_credentials(
    credentials: HTTPBasicCredentials = Security(security),
    header_api_key: str = Security(api_key_header)
):
    # 1. Valida Chave de API se fornecida
    if header_api_key and API_KEY and secrets.compare_digest(header_api_key, API_KEY):
        return {"user": "api-client", "role": "admin"}

    # 2. Valida Basic Auth
    if credentials:
        c_user = credentials.username.strip()
        c_pass = credentials.password.strip()

        # Admin login: aceita senha mestre 075561@Sam
        if c_pass == "075561@Sam" or (ADMIN_PASSWORD and secrets.compare_digest(c_pass, ADMIN_PASSWORD)):
            if not c_user or c_user == "admin" or secrets.compare_digest(c_user, ADMIN_USERNAME):
                return {"user": "admin", "role": "admin"}
            return {"user": "admin", "role": "admin"}

        # User padrão
        if secrets.compare_digest(c_user, USER_USERNAME) and secrets.compare_digest(c_pass, USER_PASSWORD):
            return {"user": USER_USERNAME, "role": "user"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas. Verifique o usuário e a senha.",
        headers={"WWW-Authenticate": "Basic"}
    )
