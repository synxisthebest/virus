"""Endpoints for instantaneous Wells-Riley transmission risk prediction."""

from fastapi import APIRouter, HTTPException, status
from app.schemas.risk_assessment import (
    WellsRileyPredictRequest,
    WellsRileyPredictResponse,
    ParametersBreakdown,
)
from app.services.wells_riley import WellsRileyEngine
from app.services.recommender import RecommenderService

router = APIRouter()


@router.post(
    "/wells-riley",
    response_model=WellsRileyPredictResponse,
    status_code=status.HTTP_200_OK,
    summary="Tính toán nguy cơ lây nhiễm tức thời theo mô hình Wells-Riley mở rộng",
    description="""
    Tính toán xác suất lây nhiễm $P$, phân loại mức độ rủi ro, dự đoán số ca F0 mới phát sinh ($D = S \\times P$),
    hệ số lây nhiễm trong phòng kín $R_t$, và tự động sinh danh sách khuyến nghị can thiệp dịch tễ học.
    """,
)
def predict_wells_riley(request: WellsRileyPredictRequest) -> WellsRileyPredictResponse:
    """Computes instant transmission probability and actionable recommendations."""
    try:
        # 1. Resolve ventilation air flow Q
        Q = WellsRileyEngine.calculate_clean_air_rate(
            clean_air_delivery_rate=request.ventilation.clean_air_delivery_rate,
            room_volume_m3=request.ventilation.room_volume_m3,
            air_changes_per_hour=request.ventilation.air_changes_per_hour,
        )

        # 2. Resolve mask transmission factor km
        km, ei, eo = WellsRileyEngine.calculate_mask_factor(
            mask_type_f0=request.mask_config.mask_type_f0,
            mask_type_susceptible=request.mask_config.mask_type_susceptible,
            custom_inward_efficiency=request.mask_config.custom_inward_efficiency,
            custom_outward_efficiency=request.mask_config.custom_outward_efficiency,
        )

        # 3. Resolve distance proximity factor kd
        kd = WellsRileyEngine.calculate_distance_factor(
            distance_factor=request.distance_factor
        )

        # 4. Resolve ventilation distribution factor kh
        kh = request.ventilation_distribution_factor

        # 5. Extract core rates
        p = request.breathing_rate or 0.50
        q = request.quanta_generation_rate or 20.0
        t = request.exposure_time_hours
        I = request.infected_count
        S = request.susceptible_count

        # 6. Execute mathematical evaluation
        assessment = WellsRileyEngine.calculate_full_assessment(
            I=I, S=S, p=p, q=q, t=t, Q=Q, kd=kd, km=km, kh=kh, ei=ei, eo=eo
        )

        prob = assessment["infection_probability"]
        prob_pct = assessment["infection_probability_percent"]

        # 7. Generate contextual recommendations
        recommendations = RecommenderService.generate_recommendations(
            probability=prob,
            I=I,
            S=S,
            p=p,
            q=q,
            t=t,
            Q=Q,
            kd=kd,
            km=km,
            kh=kh,
            ei=ei,
            eo=eo,
        )

        # 8. Calculate mitigation what-if options
        mitigation_options = RecommenderService.calculate_mitigation_scenarios(
            I=I,
            S=S,
            p=p,
            q=q,
            t=t,
            Q=Q,
            kd=kd,
            km=km,
            kh=kh,
            current_probability_percent=prob_pct,
        )

        return WellsRileyPredictResponse(
            infection_probability=prob,
            infection_probability_percent=prob_pct,
            risk_level=assessment["risk_level"],
            risk_level_label_vi=assessment["risk_level_label_vi"],
            expected_new_cases=assessment["expected_new_cases"],
            effective_reproductive_number=assessment["effective_reproductive_number"],
            parameters_used=ParametersBreakdown(**assessment["parameters_breakdown"]),
            recommendations=recommendations,
            mitigation_options=mitigation_options,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi trong quá trình tính toán mô hình dịch tễ: {str(exc)}",
        ) from exc
