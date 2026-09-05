"""Pydantic schemas and DTOs for Wells-Riley instant prediction endpoint."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, model_validator
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
)


class MaskConfigInput(BaseModel):
    """Configuration for masks worn by infectors (F0) and susceptible individuals."""
    mask_type_f0: MaskType = Field(
        default=MaskType.NONE,
        description="Type of mask worn by infected persons (source control)",
    )
    mask_type_susceptible: MaskType = Field(
        default=MaskType.NONE,
        description="Type of mask worn by healthy/susceptible persons (inhalation protection)",
    )
    custom_inward_efficiency: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Custom mask inward filtration efficiency e_i (0.0 - 1.0)",
    )
    custom_outward_efficiency: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Custom mask outward filtration efficiency e_o (0.0 - 1.0)",
    )


class VentilationInput(BaseModel):
    """Ventilation parameters specifying fresh air delivery rate."""
    clean_air_delivery_rate: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Total clean air delivery rate Q (m3/h).",
    )
    room_volume_m3: Optional[float] = Field(
        default=None,
        gt=0.0,
        description="Room volume in cubic meters (V). Required if using ACH.",
    )
    air_changes_per_hour: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Air changes per hour (ACH). Required if using room volume.",
    )

    @model_validator(mode="after")
    def validate_ventilation_specs(self) -> "VentilationInput":
        """Ensures that either clean_air_delivery_rate or (room_volume_m3 and air_changes_per_hour) is provided."""
        has_cadr = self.clean_air_delivery_rate is not None and self.clean_air_delivery_rate > 0
        has_ach_volume = (
            self.room_volume_m3 is not None
            and self.room_volume_m3 > 0
            and self.air_changes_per_hour is not None
            and self.air_changes_per_hour >= 0
        )

        if not has_cadr and not has_ach_volume:
            raise ValueError(
                "Phải cung cấp ít nhất 'clean_air_delivery_rate' (m3/h) HOẶC cặp ['room_volume_m3', 'air_changes_per_hour']."
            )
        return self


class WellsRileyPredictRequest(BaseModel):
    """Request payload for Wells-Riley single scenario risk evaluation."""
    infected_count: int = Field(
        default=1,
        ge=1,
        description="Number of active infected individuals in the room (I >= 1)",
    )
    susceptible_count: int = Field(
        default=30,
        ge=1,
        description="Number of susceptible healthy occupants in the room (S >= 1)",
    )
    breathing_rate: Optional[float] = Field(
        default=None,
        gt=0.0,
        description="Pulmonary ventilation rate p (m3/h). e.g., 0.5 (rest), 0.75 (speech), 1.5 (exercise)",
    )
    activity_level: Optional[ActivityLevel] = Field(
        default=None,
        description="Preset activity level if breathing_rate is not directly given",
    )
    quanta_generation_rate: Optional[float] = Field(
        default=None,
        gt=0.0,
        description="Quanta shedding rate q (quanta/h). e.g., 5 (rest), 50 (talk), 100 (loud speech)",
    )
    quanta_preset: Optional[QuantaPreset] = Field(
        default=None,
        description="Preset vocalization/pathogen shedding if quanta_generation_rate is not given",
    )
    exposure_time_hours: float = Field(
        ...,
        gt=0.0,
        le=168.0,
        description="Total duration of exposure in hours (t > 0)",
    )
    ventilation: VentilationInput = Field(
        ...,
        description="Ventilation parameters (CADR Q or Volume + ACH)",
    )
    distance_factor: float = Field(
        default=1.0,
        gt=0.0,
        le=2.0,
        description="Distance proximity factor kd (1.0 = close contact <2m, 0.5-0.8 = safe distance >=2m)",
    )
    mask_config: MaskConfigInput = Field(
        default_factory=MaskConfigInput,
        description="Mask configuration for infectors and susceptible individuals",
    )
    ventilation_distribution_factor: float = Field(
        default=1.0,
        gt=0.0,
        le=2.0,
        description="Ventilation distribution efficiency factor kh / Ez (0.5 to 1.2)",
    )
    ventilation_type: Optional[VentilationType] = Field(
        default=None,
        description="Preset ventilation system pattern if ventilation_distribution_factor is not given",
    )

    @model_validator(mode="after")
    def resolve_defaults(self) -> "WellsRileyPredictRequest":
        """Resolve preset values if explicit numeric rates are omitted."""
        # Resolve breathing rate p
        if self.breathing_rate is None:
            if self.activity_level is not None and self.activity_level in BREATHING_RATE_MAP:
                self.breathing_rate = BREATHING_RATE_MAP[self.activity_level]["rate_m3_per_hour"]
            else:
                self.breathing_rate = 0.50  # Default resting breathing rate (m3/h)

        # Resolve quanta rate q
        if self.quanta_generation_rate is None:
            if self.quanta_preset is not None and self.quanta_preset in QUANTA_RATE_MAP:
                self.quanta_generation_rate = QUANTA_RATE_MAP[self.quanta_preset]["quanta_per_hour"]
            else:
                self.quanta_generation_rate = 20.0  # Default mild conversational shedding

        # Resolve ventilation distribution kh
        if self.ventilation_type is not None and self.ventilation_type in VENTILATION_DISTRIBUTION_MAP:
            self.ventilation_distribution_factor = VENTILATION_DISTRIBUTION_MAP[self.ventilation_type]["factor_kh"]

        return self


class ParametersBreakdown(BaseModel):
    """Detailed breakdown of calculated physical and epidemiological parameters."""
    infected_count_I: int
    susceptible_count_S: int
    breathing_rate_p_m3h: float
    quanta_rate_q_per_h: float
    exposure_time_t_hours: float
    clean_air_flow_Q_m3h: float
    distance_factor_kd: float
    mask_factor_km: float
    mask_inward_efficiency_ei: float
    mask_outward_efficiency_eo: float
    ventilation_distribution_kh: float
    inhaled_quanta_dose: float


class MitigationDelta(BaseModel):
    """Estimated risk reduction when applying a specific intervention."""
    intervention_name: str
    description_vi: str
    new_probability_percent: float
    risk_reduction_percent: float


class WellsRileyPredictResponse(BaseModel):
    """Output prediction response from the Wells-Riley model."""
    infection_probability: float = Field(
        ...,
        description="Individual infection probability P (0.0 to 1.0)",
    )
    infection_probability_percent: float = Field(
        ...,
        description="Individual infection probability as percentage (0.0% to 100.0%)",
    )
    risk_level: RiskLevel = Field(
        ...,
        description="Risk category classification (LOW, MODERATE, HIGH, CRITICAL)",
    )
    risk_level_label_vi: str = Field(
        ...,
        description="Vietnamese descriptive label for the risk level",
    )
    expected_new_cases: float = Field(
        ...,
        description="Expected number of secondary infections D = S * P",
    )
    effective_reproductive_number: float = Field(
        ...,
        description="Estimated indoor reproduction number Rt = (S * P) / I",
    )
    parameters_used: ParametersBreakdown = Field(
        ...,
        description="Full breakdown of parameters and intermediate calculations",
    )
    recommendations: List[str] = Field(
        ...,
        description="Dynamic actionable health recommendations to reduce transmission risk",
    )
    mitigation_options: List[MitigationDelta] = Field(
        default_factory=list,
        description="Comparison of alternative mitigation measures and projected risk reductions",
    )
