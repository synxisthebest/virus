"""Mathematical engine for the Extended Wells-Riley epidemiological transmission model.

Model Formulation:
------------------
Inhaled Quanta Dose (mu):
    mu = (I * p * q * t / Q) * kd * km * kh

Infection Probability (P):
    P = 1 - exp(-mu) = -expm1(-mu)

Where:
- P  : Individual probability of infection (0.0 <= P <= 1.0)
- I  : Number of infectors (F0) in the room (I >= 1)
- p  : Pulmonary ventilation / breathing rate (m3/hour)
- q  : Pathogen emission / shedding rate (quanta/hour)
- t  : Total duration of exposure (hours)
- Q  : Clean air delivery flow rate (m3/hour) or Q = ACH * V
- kd : Physical distance proximity factor
- km : Two-way mask filtration coefficient: km = (1 - e_i) * (1 - e_o)
- kh : Air distribution / ventilation effectiveness coefficient (Ez)
"""

import math
from typing import Tuple, Dict, Any
from app.constants.epidemiology import (
    MaskType,
    RiskLevel,
    MASK_EFFICIENCY_MAP,
    RISK_THRESHOLDS,
    DISTANCE_FACTOR_CLOSE_CONTACT,
    DISTANCE_FACTOR_SAFE_DISTANCE,
)
from app.core.config import settings


