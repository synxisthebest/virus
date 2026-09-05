"""Pydantic schemas for epidemiological lookup constants and metadata presets."""

from typing import List, Dict, Any
from pydantic import BaseModel


class PresetItem(BaseModel):
    """Metadata item for a specific parameter preset."""
    id: str
    name_vi: str
    description_vi: str
    value: Any


class PresetsResponse(BaseModel):
    """Response containing all system-wide epidemiological lookup tables."""
    mask_types: List[Dict[str, Any]]
    activity_levels: List[Dict[str, Any]]
    quanta_presets: List[Dict[str, Any]]
    ventilation_types: List[Dict[str, Any]]
    risk_thresholds: Dict[str, Any]
