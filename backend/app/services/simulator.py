"""Simulation service for time-series risk evolution and spatial classroom agent modeling."""

import math
from typing import List, Dict, Any
from app.constants.epidemiology import (
    RiskLevel,
    RISK_THRESHOLDS,
)
from app.services.wells_riley import WellsRileyEngine
from app.services.recommender import RecommenderService
from app.schemas.risk_assessment import WellsRileyPredictRequest
from app.schemas.simulation import (
    TimeSeriesSimulationRequest,
    TimeSeriesSimulationResponse,
    TimeSeriesPoint,
    ChartDataset,
    ClassroomSpatialSimulationRequest,
    ClassroomSpatialSimulationResponse,
    GridSeatResult,
)


class SimulatorService:
    """Orchestrates dynamic simulations across temporal and spatial dimensions."""

    @classmethod
    def run_time_series_simulation(
        cls, request: TimeSeriesSimulationRequest
    ) -> TimeSeriesSimulationResponse:
        """Computes incremental infection risk P(t) over a series of time intervals."""
        # 1. Resolve physical parameters
        Q = WellsRileyEngine.calculate_clean_air_rate(
            clean_air_delivery_rate=request.ventilation.clean_air_delivery_rate,
            room_volume_m3=request.ventilation.room_volume_m3,
            air_changes_per_hour=request.ventilation.air_changes_per_hour,
        )
        km, ei, eo = WellsRileyEngine.calculate_mask_factor(
            mask_type_f0=request.mask_config.mask_type_f0,
            mask_type_susceptible=request.mask_config.mask_type_susceptible,
            custom_inward_efficiency=request.mask_config.custom_inward_efficiency,
            custom_outward_efficiency=request.mask_config.custom_outward_efficiency,
        )
        kd = WellsRileyEngine.calculate_distance_factor(
            distance_factor=request.distance_factor
        )
        kh = request.ventilation_distribution_factor
        p = request.breathing_rate or 0.50
        q = request.quanta_generation_rate or 20.0
        I = request.infected_count
        S = request.susceptible_count

        # 2. Determine time sample points
        if request.custom_time_points and len(request.custom_time_points) > 0:
            time_points = sorted([max(0.0, float(tp)) for tp in request.custom_time_points])
        else:
            time_points = []
            cur_t = request.start_time_hours
            step = max(0.1, request.time_step_hours)
            max_t = min(72.0, max(request.start_time_hours, request.max_time_hours))

            # Include initial point if starting at 0
            if cur_t > 0:
                # Optionally add t = 0
                time_points.append(0.0)

            while cur_t <= max_t + 1e-6:
                time_points.append(round(cur_t, 2))
                cur_t += step

        # Deduplicate and sort
        time_points = sorted(list(dict.fromkeys(time_points)))

        # 3. Compute time-series points
        points: List[TimeSeriesPoint] = []
        labels: List[str] = []
        time_hours_list: List[float] = []
        probabilities_list: List[float] = []
        prob_pct_list: List[float] = []
        expected_cases_list: List[float] = []
        colors_list: List[str] = []

        for t in time_points:
            dose = WellsRileyEngine.compute_dose(I=I, p=p, q=q, t=t, Q=Q, kd=kd, km=km, kh=kh)
            prob = WellsRileyEngine.compute_probability(dose)
            prob_pct = round(prob * 100.0, 2)
            risk_lvl, risk_lbl = WellsRileyEngine.classify_risk(prob)
            cases = WellsRileyEngine.compute_expected_cases(S, prob)
            rt = WellsRileyEngine.compute_reproductive_number(S, prob, I)
            color = RISK_THRESHOLDS[risk_lvl]["color"]

            pt = TimeSeriesPoint(
                time_hours=t,
                time_minutes=round(t * 60, 1),
                infection_probability=round(prob, 4),
                infection_probability_percent=prob_pct,
                risk_level=risk_lvl,
                risk_level_label_vi=risk_lbl,
                expected_new_cases=cases,
                effective_reproductive_number=rt,
                risk_color=color,
            )
            points.append(pt)

            # Chart formatted items
            labels.append(f"{t}h ({int(t*60)}m)")
            time_hours_list.append(t)
            probabilities_list.append(round(prob, 4))
            prob_pct_list.append(prob_pct)
            expected_cases_list.append(cases)
            colors_list.append(color)

        chart_dataset = ChartDataset(
            labels=labels,
            time_hours=time_hours_list,
            probabilities=probabilities_list,
            probability_percentages=prob_pct_list,
            expected_cases=expected_cases_list,
            risk_colors=colors_list,
        )

        # Baseline evaluation for recommendations
        end_prob = points[-1].infection_probability if points else 0.0
        recs = RecommenderService.generate_recommendations(
            probability=end_prob,
            I=I,
            S=S,
            p=p,
            q=q,
            t=request.max_time_hours,
            Q=Q,
            kd=kd,
            km=km,
            kh=kh,
            ei=ei,
            eo=eo,
        )

        summary = {
            "initial_time_hours": time_points[0] if time_points else 0,
            "max_time_hours": time_points[-1] if time_points else 0,
            "final_infection_probability_percent": points[-1].infection_probability_percent if points else 0,
            "final_expected_cases": points[-1].expected_new_cases if points else 0,
            "final_risk_level": points[-1].risk_level.value if points else "LOW",
            "clean_air_flow_Q": Q,
            "mask_factor_km": km,
        }

        return TimeSeriesSimulationResponse(
            simulation_summary=summary,
            data_points_count=len(points),
            time_series=points,
            chart_dataset=chart_dataset,
            recommendations=recs,
        )

    @classmethod
    def run_spatial_classroom_simulation(
        cls, request: ClassroomSpatialSimulationRequest
    ) -> ClassroomSpatialSimulationResponse:
        """Calculates multi-source distance-weighted Wells-Riley transmission risk for each desk in classroom."""
        sick_seats = [s for s in request.seats if s.state == "sick"]
        healthy_seats = [s for s in request.seats if s.state == "healthy"]
        empty_seats = [s for s in request.seats if s.state == "empty-s"]

        results: List[GridSeatResult] = []
        total_prob_pct = 0.0
        max_prob_pct = 0.0
        active_susceptible_count = 0

        for seat in request.seats:
            if seat.state == "empty-s":
                results.append(
                    GridSeatResult(
                        row=seat.row,
                        col=seat.col,
                        state="empty-s",
                        infection_probability=0.0,
                        infection_probability_percent=0.0,
                        risk_level=RiskLevel.LOW,
                        risk_color="#9CA3AF",
                    )
                )
                continue

            if seat.state == "sick":
                results.append(
                    GridSeatResult(
                        row=seat.row,
                        col=seat.col,
                        state="sick",
                        infection_probability=1.0,
                        infection_probability_percent=100.0,
                        risk_level=RiskLevel.CRITICAL,
                        risk_color="#DC2626",
                    )
                )
                continue

            # For susceptible / healthy students: sum dose from all sick students
            total_dose = 0.0
            for infector in sick_seats:
                # Euclidean distance on grid
                d_units = math.sqrt((seat.row - infector.row) ** 2 + (seat.col - infector.col) ** 2)
                d_meters = d_units * request.grid_spacing_meters

                # Distance factor: close contact (< 2m) kd = 1.0; safe distance kd = 0.5
                kd = 1.0 if d_meters < 2.0 else 0.5

                dose_from_f0 = WellsRileyEngine.compute_dose(
                    I=1,
                    p=request.breathing_rate,
                    q=request.quanta_rate,
                    t=request.exposure_time_hours,
                    Q=request.clean_air_flow_Q,
                    kd=kd,
                    km=request.mask_factor_km,
                    kh=request.ventilation_distribution_kh,
                )
                total_dose += dose_from_f0

            prob = WellsRileyEngine.compute_probability(total_dose)
            prob_pct = round(prob * 100.0, 2)
            risk_lvl, _ = WellsRileyEngine.classify_risk(prob)
            color = RISK_THRESHOLDS[risk_lvl]["color"]

            total_prob_pct += prob_pct
            if prob_pct > max_prob_pct:
                max_prob_pct = prob_pct
            active_susceptible_count += 1

            results.append(
                GridSeatResult(
                    row=seat.row,
                    col=seat.col,
                    state="healthy",
                    infection_probability=round(prob, 4),
                    infection_probability_percent=prob_pct,
                    risk_level=risk_lvl,
                    risk_color=color,
                )
            )

        avg_prob_pct = (
            round(total_prob_pct / active_susceptible_count, 2)
            if active_susceptible_count > 0
            else 0.0
        )

        return ClassroomSpatialSimulationResponse(
            total_seats=len(request.seats),
            sick_count=len(sick_seats),
            healthy_count=len(healthy_seats),
            empty_count=len(empty_seats),
            average_risk_percent=avg_prob_pct,
            max_risk_percent=round(max_prob_pct, 2),
            seats_risk_map=results,
        )
