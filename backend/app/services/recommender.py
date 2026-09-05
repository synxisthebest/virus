"""Dynamic recommendation generator and mitigation impact analyzer."""

import math
from typing import List, Dict, Any
from app.constants.epidemiology import (
    RiskLevel,
    MaskType,
    MASK_EFFICIENCY_MAP,
)
from app.services.wells_riley import WellsRileyEngine
from app.schemas.risk_assessment import MitigationDelta


class RecommenderService:
    """Generates context-aware epidemiological interventions and quantifies mitigation impact."""

    @classmethod
    def generate_recommendations(
        cls,
        probability: float,
        I: int,
        S: int,
        p: float,
        q: float,
        t: float,
        Q: float,
        kd: float,
        km: float,
        kh: float,
        ei: float,
        eo: float,
    ) -> List[str]:
        """Produces ordered, actionable guidance based on dominant transmission drivers."""
        recs: List[str] = []
        prob_pct = probability * 100.0

        # 1. Immediate Alert & Overall Risk Context
        if probability >= 0.50:
            recs.append(
                f"🚨 CẢNH BÁO MỨC ĐỘ RẤT CAO ({prob_pct:.1f}%): Xác suất lây nhiễm vượt ngưỡng an toàn nghiêm trọng. "
                "Cần tạm hoãn hoạt động đông người hoặc áp dụng ngay toàn bộ các biện pháp kiểm soát nguồn lây."
            )
        elif probability >= 0.20:
            recs.append(
                f"⚠️ NGUY CƠ CAO ({prob_pct:.1f}%): Dự kiến có nhiều ca F1 chuyển thành F0 trong không gian kín. "
                "Cần can thiệp ngay vào hệ thống thông khí và trang bị khẩu trang đạt chuẩn."
            )
        elif probability >= 0.05:
            recs.append(
                f"ℹ️ NGUY CƠ TRUNG BÌNH ({prob_pct:.1f}%): Có khả năng lây lan nếu tiếp xúc kéo dài. "
                "Khuyến nghị duy trì các biện pháp phòng ngừa cơ bản."
            )
        else:
            recs.append(
                f"✅ NGUY CƠ THẤP ({prob_pct:.1f}%): Không gian hiện tại duy trì mức độ an toàn tốt."
            )

        # 2. Mask Intervention Recommendations
        if km > 0.35:  # None or cloth
            recs.append(
                "😷 KHẨU TRANG: Yêu cầu bắt buộc đeo khẩu trang y tế (giảm ~85% lượng virus phát tán & hít vào) "
                "hoặc nâng cấp lên N95/KN95 (giảm >99% mầm bệnh aerosol)."
            )
        elif km > 0.05:  # Surgical
            recs.append(
                "😷 KHẨU TRANG: Đang sử dụng khẩu trang y tế. Để đạt mức bảo vệ tối đa trong phòng kín đông người, "
                "nên khuyến khích sử dụng khẩu trang chuẩn N95/KN95 có độ kín cao."
            )

        # 3. Ventilation & Clean Air Delivery
        # Estimate ACH assuming standard 150m3 room if Q is modest
        if Q < 200.0:
            recs.append(
                f"🌀 THÔNG GIÓ (Hiện tại: {Q:.1f} m³/h): Tốc độ trao đổi khí rất thấp. "
                "Cần mở toàn bộ cửa sổ đối lưu, bật quạt thông gió hoặc bổ sung máy lọc không khí HEPA "
                "để đạt ít nhất 5–6 ACH (tối thiểu 300–500 m³/h khí sạch)."
            )
        elif Q < 450.0:
            recs.append(
                f"🌀 THÔNG GIÓ: Khuyến khích tăng cường thêm cấp khí tươi ngoài trời để đẩy nhanh tốc độ pha loãng hạt khí dung (aerosol)."
            )

        # 4. Safe Exposure Time Limit Calculation (Inverted Wells-Riley for P <= 5%)
        # P_target = 0.05 -> -ln(1 - 0.05) ~ 0.051293
        target_dose = 0.051293
        base_rate = (I * p * q / max(Q, 1.0)) * kd * km * kh
        if base_rate > 0:
            t_safe_hours = target_dose / base_rate
            if t > t_safe_hours:
                if t_safe_hours < 1.0:
                    t_safe_mins = max(5, int(t_safe_hours * 60))
                    recs.append(
                        f"⏱️ THỜI GIAN TIẾP XÚC: Thời gian an toàn tối đa khuyến nghị là {t_safe_mins} phút "
                        f"(hiện đang là {t:.1f} giờ). Cần nghỉ giải lao giữa giờ và thông thoáng phòng 10-15 phút."
                    )
                else:
                    recs.append(
                        f"⏱️ THỜI GIAN TIẾP XÚC: Để giữ nguy cơ lây nhiễm dưới 5%, không nên ở liên tục quá {t_safe_hours:.1f} giờ."
                    )

        # 5. Distancing & Capacity Control
        if kd >= 1.0:
            recs.append(
                "📏 KHOẢNG CÁCH: Duy trì khoảng cách tối thiểu 2 mét giữa các chỗ ngồi để giảm nồng độ aerosol phát tán trực tiếp từ người mang mầm bệnh."
            )

        # 6. F0 Isolation
        if I > 1:
            recs.append(
                f"🩺 CÁCH LY NGUỒN LÂY: Đang có {I} ca F0 trong cùng không gian. "
                "Cần đưa ngay những người có triệu chứng sốt/ho về phòng y tế hoặc cách ly tại nhà để loại bỏ nguồn phát tán hạt mầm bệnh."
            )

        return recs

    @classmethod
    def calculate_mitigation_scenarios(
        cls,
        I: int,
        S: int,
        p: float,
        q: float,
        t: float,
        Q: float,
        kd: float,
        km: float,
        kh: float,
        current_probability_percent: float,
    ) -> List[MitigationDelta]:
        """Calculates what-if projections for standard health intervention strategies."""
        options: List[MitigationDelta] = []
        curr_p = current_probability_percent

        # Scenario 1: Upgrade to 2-way Surgical Masks
        km_surg = MASK_EFFICIENCY_MAP[MaskType.SURGICAL]["combined_km"]
        dose_surg = WellsRileyEngine.compute_dose(I=I, p=p, q=q, t=t, Q=Q, kd=kd, km=km_surg, kh=kh)
        p_surg = WellsRileyEngine.compute_probability(dose_surg) * 100.0
        red_surg = max(0.0, curr_p - p_surg)
        options.append(
            MitigationDelta(
                intervention_name="Khẩu trang Y tế 2 chiều",
                description_vi="Cả F0 và người xung quanh đều đeo khẩu trang y tế 3 lớp đúng quy cách",
                new_probability_percent=round(p_surg, 2),
                risk_reduction_percent=round(red_surg, 2),
            )
        )

        # Scenario 2: Upgrade to N95 Masks
        km_n95 = MASK_EFFICIENCY_MAP[MaskType.N95]["combined_km"]
        dose_n95 = WellsRileyEngine.compute_dose(I=I, p=p, q=q, t=t, Q=Q, kd=kd, km=km_n95, kh=kh)
        p_n95 = WellsRileyEngine.compute_probability(dose_n95) * 100.0
        red_n95 = max(0.0, curr_p - p_n95)
        options.append(
            MitigationDelta(
                intervention_name="Khẩu trang N95 / KN95",
                description_vi="Trang bị khẩu trang N95 chuẩn y tế có độ kín khít cao",
                new_probability_percent=round(p_n95, 2),
                risk_reduction_percent=round(red_n95, 2),
            )
        )

        # Scenario 3: Enhance Ventilation (Increase Clean Air Supply 2.5x)
        Q_boost = max(Q * 2.5, 500.0)
        dose_vent = WellsRileyEngine.compute_dose(I=I, p=p, q=q, t=t, Q=Q_boost, kd=kd, km=km, kh=kh)
        p_vent = WellsRileyEngine.compute_probability(dose_vent) * 100.0
        red_vent = max(0.0, curr_p - p_vent)
        options.append(
            MitigationDelta(
                intervention_name="Tăng cường thông gió tối đa",
                description_vi=f"Nâng lưu lượng khí sạch lên ~{Q_boost:.0f} m³/h (mở thông cửa, quạt hút hoặc máy lọc HEPA)",
                new_probability_percent=round(p_vent, 2),
                risk_reduction_percent=round(red_vent, 2),
            )
        )

        # Scenario 4: Combined Multi-layer Defense (Surgical Mask + Enhanced Ventilation + Safe Distancing)
        dose_combo = WellsRileyEngine.compute_dose(
            I=I, p=p, q=q, t=t, Q=Q_boost, kd=0.6, km=km_surg, kh=kh
        )
        p_combo = WellsRileyEngine.compute_probability(dose_combo) * 100.0
        red_combo = max(0.0, curr_p - p_combo)
        options.append(
            MitigationDelta(
                intervention_name="Phòng ngừa toàn diện đa tầng",
                description_vi="Kết hợp khẩu trang y tế + Tăng thông gió + Giữ khoảng cách >= 2m",
                new_probability_percent=round(p_combo, 2),
                risk_reduction_percent=round(red_combo, 2),
            )
        )

        return options
