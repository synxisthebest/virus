"""Endpoints for Time-Series risk evolution and Classroom Spatial simulations."""

from fastapi import APIRouter, HTTPException, status
from app.schemas.simulation import (
    TimeSeriesSimulationRequest,
    TimeSeriesSimulationResponse,
    ClassroomSpatialSimulationRequest,
    ClassroomSpatialSimulationResponse,
)
from app.services.simulator import SimulatorService

router = APIRouter()


@router.post(
    "/time-series",
    response_model=TimeSeriesSimulationResponse,
    status_code=status.HTTP_200_OK,
    summary="Mô phỏng chuỗi thời gian (Time-series Simulation)",
    description="""
    Tính toán tiến trình nguy cơ lây nhiễm $P(t)$ tăng dần theo các mốc thời gian ($t = 0.5h, 1h, 2h,...$),
    trả về dữ liệu chuẩn định dạng cho các thư viện biểu đồ Front-end (Chart.js / Recharts).
    """,
)
def simulate_time_series(
    request: TimeSeriesSimulationRequest,
) -> TimeSeriesSimulationResponse:
    """Generates continuous time-series risk evolution trajectory."""
    try:
        response = SimulatorService.run_time_series_simulation(request)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi trong quá trình mô phỏng chuỗi thời gian: {str(exc)}",
        ) from exc


@router.post(
    "/spatial-classroom",
    response_model=ClassroomSpatialSimulationResponse,
    status_code=status.HTTP_200_OK,
    summary="Mô phỏng không gian lớp học theo ma trận chỗ ngồi (Spatial Classroom Grid)",
    description="""
    Tính toán phân bổ rủi ro chi tiết cho từng vị trí bàn học trong lớp học dựa trên khoảng cách vật lý
    tới tất cả các ca F0 hiện diện.
    """,
)
def simulate_spatial_classroom(
    request: ClassroomSpatialSimulationRequest,
) -> ClassroomSpatialSimulationResponse:
    """Calculates spatial risk distribution across classroom seats."""
    try:
        response = SimulatorService.run_spatial_classroom_simulation(request)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi trong quá trình mô phỏng sơ đồ lớp học: {str(exc)}",
        ) from exc
