"""Constants package initialization."""

from app.constants.epidemiology import (
    MaskType,
    ActivityLevel,
    QuantaPreset,
    VentilationType,
    RiskLevel,
    MASK_EFFICIENCY_MAP,
    BREATHING_RATE_MAP,
    QUANTA_RATE_MAP,
    VENTILATION_DISTRIBUTION_MAP,
    DISTANCE_FACTOR_CLOSE_CONTACT,
    DISTANCE_FACTOR_SAFE_DISTANCE,
    RISK_THRESHOLDS,
)

__all__ = [
    "MaskType",
    "ActivityLevel",
    "QuantaPreset",
    "VentilationType",
    "RiskLevel",
    "MASK_EFFICIENCY_MAP",
    "BREATHING_RATE_MAP",
    "QUANTA_RATE_MAP",
    "VENTILATION_DISTRIBUTION_MAP",
    "DISTANCE_FACTOR_CLOSE_CONTACT",
    "DISTANCE_FACTOR_SAFE_DISTANCE",
    "RISK_THRESHOLDS",
]
