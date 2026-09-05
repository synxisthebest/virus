"""Application configuration module using Pydantic Settings."""

from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Core application settings and environment configurations."""

    # Application metadata
    PROJECT_NAME: str = "Influenza Transmission Prediction Engine (Extended Wells-Riley)"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS settings (allowed origins for Frontend connection)
    ALLOWED_ORIGINS: List[str] = Field(
        default=["*"],
        description="Allowed CORS origins for frontend client requests",
    )

    # Epidemiological defaults and boundaries
    MIN_AIR_FLOW_M3_PER_HOUR: float = 1.0  # Safeguard against Q <= 0 (division by zero)
    MAX_EXPOSURE_HOURS: float = 168.0  # Max 1 week simulation
    DEFAULT_EXPONENT_CLIP: float = 700.0  # Protect against exp() overflow

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
