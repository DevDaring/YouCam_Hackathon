# Haan — frontend (M0 shell)

Vite 6 + React 19 + TypeScript, Tailwind v4 (`@tailwindcss/vite`), react-router 7, i18next, Framer Motion.

```bash
npm run dev     # http://localhost:5173 — proxies /api and /health to http://localhost:8000
npm run build   # tsc -b && vite build
npm test        # vitest run
```

The frontend holds no secrets. `VITE_IMAGE_RETENTION_HOURS` (public, optional, default 24) sets the
"photos auto-deleted after N hours" copy.

## Layout

- `src/lib/region.tsx` — country/city/currency/locale context (timezone guess → `/api/geo/guess`,
  opt-in "Use my location" → `/api/geo/resolve` with coordinates rounded to 2 dp and never stored).
- `src/lib/format.ts` — `formatCurrency`, `formatNumber`, `countryName` (Intl.DisplayNames), `flagEmoji`.
- `src/i18n/messages/{en,hi,bn}.json` — complete in all three; `src/i18n/messages.test.ts` enforces parity.
- `src/pages` — Landing, Start (event setup), Placeholder (room/studio/pack/store/demo), NotFound.

## Design tokens & contrast

Spec §10.1 colours live on `:root` in `src/index.css` and are mapped into Tailwind via `@theme inline`.
Dark mode follows `prefers-color-scheme`, overridable with `<html data-theme="light|dark">` (footer toggle).

Three helper tokens were added so every text pair passes WCAG AA:

| Token | Value | Why |
| --- | --- | --- |
| `--ink-600` | `#5C464A` | muted body text (8.3:1 on ivory, 7.0:1 on sand) |
| `--amber-800` | `#8C5A0A` | "Hmm" text — `amber-600` is only 3.2:1 on ivory |
| `--parchment-300` | `#CDB9A6` | muted text in dark (9.4:1 on dark cards) |

Rules: `marigold-500` and `gold-500` are never used for text on light backgrounds (fills, rules and
icons only); `leaf-600` text is used on ivory (5.0:1), not on sand (4.25:1).