class WellsRileyEngine:
    """Core mathematical engine executing Wells-Riley formulas with robust numerical safeguards."""

    @staticmethod
    def calculate_clean_air_rate(
        clean_air_delivery_rate: float | None = None,
        room_volume_m3: float | None = None,
        air_changes_per_hour: float | None = None,
    ) -> float:
        """Determines the total clean air rate Q (m3/h) from direct CADR or Volume * ACH.

        Applies minimum flow rate safeguard to prevent division-by-zero.
        """
        if clean_air_delivery_rate is not None and clean_air_delivery_rate > 0:
            Q = float(clean_air_delivery_rate)
        elif room_volume_m3 is not None and air_changes_per_hour is not None:
            Q = float(room_volume_m3 * air_changes_per_hour)
        else:
            Q = settings.MIN_AIR_FLOW_M3_PER_HOUR

        # Safeguard: enforce minimum positive airflow to prevent ZeroDivisionError
        return max(Q, settings.MIN_AIR_FLOW_M3_PER_HOUR)

    @staticmethod
    def calculate_mask_factor(
        mask_type_f0: MaskType = MaskType.NONE,
        mask_type_susceptible: MaskType = MaskType.NONE,
        custom_inward_efficiency: float | None = None,
        custom_outward_efficiency: float | None = None,
    ) -> Tuple[float, float, float]:
        """Calculates the two-way mask transmission factor km = (1 - e_i) * (1 - e_o).

        Returns:
            Tuple[km, inward_efficiency e_i, outward_efficiency e_o]
        """
        # Exhalation / outward efficiency of the infected individual (e_o)
        if custom_outward_efficiency is not None:
            e_o = max(0.0, min(1.0, float(custom_outward_efficiency)))
        else:
            e_o = MASK_EFFICIENCY_MAP.get(mask_type_f0, {}).get("outward_efficiency", 0.0)

        # Inhalation / inward efficiency of the susceptible individual (e_i)
        if custom_inward_efficiency is not None:
            e_i = max(0.0, min(1.0, float(custom_inward_efficiency)))
        else:
            e_i = MASK_EFFICIENCY_MAP.get(mask_type_susceptible, {}).get("inward_efficiency", 0.0)

        # km = (1 - e_i) * (1 - e_o)
        km = (1.0 - e_i) * (1.0 - e_o)
        km = max(0.0, min(1.0, km))
        return km, e_i, e_o

    @staticmethod
    def calculate_distance_factor(
        distance_meters: float | None = None,
        distance_factor: float | None = None,
    ) -> float:
        """Computes distance factor kd based on meters or explicit coefficient."""
        if distance_factor is not None and distance_factor > 0:
            return max(0.1, min(2.0, float(distance_factor)))

        if distance_meters is not None:
            if distance_meters < 2.0:
                return DISTANCE_FACTOR_CLOSE_CONTACT  # 1.0
            return DISTANCE_FACTOR_SAFE_DISTANCE  # 0.6

        return 1.0

    @classmethod
    def compute_dose(
        cls,
        I: int,
        p: float,
        q: float,
        t: float,
        Q: float,
        kd: float = 1.0,
        km: float = 1.0,
        kh: float = 1.0,
    ) -> float:
        """Computes the expected inhaled quanta dose (mu).

        Formula:
            mu = (I * p * q * t / Q) * kd * km * kh
        """
        # Edge cases: 0 exposure time, 0 infectors, or 0 emission
        if t <= 0.0 or I <= 0 or p <= 0.0 or q <= 0.0:
            return 0.0

        # Safe denominator
        safe_Q = max(Q, settings.MIN_AIR_FLOW_M3_PER_HOUR)

        mu = (float(I) * float(p) * float(q) * float(t) / safe_Q) * float(kd) * float(km) * float(kh)
        return max(0.0, mu)

    @classmethod
    def compute_probability(cls, dose_mu: float) -> float:
        """Computes infection probability P from dose using numerically stable -expm1(-mu).

        Formula:
            P = 1 - exp(-mu) = -math.expm1(-mu)
        """
        if dose_mu <= 0.0:
            return 0.0

        # Numerical overflow protection: if dose is very large (e.g. > 700), P is practically 1.0
        if dose_mu >= settings.DEFAULT_EXPONENT_CLIP:
            return 1.0

        # math.expm1(-mu) calculates exp(-mu) - 1 with high precision for small mu
        p = -math.expm1(-dose_mu)
        return max(0.0, min(1.0, p))

    @classmethod
    def classify_risk(cls, probability: float) -> Tuple[RiskLevel, str]:
        """Classifies infection probability into standard epidemiological risk tiers."""
        if probability < RISK_THRESHOLDS[RiskLevel.LOW]["max_p"]:
            return RiskLevel.LOW, RISK_THRESHOLDS[RiskLevel.LOW]["label_vi"]
        elif probability < RISK_THRESHOLDS[RiskLevel.MODERATE]["max_p"]:
            return RiskLevel.MODERATE, RISK_THRESHOLDS[RiskLevel.MODERATE]["label_vi"]
        elif probability < RISK_THRESHOLDS[RiskLevel.HIGH]["max_p"]:
            return RiskLevel.HIGH, RISK_THRESHOLDS[RiskLevel.HIGH]["label_vi"]
        else:
            return RiskLevel.CRITICAL, RISK_THRESHOLDS[RiskLevel.CRITICAL]["label_vi"]

    @classmethod
    def compute_expected_cases(cls, susceptible_count: int, probability: float) -> float:
        """Calculates expected secondary infections D = S * P."""
        if susceptible_count <= 0 or probability <= 0.0:
            return 0.0
        return round(float(susceptible_count) * probability, 2)

    @classmethod
    def compute_reproductive_number(
        cls, susceptible_count: int, probability: float, infectors_count: int = 1
    ) -> float:
        """Calculates effective indoor reproduction number Rt = (S * P) / I."""
        if infectors_count <= 0 or susceptible_count <= 0:
            return 0.0
        rt = (float(susceptible_count) * probability) / float(infectors_count)
        return round(rt, 2)

    @classmethod
    def calculate_full_assessment(
        cls,
        I: int,
        S: int,
        p: float,
        q: float,
        t: float,
        Q: float,
        kd: float = 1.0,
        km: float = 1.0,
        kh: float = 1.0,
        ei: float = 0.0,
        eo: float = 0.0,
    ) -> Dict[str, Any]:
        """Executes full mathematical evaluation and returns structured results."""
        dose = cls.compute_dose(I=I, p=p, q=q, t=t, Q=Q, kd=kd, km=km, kh=kh)
        prob = cls.compute_probability(dose)
        prob_pct = round(prob * 100.0, 2)
        risk_lvl, risk_lbl = cls.classify_risk(prob)
        expected_cases = cls.compute_expected_cases(S, prob)
        rt = cls.compute_reproductive_number(S, prob, I)

        return {
            "infection_probability": round(prob, 4),
            "infection_probability_percent": prob_pct,
            "risk_level": risk_lvl,
            "risk_level_label_vi": risk_lbl,
            "expected_new_cases": expected_cases,
            "effective_reproductive_number": rt,
            "parameters_breakdown": {
                "infected_count_I": I,
                "susceptible_count_S": S,
                "breathing_rate_p_m3h": round(p, 3),
                "quanta_rate_q_per_h": round(q, 2),
                "exposure_time_t_hours": round(t, 2),
                "clean_air_flow_Q_m3h": round(Q, 2),
                "distance_factor_kd": round(kd, 3),
                "mask_factor_km": round(km, 4),
                "mask_inward_efficiency_ei": round(ei, 3),
                "mask_outward_efficiency_eo": round(eo, 3),
                "ventilation_distribution_kh": round(kh, 3),
                "inhaled_quanta_dose": round(dose, 6),
            },
        }
