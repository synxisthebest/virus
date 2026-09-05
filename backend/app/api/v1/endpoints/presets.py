"""Endpoints providing system lookup tables and parameter presets."""

from fastapi import APIRouter, status
from app.constants.epidemiology import (
    MASK_EFFICIENCY_MAP,
    BREATHING_RATE_MAP,
    QUANTA_RATE_MAP,
    VENTILATION_DISTRIBUTION_MAP,
    RISK_THRESHOLDS,
)
from app.schemas.presets import PresetsResponse

router = APIRouter()


@router.get(
    "/presets",
    response_model=PresetsResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách các bảng tra cứu hệ số dịch tễ học",
    description="""
    Trả về toàn bộ hằng số và bảng tra cứu chuẩn:
    - Các loại khẩu trang và hiệu suất lọc 2 chiều ($e_i, e_o, k_m$)
    - Các mức độ hoạt động và lưu lượng thở ($p$ m3/h)
    - Tốc độ phát tán hạt mầm bệnh theo phát âm/ho ($q$ quanta/h)
    - Hiệu quả phân bổ thông khí ($k_h$)
    - Ngưỡng phân loại cấp độ rủi ro (LOW, MODERATE, HIGH, CRITICAL)
    """,
)
def get_epidemiology_presets() -> PresetsResponse:
    """Returns standard lookup tables for frontend dropdowns and configuration."""
    mask_types = [
        {
            "id": k.value,
            "inward_efficiency": v["inward_efficiency"],
            "outward_efficiency": v["outward_efficiency"],
            "combined_km": v["combined_km"],
            "description_vi": v["description_vi"],
        }
        for k, v in MASK_EFFICIENCY_MAP.items()
    ]

    activity_levels = [
        {
            "id": k.value,
            "rate_m3_per_hour": v["rate_m3_per_hour"],
            "name_vi": v["name_vi"],
            "description_vi": v["description_vi"],
        }
        for k, v in BREATHING_RATE_MAP.items()
    ]

    quanta_presets = [
        {
            "id": k.value,
            "quanta_per_hour": v["quanta_per_hour"],
            "name_vi": v["name_vi"],
            "description_vi": v["description_vi"],
        }
        for k, v in QUANTA_RATE_MAP.items()
    ]

    ventilation_types = [
        {
            "id": k.value,
            "factor_kh": v["factor_kh"],
            "name_vi": v["name_vi"],
            "description_vi": v["description_vi"],
        }
        for k, v in VENTILATION_DISTRIBUTION_MAP.items()
    ]

    risk_thresholds_formatted = {
        k.value: {
            "max_p": v["max_p"],
            "label_vi": v["label_vi"],
            "color": v["color"],
        }
        for k, v in RISK_THRESHOLDS.items()
    }

    return PresetsResponse(
        mask_types=mask_types,
        activity_levels=activity_levels,
        quanta_presets=quanta_presets,
        ventilation_types=ventilation_types,
        risk_thresholds=risk_thresholds_formatted,
    )
