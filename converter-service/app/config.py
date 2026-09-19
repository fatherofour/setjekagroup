import os
from functools import lru_cache


class Settings:
    """Minimal settings for a service with exactly one caller (the NestJS
    backend, over the internal Docker network) - no framework needed."""

    internal_token: str = os.environ.get("CONVERTER_INTERNAL_TOKEN", "dev-converter-token-change-me")
    max_upload_mb: int = int(os.environ.get("CONVERTER_MAX_UPLOAD_MB", "200"))
    raster_dpi: int = int(os.environ.get("CONVERTER_RASTER_DPI", "150"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
