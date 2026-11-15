# UI Overhaul — "Paper & Graphite" — Progress Log

Tracking mechanism for the industrial UI overhaul approved 2026-11-14.
Each phase is one commit (or a small number of one-concern commits) and leaves
the tree green. This file is updated in the same commit as the phase it records,
so an interrupted session can resume from the last checked box.

Authority: `docs/WCAG-AUDIT.md` was rewritten in P7 (2026-11-15) to describe the
token system; its contrast matrices are derived from `app/src/index.css`, and the
2026-10-05 dark-palette record is preserved there as Appendix A.

## Definition of done per phase

- `npx tsc --noEmit` clean in `app/`
- `npm test` (app, 184 tests) green
- `npm run build` green
- no new hex literals introduced; inline styles reference `var(--token)`

## Phases

- [x] **P1 — Foundation.** 3-tier token layer in `app/src/index.css`
      (primitives → semantic → component), light `:root` + graphite
      `[data-theme="dark"]`, Tailwind mapped to the tokens, IBM Plex Sans/Mono
      self-hosted via `@fontsource`, legacy utility class names
      (`.text-primary`, `.bg-surface`, `.border-subtle`, …) re-pointed at
      tokens so existing markup inherits the new palette.
- [x] **P2 — Status system.** `app/src/lib/status.ts` single source of truth
      for the 8 tones (open, scheduled, active, hold, done, void, overdue,
      breakdown) with derived Overdue/Breakdown, replacing 10 per-page maps.
- [x] **P3 — Chrome.** Sidebar, Header, AppLayout, LoginPage, CommandPalette:
      graphite rail, no glow, no 9px labels, flat surfaces.
- [x] **P4 — Data surfaces.** Dense tables (32px rows, 11px uppercase header,
      tabular figures), cards, forms, banners. Sweep the 362 inline hex
      literals onto tokens.
- [x] **P5 — Charts.** `app/src/lib/chartTokens.ts`, axis/grid/series/tooltip
      from tokens; update the two chart tests to assert token identity.
- [x] **P6 — Cleanup.** Delete `TacticalDashboardGrid.tsx`, `three`,
      `@react-three/*`, `@types/three`; delete `.glass*`, `.kpi-canvas*`,
      glow shadows, dead Tailwind HSL layer.
- [x] **P7 — Docs & verifiers.** Rewrite `docs/WCAG-AUDIT.md` as a contrast
      matrix derived from tokens; make `scripts/verify/verify_g3_5.py` compute
      contrast from live CSS variables instead of asserting `rgb(146,146,155)`.
- [ ] **P8 — Gates.** `verify_a1.py` (214 rows), `verify_a1_dispositions.py`,
      `verify_b1.py`, `verify_openapi.py`, `verify_r7.py` (throwaway DB only),
      backend + app suites, `npm run build`.

## Phase log

| Date | Phase | Commit | Verified |
|---|---|---|---|
| 2026-11-14 | P1 | `this commit` | `tsc` clean · build 41.9 s (Plex woff2 bundled) · app 184/184 |
| 2026-11-14 | P2 | `this commit` | status tests 15/15 · `tsc` clean |
| 2026-11-14 | P3 | `this commit` | chrome tests 17/17 · `tsc` clean · 0 hex left in layout/ |
| 2026-11-15 | P4 | `this commit` | `tsc` clean · eslint clean · app 193/193 · build 16.5 s · 25 files |
| 2026-11-15 | P5 | `this commit` | `tsc` clean · eslint clean · app 193/193 · build 18.9 s · 0 chart hex left |
| 2026-11-15 | P6 | `this commit` | `tsc` clean · eslint clean · app 192/192 · build 14.3 s · 3D chunk gone |
| 2026-11-15 | P7 | `this commit` | `tsc` clean · eslint clean · app 192/192 · build 14.3 s · CSS probe PASS (text-3 5.32:1, `#5f666f` on `#f4f5f7`) |

### P7 verification note

`scripts/verify/verify_g3_5.py` was **not** run end to end in this pass, and must
not be pointed at the live API on port 4000: its login succeeds against `cmms`
and the auth route writes `User.lastLogin` plus an `AuditLogEntry` in the same
transaction (`backend/src/routes/auth.ts`), which the data-safety rule forbids a
verifier from doing to the live database. The change it needed was the stylesheet
check, so that check alone was exercised instead: the probe is now the module-level
`CSS_PROBE_JS` in `verify_g3_5.py`, and a throwaway harness attached
`app/dist/assets/index-BuhV54ul.css` to a blank Chromium page and ran the same
string. It resolved `.text-tertiary` to `rgb(95, 102, 111)` (`--grey-650`) and
`--bg-app` to `rgb(244, 245, 247)` (`--grey-50`), found the `:focus-visible` rule
and computed 5.32:1 — PASS. A full audit run needs a throwaway database and an
API on a non-live port, the same arrangement `verify_r7.py` uses.
