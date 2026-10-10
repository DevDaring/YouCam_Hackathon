import pytest

from app.regions import country_from_timezone, haversine_km, load_regions, nearest_city, resolve_location


def test_every_country_has_cities_events_and_known_event_keys():
    regions = load_regions()
    assert len(regions.countries) >= 10
    for c in regions.countries:
        assert c.cities and c.events and c.locales and len(c.currency) == 3
        assert set(c.events) <= set(regions.events_catalogue), c.code


def test_haversine_known_distance():
    # Kolkata -> Delhi is ~1,300 km great-circle
    assert 1250 < haversine_km(22.5726, 88.3639, 28.6139, 77.2090) < 1350


@pytest.mark.parametrize("lat,lon,code,city", [
    (22.60, 88.40, "IN", "Kolkata"),
    (23.75, 90.39, "BD", "Dhaka"),
    (51.50, -0.10, "GB", "London"),
    (40.55, -74.40, "US", "Edison"),
    (-33.90, 151.20, "AU", "Sydney"),
])
async def test_resolve_to_nearest_supported_city(lat, lon, code, city):
    loc = await resolve_location(lat, lon)
    assert (loc.country_code, loc.city, loc.supported) == (code, city, True)


async def test_far_from_any_supported_city_is_unsupported_offline():
    loc = await resolve_location(48.85, 2.35)  # Paris
    assert loc.supported is False and loc.country_code is None


def test_timezone_guess():
    assert country_from_timezone("Asia/Kolkata") == "IN"
    assert country_from_timezone("Asia/Calcutta") == "IN"
    assert country_from_timezone("Europe/Paris") is None


def test_nearest_city_returns_country():
    country, city, _ = nearest_city(24.90, 67.05)
    assert (country.code, city.name) == ("PK", "Karachi")


async def test_regions_api(client):
    r = await client.get("/api/regions")
    assert r.status_code == 200
    assert {c["code"] for c in r.json()["countries"]} >= {"IN", "BD", "GB", "US"}
    r = await client.post("/api/geo/resolve", json={"lat": 999, "lon": 0})
    assert r.status_code == 422
