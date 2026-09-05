"""Epidemiological constants, lookup tables, and risk thresholds for Wells-Riley modeling."""

from enum import Enum
from typing import Dict, Any


class MaskType(str, Enum):
    """Supported standardized mask types."""
    NONE = "none"
    CLOTH = "cloth"
    SURGICAL = "surgical"
    KN95 = "kn95"
    N95 = "n95"


class ActivityLevel(str, Enum):
    """Activity levels and standard breathing flow rates."""
    RESTING = "resting"
    STANDING = "standing"
    SPEAKING = "speaking"
    LIGHT_EXERCISE = "light_exercise"
    HEAVY_EXERCISE = "heavy_exercise"


class QuantaPreset(str, Enum):
    """Vocalization and influenza pathogen shedding rates."""
    ORAL_BREATHING = "oral_breathing"
    SPEAKING_QUIET = "speaking_quiet"
    SPEAKING_NORMAL = "speaking_normal"
    SPEAKING_LOUD = "speaking_loud"
    COUGHING_SNEEZING = "coughing_sneezing"


class VentilationType(str, Enum):
    """Ventilation system patterns and distribution effectiveness (Ez / kh)."""
    POOR_MIXING = "poor_mixing"
    WELL_MIXED = "well_mixed"
    DISPLACEMENT = "displacement"


class RiskLevel(str, Enum):
    """Categorical risk classification levels."""
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# Mask filtration efficiency: (inward_efficiency e_i, outward_efficiency e_o)
MASK_EFFICIENCY_MAP: Dict[MaskType, Dict[str, float]] = {
    MaskType.NONE: {
        "inward_efficiency": 0.0,
        "outward_efficiency": 0.0,
        "combined_km": 1.0,
        "description_vi": "Không đeo khẩu trang",
    },
    MaskType.CLOTH: {
        "inward_efficiency": 0.30,
        "outward_efficiency": 0.50,
        "combined_km": 0.35,  # (1 - 0.30) * (1 - 0.50)
        "description_vi": "Khẩu trang vải tái sử dụng thông thường",
    },
    MaskType.SURGICAL: {
        "inward_efficiency": 0.50,
        "outward_efficiency": 0.70,
        "combined_km": 0.15,  # (1 - 0.50) * (1 - 0.70)
        "description_vi": "Khẩu trang y tế 3-4 lớp tiêu chuẩn",
    },
    MaskType.KN95: {
        "inward_efficiency": 0.90,
        "outward_efficiency": 0.90,
        "combined_km": 0.01,  # (1 - 0.90) * (1 - 0.90)
        "description_vi": "Khẩu trang lọc bụi mịn & vi khuẩn KN95",
    },
    MaskType.N95: {
        "inward_efficiency": 0.95,
        "outward_efficiency": 0.95,
        "combined_km": 0.0025,  # (1 - 0.95) * (1 - 0.95)
        "description_vi": "Khẩu trang chuyên dụng N95 chuẩn y tế",
    },
}

# Pulmonary ventilation rates (m3/h) per person
BREATHING_RATE_MAP: Dict[ActivityLevel, Dict[str, Any]] = {
    ActivityLevel.RESTING: {
        "rate_m3_per_hour": 0.50,
        "name_vi": "Nghỉ ngơi / Ngồi yên",
        "description_vi": "Thở nhẹ nhàng khi ngồi đọc sách hoặc nghe giảng",
    },
    ActivityLevel.STANDING: {
        "rate_m3_per_hour": 0.60,
        "name_vi": "Đứng / Đi lại nhẹ",
        "description_vi": "Đứng làm việc hoặc di chuyển chậm trong phòng",
    },
    ActivityLevel.SPEAKING: {
        "rate_m3_per_hour": 0.75,
        "name_vi": "Nói chuyện / Thảo luận",
        "description_vi": "Học sinh tham gia phát biểu hoặc trao đổi bài",
    },
    ActivityLevel.LIGHT_EXERCISE: {
        "rate_m3_per_hour": 1.25,
        "name_vi": "Vận động nhẹ",
        "description_vi": "Đi lại nhanh, làm việc tay chân nhẹ",
    },
    ActivityLevel.HEAVY_EXERCISE: {
        "rate_m3_per_hour": 1.80,
        "name_vi": "Vận động mạnh",
        "description_vi": "Tập thể dục, vận động thể chất cường độ cao",
    },
}

# Quanta shedding generation rates (quanta/hour)
QUANTA_RATE_MAP: Dict[QuantaPreset, Dict[str, Any]] = {
    QuantaPreset.ORAL_BREATHING: {
        "quanta_per_hour": 5.0,
        "name_vi": "Thở nhẹ qua miệng",
        "description_vi": "F0 ngồi im, không nói chuyện, chỉ thở bình thường",
    },
    QuantaPreset.SPEAKING_QUIET: {
        "quanta_per_hour": 20.0,
        "name_vi": "Nói nhỏ / Thì thầm",
        "description_vi": "F0 nói chuyện nhỏ nhẹ hoặc trò chuyện gián đoạn",
    },
    QuantaPreset.SPEAKING_NORMAL: {
        "quanta_per_hour": 50.0,
        "name_vi": "Nói chuyện bình thường",
        "description_vi": "F0 giao tiếp liên tục với giọng nói tự nhiên",
    },
    QuantaPreset.SPEAKING_LOUD: {
        "quanta_per_hour": 100.0,
        "name_vi": "Nói to / Thuyết trình / Hát",
        "description_vi": "F0 thuyết trình, giảng bài hoặc ca hát tạo nhiều aerosol",
    },
    QuantaPreset.COUGHING_SNEEZING: {
        "quanta_per_hour": 150.0,
        "name_vi": "Ho khan / Hắt hơi",
        "description_vi": "F0 có triệu chứng ho hoặc hắt hơi thường xuyên",
    },
}

# Ventilation effectiveness distribution factor (kh / Ez)
VENTILATION_DISTRIBUTION_MAP: Dict[VentilationType, Dict[str, Any]] = {
    VentilationType.POOR_MIXING: {
        "factor_kh": 0.70,
        "name_vi": "Thông gió kém / Góc đọng khí",
        "description_vi": "Phòng kín không có quạt lưu thông, luồng khí đọng lại",
    },
    VentilationType.WELL_MIXED: {
        "factor_kh": 1.00,
        "name_vi": "Trộn đều tiêu chuẩn (Well-mixed)",
        "description_vi": "Hệ thống quạt đối lưu hoặc điều hòa cấp khí phân bổ đều",
    },
    VentilationType.DISPLACEMENT: {
        "factor_kh": 1.20,
        "name_vi": "Thông gió dịch chuyển (Displacement)",
        "description_vi": "Hệ thống cấp khí sạch ở tầng thấp và hút khí thải ở trần",
    },
}

# Distance factor boundaries (kd)
DISTANCE_FACTOR_CLOSE_CONTACT = 1.00  # Distance < 2 meters
DISTANCE_FACTOR_SAFE_DISTANCE = 0.60  # Distance >= 2 meters

# Risk thresholds based on Wells-Riley probability (P)
RISK_THRESHOLDS = {
    RiskLevel.LOW: {"max_p": 0.05, "label_vi": "Thấp", "color": "#10B981"},
    RiskLevel.MODERATE: {"max_p": 0.20, "label_vi": "Trung bình", "color": "#F59E0B"},
    RiskLevel.HIGH: {"max_p": 0.50, "label_vi": "Cao", "color": "#EF4444"},
    RiskLevel.CRITICAL: {"max_p": 1.00, "label_vi": "Rất cao (Khẩn cấp)", "color": "#991B1B"},
}
