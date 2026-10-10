from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.regions import ResolvedLocation, country_from_timezone, load_regions, resolve_location

router = APIRouter(prefix="/api", tags=["regions"])


@router.get("/regions")
def list_regions() -> dict:
    regions = load_regions()
    return {
        "countries": [c.model_dump() for c in regions.countries],
        "events": regions.events_catalogue,
    }


class GeoIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


@router.post("/geo/resolve", response_model=ResolvedLocation)
async def geo_resolve(body: GeoIn) -> ResolvedLocation:
    """Browser coordinates -> nearest supported city. Coordinates are not logged or stored."""
    return await resolve_location(body.lat, body.lon)


@router.get("/geo/guess")
def geo_guess(tz: str) -> dict:
    """Cheap first guess from the browser's IANA timezone (no permission prompt needed)."""
    code = country_from_timezone(tz)
    if code is None:
        raise HTTPException(404, "timezone not in a supported country")
    return {"country_code": code, "source": "timezone"}
