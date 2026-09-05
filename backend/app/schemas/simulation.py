"""Pydantic schemas and DTOs for Time-Series Simulation and Spatial Classroom Modeling."""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from app.constants.epidemiology import RiskLevel
from app.schemas.risk_assessment import WellsRileyPredictRequest, MitigationDelta


class TimeSeriesSimulationRequest(WellsRileyPredictRequest):
    """Request schema for time-series transmission simulation."""
    start_time_hours: float = Field(
        default=0.5,
        ge=0.0,
        description="Starting time in hours for the simulation trajectory",
    )
    max_time_hours: float = Field(
        default=8.0,
        gt=0.0,
        le=72.0,
        description="Maximum exposure duration in hours (e.g. 8.0 for a school/work day)",
    )
    time_step_hours: float = Field(
        default=0.5,
        gt=0.0,
        le=4.0,
        description="Time increment interval between simulation data points",
    )
    custom_time_points: Optional[List[float]] = Field(
        default=None,
        description="Optional list of explicit custom time points in hours to simulate",
    )


class TimeSeriesPoint(BaseModel):
    """Individual data point in the time-series trajectory."""
    time_hours: float
    time_minutes: float
    infection_probability: float
    infection_probability_percent: float
    risk_level: RiskLevel
    risk_level_label_vi: str
    expected_new_cases: float
    effective_reproductive_number: float
    risk_color: str


class ChartDataset(BaseModel):
    """Pre-formatted dataset ready for direct consumption by Chart.js or Recharts."""
    labels: List[str]
    time_hours: List[float]
    probabilities: List[float]
    probability_percentages: List[float]
    expected_cases: List[float]
    risk_colors: List[str]


class TimeSeriesSimulationResponse(BaseModel):
    """Response payload for time-series risk evolution."""
    simulation_summary: Dict[str, Any]
    data_points_count: int
    time_series: List[TimeSeriesPoint]
    chart_dataset: ChartDataset
    recommendations: List[str]


# Classroom spatial grid simulation schemas
class GridSeatInput(BaseModel):
    """Individual student seat position and health state in classroom grid."""
    row: int
    col: int
    state: str = Field(
        default="healthy",
        description="Seat state: 'sick' (F0 infector), 'healthy' (susceptible), or 'empty-s' (empty)",
    )


class ClassroomSpatialSimulationRequest(BaseModel):
    """Request schema for multi-agent classroom grid simulation."""
    rows: int = Field(default=5, ge=1, le=20)
    cols: int = Field(default=8, ge=1, le=20)
    grid_spacing_meters: float = Field(default=1.0, gt=0.1, le=5.0)
    breathing_rate: float = Field(default=0.5, gt=0.0)
    quanta_rate: float = Field(default=20.0, gt=0.0)
    exposure_time_hours: float = Field(default=4.0, gt=0.0)
    clean_air_flow_Q: float = Field(default=300.0, gt=0.0)
    mask_factor_km: float = Field(default=1.0, ge=0.0, le=1.0)
    ventilation_distribution_kh: float = Field(default=1.0, ge=0.1, le=2.0)
    seats: List[GridSeatInput]


class GridSeatResult(BaseModel):
    """Resulting transmission risk for a specific seat in the classroom grid."""
    row: int
    col: int
    state: str
    infection_probability: float
    infection_probability_percent: float
    risk_level: RiskLevel
    risk_color: str


class ClassroomSpatialSimulationResponse(BaseModel):
    """Simulation output with spatial risk distribution for all classroom seats."""
    total_seats: int
    sick_count: int
    healthy_count: int
    empty_count: int
    average_risk_percent: float
    max_risk_percent: float
    seats_risk_map: List[GridSeatResult]
