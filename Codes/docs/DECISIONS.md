# Decisions log

Sensible-default choices made during the build (spec §0 rule 8). Each one can be reversed.

## D-001 · Stack: FastAPI + React/Vite + Postgres (Oct 10 2026)
The owner chose **Python + FastAPI** for the backend, **React + Vite** for the frontend, and **PostgreSQL** for the database. This overrides spec §5 (Next.js / Supabase):

| Spec | Built as |
|---|---|
| Next.js API routes | FastAPI (`backend/app/routers`) |
| Separate integrity FastAPI service | `backend/app/integrity/` module inside the same FastAPI app. Its `/integrity/*` routes still require `INTEGRITY_SHARED_SECRET`, but the backend calls the functions in-process. |
| Supabase Postgres | Local PostgreSQL 16, SQLAlchemy 2 (async, asyncpg), Alembic migrations |
| Supabase Storage (private bucket) | `storage/` directory outside any static root, served only through token-checked routes |
| Supabase Realtime | Server-Sent Events from FastAPI (M4) |
| next-intl | i18next + react-i18next |
| shadcn/ui | Hand-built Tailwind v4 components using the same tokens (no CLI generator) |
| `lib/youcam/*.ts` | `backend/app/youcam/` (Python). It is still the only module that knows YouCam paths and payloads. |
| zod (server) | pydantic |
| Probe / smoke scripts in TS | Python (`scripts/probe/*.py`), run with the backend venv |

## D-002 · `.env` reuse through aliases
The shared `.env` already holds keys under other names (`YouCam_Phd_API_KEY`, `OPENROUTER_API_KEY_1`, `SARVAM_2009_API_KEY`, …). `config.py` accepts the spec name first and falls back to these. App settings were appended to `.env` in a clearly marked HAAN block, and no existing line was changed.

## D-003 · Multi-country (owner request, Oct 10 2026)
The owner asked for the product to work across countries, with the user choosing a country and city or letting the UI detect location.
- **Registry:** `seed/regions.json` lists 11 markets (IN, BD, NP, PK, LK, AE, GB, US, CA, AU, SG). Each has a currency, offered UI languages, local event types (e.g. BD: Gaye Holud, Bou Bhat; PK: Baraat, Walima; IN: Haldi, Sangeet), budget presets in local currency, and supported cities.
- **Detection order:** (1) a guess from the browser timezone, with no permission prompt; (2) "Use my location", which sends browser geolocation to `/api/geo/resolve` and snaps it to the nearest supported city within 250 km; (3) a manual country and city picker, which is always available and always wins.
- **Privacy:** coordinates are never stored or logged. Only `country_code` and `city` are saved on the session, along with `location_source`. Reverse geocoding runs offline by default. OSM Nominatim is opt-in through `GEO_REVERSE_PROVIDER=nominatim` and uses coarse (2-decimal, country-zoom) queries.
- **Money:** `sessions.budget_inr` became `budget_amount` + `currency`. Catalogue prices moved to `catalogue_prices(item_id, country_code, currency, amount)`, and an item without a row for a country is not sold there. There is no live FX conversion: each market has its own price list, as a real retailer would.
- **Family abroad:** `voters.country_code` is recorded optionally, because a family often votes from several countries.
- **Languages:** UI languages are still en/hi/bn. A country offers the intersection of its `locales` with the available message files. Urdu, Nepali, Sinhala and Tamil can be added by dropping in a messages file and listing the locale.
- **Retailer insights (K7)** will gain a country filter, with the same suppression of cohorts under 5 applied per country.

## D-004 · Unit ledger counts only live calls
Cache hits and mock calls are recorded with `units=0` semantics (excluded from spend). Refused calls are recorded with `status=refused`, so the store view can show how often the budget blocked a render.
