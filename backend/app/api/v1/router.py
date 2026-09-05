"""API v1 Router aggregation."""

from fastapi import APIRouter
from app.api.v1.endpoints import predict, simulate, presets, health

api_v1_router = APIRouter()

api_v1_router.include_router(health.router, tags=["Health"])
api_v1_router.include_router(predict.router, prefix="/predict", tags=["Prediction"])
api_v1_router.include_router(simulate.router, prefix="/simulate", tags=["Simulation"])
api_v1_router.include_router(presets.router, prefix="/constants", tags=["Constants & Presets"])
