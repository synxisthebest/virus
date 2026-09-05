"""Main FastAPI Application Entrypoint."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.config import settings
from app.api.v1.router import api_v1_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("wells_riley_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifespan events."""
    logger.info("Initializing Wells-Riley Influenza Transmission API...")
    logger.info(f"Version: {settings.VERSION} | Environment: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    yield
    logger.info("Shutting down Wells-Riley Influenza Transmission API.")


def create_application() -> FastAPI:
    """Factory function creating and configuring the FastAPI instance."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="""
        ## Hệ Thống API Tính Toán, Mô Phỏng & Dự Báo Nguy Cơ Lây Nhiễm Cúm (Influenza) Trong Không Gian Kín
        
        Sử dụng mô hình toán học **Wells–Riley mở rộng** kết hợp với các hệ số dịch tễ học thực nghiệm:
        - **$P = 1 - \\exp\\left(-\\frac{I \\cdot p \\cdot q \\cdot t}{Q} \\cdot k_d \\cdot k_m \\cdot k_h\\right)$**
        
        ### Các tính năng chính:
        1. **Dự báo rủi ro tức thời (`/api/v1/predict/wells-riley`)**: Xác suất lây $P$, số ca mới $D=S \\times P$, hệ số lây $R_t$, và khuyến nghị tự động.
        2. **Mô phỏng chuỗi thời gian (`/api/v1/simulate/time-series`)**: Cung cấp dữ liệu theo chuỗi $t$ phục vụ vẽ biểu đồ (Chart.js / Recharts).
        3. **Mô phỏng sơ đồ lớp học (`/api/v1/simulate/spatial-classroom`)**: Đánh giá nguy cơ theo ma trận khoảng cách giữa các bàn học.
        4. **Bảng tra cứu tham số dịch tễ (`/api/v1/constants/presets`)**: Cung cấp đầy đủ thông số khẩu trang, lưu lượng thở, mức phát tán aerosol và thông gió.
        """,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # Configure CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Custom Exception Handler for Pydantic Validation Errors
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        formatted_errors = []
        for error in exc.errors():
            loc = " -> ".join([str(x) for x in error.get("loc", [])])
            msg = error.get("msg", "")
            formatted_errors.append(f"[{loc}]: {msg}")

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "Validation Error",
                "message": "Dữ liệu đầu vào không hợp lệ.",
                "details": formatted_errors,
            },
        )

    # Global Exception Handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled server error: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "Internal Server Error",
                "message": "Đã xảy ra lỗi nội bộ máy chủ trong quá trình xử lý mô hình.",
                "detail": str(exc) if settings.DEBUG else None,
            },
        )

    # Register API Routers
    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    # Root redirect / landing info
    @app.get("/", tags=["Root"])
    def root():
        return {
            "message": "Wells-Riley Influenza Risk Prediction API is running.",
            "documentation": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health",
            "version": settings.VERSION,
        }

    return app


app = create_application()
