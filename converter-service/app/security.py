from fastapi import Header, HTTPException, status

from .config import get_settings


async def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    """Shared-secret check - this service is only ever called by the NestJS
    backend over the internal network, so there's no per-user auth here."""
    settings = get_settings()
    if x_internal_token != settings.internal_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing internal token")
