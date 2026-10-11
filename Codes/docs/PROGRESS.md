# Progress

## M0 — Scaffold (done, Oct 10 2026)
- Stack per D-001: FastAPI (Python 3.11) + React 19/Vite 6 + PostgreSQL 16 (local; DBs `haan` and `haan_test`, role `haan`).
- `backend/app/config.py`: one typed settings module that fails fast. It reuses the shared `.env` key names through aliases (D-002).
- Schema (Alembic `c139335095d9`): all tables from spec §11, plus multi-country fields and `catalogue_prices` (D-003).
- **Multi-country** (owner request): 11 markets in `seed/regions.json`; `/api/regions`, `/api/geo/resolve` (nearest supported city, coordinates never stored), `/api/geo/guess` (timezone).
- Claim linter: `scripts/claim_lint.py`, currently 0 hits.
- Frontend shell: landing page, event setup, location picker, en/hi/bn i18n (see the frontend section of the README).

## M1 — YouCam module + ledger + mock mode + probe (code done; probe blocked)
- `docs/API_NOTES.md`: every endpoint verified against the official OpenAPI bundles. Two free live calls were made: balance and price list.
- `backend/app/youcam/` is the only module that knows paths and payloads:
  - `features.py`: slugs, versions and unit prices from the live price list.
  - `client.py`: upload, task, poll, balance and template calls.
  - `service.py`: cache → mock → budget → live → ledger, plus typed wrappers.
  - `mock.py`: fixtures plus synthetic labelled renders.
- Unit ledger: budget minus reserve is enforced before every live call. Engine errors are recorded as unbilled. The balance is measured on the first call and every 20th call.
- Render cache: sha256(feature, input hashes, params). A hit costs 0 units and makes no HTTP call.
- Tests: 23 pytest tests pass (regions, ledger, cache, polling, mock mode, live path via fake transport, error parsing, budget refusal).
- **Garment probe: `scripts/probe/garment_probe.py` is ready but NOT RUN.**
  1. The live YouCam balance is **0 units** (`scripts/probe/balance.py`).
  2. It needs `scripts/probe/inputs/shopper.jpg` (the owner's own photo) and AI-generated or licensed garment images with a `manifest.json`.

## Rebrand, login, hosting (Oct 10 2026)
- **DearYou:** new name and original logo (D-005).
- **Login:** a sign-in page with a jury demo card that has a **Fill in** button (D-006).
- **Live:** https://dearyou.koushikdeb.com (D-007). Deploy with `bash scripts/deploy.sh`.
- **Tests:** backend 26 passed; frontend 27 passed; claim linter 0 hits.

## Photo step (Oct 11 2026, owner report: "stuck on this page")
- **Review step:** a consent checkbox, then "Continue to photo". This creates a server session (`POST /api/sessions`), checked against the country's events, currency and cities.
- **`/photo/:id`:** a full-length photo (required), then an optional face close-up. Each has **Take my photo** and **Upload a photo**.
  - **Camera:** a full-screen viewfinder with a body outline or face oval, a live light check, front/back switch, and a 3s/10s timer. If the camera is denied or missing, it offers upload instead.
  - **Upload:** large photos are shrunk in the browser first.
- **Server intake:** Pillow decodes the file, EXIF rotation is applied, and the image is re-encoded with all metadata, including GPS, stripped. Limits are 12 MB and a 320 px minimum.
- **Quality check:** light, sharpness, face found (MediaPipe BlazeFace, with a tiled pass for small faces in full-length photos), face size and framing. Results are shown as translated messages, and "Continue anyway" is always offered.
- **`/studio/:id`:** shows the saved photos, the event, when the photos will be deleted, and three look slots. It says honestly that try-on rendering is waiting on YouCam units.
- **Retention job:** expired sessions, their files and their rows are deleted every 15 minutes.
- **Tests:** backend 37 passed, frontend 28 passed. Verified live on production with a real portrait.

## Next
- Owner adds units and provides the probe inputs. Run `garment_probe.py --yes` and review the drape results.
- Then M2: Look Studio.
