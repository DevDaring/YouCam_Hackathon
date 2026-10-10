"""Supported countries/cities and location resolution.

Location rules (privacy): the browser may send coordinates once; we resolve them to the
nearest *supported* city and discard the coordinates. Nothing finer than a city is stored.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache

import httpx
from pydantic import BaseModel

from app.config import ROOT_DIR, get_settings

REGIONS_FILE = ROOT_DIR / "seed" / "regions.json"


class City(BaseModel):
    name: str
    lat: float
    lon: float


class Country(BaseModel):
    code: str
    currency: str
    locales: list[str]
    timezones: list[str]
    events: list[str]
    budget_presets: list[int]
    cities: list[City]


class Regions(BaseModel):
    events_catalogue: dict[str, dict]
    countries: list[Country]

    def get(self, code: str) -> Country | None:
        code = code.upper()
        return next((c for c in self.countries if c.code == code), None)


class ResolvedLocation(BaseModel):
    country_code: str | None
    city: str | None
    distance_km: float | None
    supported: bool
    source: str  # offline | nominatim | timezone


@lru_cache
def load_regions() -> Regions:
    return Regions.model_validate(json.loads(REGIONS_FILE.read_text(encoding="utf-8")))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_city(lat: float, lon: float) -> tuple[Country, City, float]:
    best: tuple[Country, City, float] | None = None
    for country in load_regions().countries:
        for city in country.cities:
            d = haversine_km(lat, lon, city.lat, city.lon)
            if best is None or d < best[2]:
                best = (country, city, d)
    assert best is not None
    return best


def country_from_timezone(tz: str) -> str | None:
    for country in load_regions().countries:
        if tz in country.timezones:
            return country.code
    return None


async def resolve_location(lat: float, lon: float) -> ResolvedLocation:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("coordinates out of range")
    settings = get_settings()
    country, city, dist = nearest_city(lat, lon)
    if dist <= settings.GEO_NEAREST_CITY_MAX_KM:
        return ResolvedLocation(country_code=country.code, city=city.name, distance_km=round(dist, 1), supported=True, source="offline")

    if settings.GEO_REVERSE_PROVIDER == "nominatim":
        code = await _nominatim_country(lat, lon)
        if code:
            supported = load_regions().get(code)
            if supported:
                # In a supported country but far from listed cities: pick that country's nearest city.
                c, d = min(((c, haversine_km(lat, lon, c.lat, c.lon)) for c in supported.cities), key=lambda x: x[1])
                return ResolvedLocation(country_code=code, city=c.name, distance_km=round(d, 1), supported=True, source="nominatim")
            return ResolvedLocation(country_code=code, city=None, distance_km=None, supported=False, source="nominatim")

    return ResolvedLocation(country_code=None, city=None, distance_km=round(dist, 1), supported=False, source="offline")


async def _nominatim_country(lat: float, lon: float) -> str | None:
    # OSM usage policy: identify the app, max 1 req/s, coarse zoom (country level only).
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {"lat": f"{lat:.2f}", "lon": f"{lon:.2f}", "format": "jsonv2", "zoom": 3}
    headers = {"User-Agent": "Haan-VTO/0.1 (hackathon demo)"}
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            code = (r.json().get("address") or {}).get("country_code")
            return code.upper() if code else None
    except httpx.HTTPError:
        return None
