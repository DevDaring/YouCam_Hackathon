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

## D-005 · Name: DearMe (owner, Oct 10 2026)
The product is called **DearMe**. The family vote buttons keep the words Haan / Hmm / Na.
- **Logo:** an original mark of a hand mirror shaped like a jharokha (ogee) arch, holding a heart, so "see yourself, loved". Wordmark is Fraunces, with italic "Dear" and bold "Me".
- **Files:** `frontend/src/components/Logo.tsx`, `public/favicon.svg`, `public/logo-mark.svg`, `public/og-image.png`, `public/apple-touch-icon.png`.

## D-006 · Shopper login with a public jury account (owner, Oct 10 2026)
The owner asked for a login page that shows the demo credentials, with a "Fill in" button.
- **Credentials:** `DEMO_USER` / `DEMO_PASSWORD` (default `TestUser` / `TestUser11`). They are seeded at startup and served by `GET /api/auth/demo`.
- **Sessions:** passwords are hashed with scrypt. The session cookie is an opaque, HttpOnly, SameSite=Lax value, Secure in production, and only its sha256 is stored. Failed logins are limited to 10 per IP per 5 minutes; uvicorn runs with `--proxy-headers` so the limiter sees real IPs behind Caddy.
- **What is protected:** `/start`, `/studio`, `/pack`, `/store` and `/demo` need a login. `/` and `/room/:token` stay public, because family voters never sign in (spec K2).

## D-007 · Hosting (owner, Oct 10 2026)
- **URL:** `https://dearme.koushikdeb.com`. The NameSilo A record `dearme` points to 154.12.116.152, and Caddy handles TLS through ACME.
- **Files:** everything lives in `/home/Debz/Host/dearme`: `web/` (static build), `backend/` (own venv), and a generated `.env` that holds only DearMe's keys with production overrides.
- **Process and proxy:** uvicorn runs on `127.0.0.1:8160` and Caddy proxies `/api/*` to it. The Caddy block sits between `# >>> dearme` markers in `/home/Debz/Host/saarthi/Caddyfile`.
- **Restarts:** cron runs `@reboot` and a `*/5` watchdog (`autostart.sh`), the same pattern as the owner's other apps.
- **Database:** a separate Postgres database, `dearme`, so dev and test data never reach production.
- **Mode:** production runs `MOCK_MODE=true` until YouCam units are available.
- **Permissions-Policy:** allows camera, microphone and geolocation for the site's own origin only, for photo capture, voice notes and the nearest-city lookup.

## D-008 · AI models other than YouCam (owner, Oct 10 2026)
**Language tasks** (change plans, translation, rewording, explanations): **DeepSeek first, Kimi as fallback.** The owner chose these because they are cheap. OpenRouter, Anthropic and Gemini are no longer used for this. Client: `backend/app/agent/llm.py`.

Live comparison on 2026-10-10, using a Bengali voice-note test with strict JSON output:

| Model | Time | Result | Role |
|---|---|---|---|
| `deepseek-flash` | 1.7 s | Correct layer (necklace); the skin remark was turned into colour-contrast advice | **Primary.** Key 1 has $42.69, key 2 has $6.17. |
| `deepseek-v4-pro` | 11.5 s | Merged two requests into one "outfit" change | Not used |
| `kimi-k2.6` | 60 s | Spent its whole token budget reasoning and returned no answer. It only accepts temperature = 1 | Last-resort fallback only, run with temperature 1 and a 4k token budget. $14.21 available. |

The model in `.env` (`deepseek-chat`) does not appear in the live model list, so the app ignores it.

**Image generation** (demo catalogue, probe garments, labelled AI demo shopper): **NanoGPT** (owner's choice, replacing Gemini). It lists 243 image models. The only key in `.env`, stored under two names, is rejected (401 "Invalid session"), so a new key is needed before choosing the model.

**Speech:** Sarvam for speech-to-text, with Whisper as fallback. **Identity Lock and Harmony Score** need no AI model (MediaPipe and colour maths).
