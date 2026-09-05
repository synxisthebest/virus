"""Unit tests for Wells-Riley mathematical engine and numerical edge cases."""

import math
import pytest
from app.constants.epidemiology import (
    MaskType,
    RiskLevel,
    DISTANCE_FACTOR_CLOSE_CONTACT,
    DISTANCE_FACTOR_SAFE_DISTANCE,
)
from app.services.wells_riley import WellsRileyEngine


class TestWellsRileyMathEngine:
    """Test suite for core mathematical formulas and edge cases."""

    def test_clean_air_rate_from_cadr(self):
        """Test calculation of Q directly from CADR."""
        Q = WellsRileyEngine.calculate_clean_air_rate(clean_air_delivery_rate=250.0)
        assert Q == 250.0

    def test_clean_air_rate_from_volume_and_ach(self):
        """Test calculation of Q = V * ACH."""
        Q = WellsRileyEngine.calculate_clean_air_rate(
            room_volume_m3=150.0,
            air_changes_per_hour=3.0,
        )
        assert Q == 450.0

    def test_clean_air_rate_zero_safeguard(self):
        """Test that Q <= 0 is safely clamped to minimum threshold."""
        Q_zero = WellsRileyEngine.calculate_clean_air_rate(clean_air_delivery_rate=0.0)
        assert Q_zero >= 1.0

        Q_none = WellsRileyEngine.calculate_clean_air_rate()
        assert Q_none >= 1.0

    def test_mask_factor_calculations(self):
        """Test two-way mask filtration factor km = (1 - ei) * (1 - eo)."""
        # None vs None -> km = 1.0
        km_none, ei_none, eo_none = WellsRileyEngine.calculate_mask_factor(
            MaskType.NONE, MaskType.NONE
        )
        assert km_none == 1.0
        assert ei_none == 0.0
        assert eo_none == 0.0

        # Cloth (ei=0.3, eo=0.5) -> km = 0.7 * 0.5 = 0.35
        km_cloth, _, _ = WellsRileyEngine.calculate_mask_factor(
            MaskType.CLOTH, MaskType.CLOTH
        )
        assert math.isclose(km_cloth, 0.35, rel_tol=1e-3)

        # Surgical (ei=0.5, eo=0.7) -> km = 0.5 * 0.3 = 0.15
        km_surg, _, _ = WellsRileyEngine.calculate_mask_factor(
            MaskType.SURGICAL, MaskType.SURGICAL
        )
        assert math.isclose(km_surg, 0.15, rel_tol=1e-3)

        # N95 (ei=0.95, eo=0.95) -> km = 0.05 * 0.05 = 0.0025
        km_n95, _, _ = WellsRileyEngine.calculate_mask_factor(
            MaskType.N95, MaskType.N95
        )
        assert math.isclose(km_n95, 0.0025, rel_tol=1e-4)

    def test_distance_factor(self):
        """Test physical proximity distance factor kd."""
        kd_close = WellsRileyEngine.calculate_distance_factor(distance_meters=1.0)
        assert kd_close == DISTANCE_FACTOR_CLOSE_CONTACT

        kd_far = WellsRileyEngine.calculate_distance_factor(distance_meters=3.5)
        assert kd_far == DISTANCE_FACTOR_SAFE_DISTANCE

        kd_custom = WellsRileyEngine.calculate_distance_factor(distance_factor=0.75)
        assert kd_custom == 0.75

    def test_dose_and_probability_edge_cases(self):
        """Test edge cases: t=0, I=0, q=0, extreme large dose."""
        # Exposure time = 0 -> dose = 0, P = 0
        dose_t0 = WellsRileyEngine.compute_dose(I=1, p=0.5, q=50, t=0.0, Q=300)
        assert dose_t0 == 0.0
        assert WellsRileyEngine.compute_probability(dose_t0) == 0.0

        # Infector count = 0 -> dose = 0, P = 0
        dose_i0 = WellsRileyEngine.compute_dose(I=0, p=0.5, q=50, t=4.0, Q=300)
        assert dose_i0 == 0.0
        assert WellsRileyEngine.compute_probability(dose_i0) == 0.0

        # Emission rate = 0 -> dose = 0, P = 0
        dose_q0 = WellsRileyEngine.compute_dose(I=1, p=0.5, q=0, t=4.0, Q=300)
        assert dose_q0 == 0.0
        assert WellsRileyEngine.compute_probability(dose_q0) == 0.0

        # Extreme dose -> probability capped at 1.0 without overflow exception
        prob_huge = WellsRileyEngine.compute_probability(1000.0)
        assert prob_huge == 1.0

    def test_known_analytical_benchmark(self):
        """Test standard Wells-Riley analytical benchmark:
        I = 1, p = 0.5 m3/h, q = 100 quanta/h, t = 4 h, Q = 200 m3/h, kd=1, km=1, kh=1
        Dose = 1 * 0.5 * 100 * 4 / 200 = 200 / 200 = 1.0
        P = 1 - exp(-1.0) = 1 - 0.367879 = 0.6321205588
        """
        dose = WellsRileyEngine.compute_dose(I=1, p=0.5, q=100.0, t=4.0, Q=200.0)
        assert math.isclose(dose, 1.0, rel_tol=1e-5)

        prob = WellsRileyEngine.compute_probability(dose)
        assert math.isclose(prob, 0.63212, rel_tol=1e-4)

    def test_risk_classification(self):
        """Test risk tier threshold classification."""
        assert WellsRileyEngine.classify_risk(0.02)[0] == RiskLevel.LOW
        assert WellsRileyEngine.classify_risk(0.10)[0] == RiskLevel.MODERATE
        assert WellsRileyEngine.classify_risk(0.35)[0] == RiskLevel.HIGH
        assert WellsRileyEngine.classify_risk(0.75)[0] == RiskLevel.CRITICAL

    def test_expected_cases_and_rt(self):
        """Test expected cases (D = S * P) and reproduction number (Rt)."""
        # S = 30, P = 0.2, I = 1 -> D = 6.0, Rt = 6.0
        cases = WellsRileyEngine.compute_expected_cases(susceptible_count=30, probability=0.20)
        assert cases == 6.0

        rt = WellsRileyEngine.compute_reproductive_number(
            susceptible_count=30, probability=0.20, infectors_count=1
        )
        assert rt == 6.0
