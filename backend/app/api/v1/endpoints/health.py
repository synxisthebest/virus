"""Health check and service status endpoint."""

from fastapi import APIRouter, status
from app.core.config import settings

router = APIRouter()


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Kiểm tra trạng thái máy chủ (Health Check)",
)
def health_check():
    """Returns the operational status of the Wells-Riley prediction service."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "engine": "Extended Wells-Riley Epidemiological Model",
    }
