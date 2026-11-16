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
- `npm test` (app suite) green
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
- [x] **P8 — Gates.** `verify_a1.py` (214 rows), `verify_a1_dispositions.py`,
      `verify_b1.py`, `verify_openapi.py`, `verify_r7.py` (throwaway DB only),
      backend + app suites, `npm run build`. Run 2026-11-16; see the P8
      verification note for the target of each gate and the data-safety
      incident that voided the first `verify_r7.py` attempt.

## Phase log

| Date | Phase | Commit | Verified |
|---|---|---|---|
| 2026-11-14 | P1 | `83cb2b0` | `tsc` clean · build 41.9 s (Plex woff2 bundled) · app 184/184 |
| 2026-11-14 | P2 | `9613922` | status tests 15/15 · `tsc` clean |
| 2026-11-14 | P3 | `78f59ad` | chrome tests 17/17 · `tsc` clean · 0 hex left in layout/ |
| 2026-11-15 | P4 | `9b3269e` | `tsc` clean · eslint clean · app 193/193 · build 16.5 s · 25 files |
| 2026-11-15 | P5 | `01f1eaf` | `tsc` clean · eslint clean · app 193/193 · build 18.9 s · 0 chart hex left |
| 2026-11-15 | P6 | `6cc6e32` | `tsc` clean · eslint clean · app 192/192 · build 14.3 s · 3D chunk gone |
| 2026-11-15 | P7 | `982434e` | `tsc` clean · eslint clean · app 192/192 · build 14.3 s · CSS probe PASS (text-3 5.32:1, `#5f666f` on `#f4f5f7`) |
| 2026-11-16 | P8 | `this commit` | a1 214/214 · dispositions 77 (65 build / 12 waive) · b1 PASS · openapi 166 ops / 111 paths · r7 27/27 on `cmms_r7_scratch` · backend 1256/1256 · app 192/192 · build 59.8 s |

Two supporting commits sit between the phases and are not phases themselves:
`db8ca07` repainted error/success feedback with the status tokens (between P5 and
P6), and `d493b20` removed the duplicate row rule left on five data tables
(after P6).

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

### P8 verification note

Every gate below ran 2026-11-16 on this host. Anything that touches a database
was pointed at a throwaway database; live `cmms` was not a target of any of them.

| Gate | Target | Result |
|---|---|---|
| `scripts/verify/verify_a1.py` | source only | PASS — 214 clauses: 167 Met / 11 Partial / 0 Not Met / 7 Deferred, each at its frozen expectation |
| `scripts/verify/verify_a1_dispositions.py` | source only | PASS — 77 rows dispositioned (Build 65 / Waive 12), 21 decisions answered, totals self-consistent |
| `scripts/verify/verify_b1.py` | source only | PASS |
| `scripts/verify/verify_openapi.py` | source only | PASS — 166 operations across 111 paths |
| `scripts/verify/verify_r7.py` | `cmms_r7_scratch`, API on port 4100 | PASS 27/27; fixture removed, 0 `r7fix-` rows left |
| backend `npm test` | `cmms_gate` | 1256/1256 tests in 89 files (398.6 s) |
| app `npm test` | none | 192/192 tests in 29 files (177.2 s) |
| app `npm run build` | none | built in 59.8 s; `index-BuhV54ul.css` 30.2 kB, `index-CFG72T-P.js` 1,112.7 kB |

Two gates needed a database they could write to: `verify_r7.py` and the backend
suite. Both ran against throwaway databases — `cmms_r7_scratch` and `cmms_gate`
respectively. The r7 verifier printed
`R7_DB_TARGET source=process env target=localhost:5432/cmms_r7_scratch` before
every access, and a preflight `select current_database()` returned
`cmms_r7_scratch`. The scratch database and the API on port 4100 were removed
afterwards, leaving only `cmms` (live) and `cmms_gate`.

#### Data-safety incident, 2026-11-15 (reported, not repaired)

The **first** `verify_r7.py` attempt targeted the live `cmms` database. Cause: the
retarget read `backend/.env` with
`(Get-Content … | Where-Object { $_ -match '^DATABASE_URL=' })[0]`. The pipeline
returns a single string, so `[0]` took its first character; `DATABASE_URL` was
therefore set to empty, and both the API on 4100 and the verifier's psql oracle
fell back to `backend/.env` → `cmms`.

What that attempt left on live `cmms`, from one login and one fixture:

- `User.lastLogin` for `admin` set to `2026-11-15T10:33:41.269Z`
- one `AuditLogEntry`, `f21edd08-f542-4e93-b415-8e7c6b6d7526` (User / Update / lastLogin)
- one `RefreshToken`, `e3fe8600-9e67-453f-bee0-0fe83f0187c8`, created
  `2026-11-15 10:33:41.341`, `revoked = false`
- one `r7fix-` fixture work order, inserted and then deleted

Zero `r7fix` residue was confirmed across 19 table/id/code checks, so nothing
from the fixture survives. The run's evidence is void as a gate: the PASS above
is a fresh run against `cmms_r7_scratch`.

Those rows are left in place rather than deleted. They are the record of what
happened, and a verifier must not write to `cmms` to clean up after itself. The
refresh token cannot be used — its value was never retained — and it expires at
its own `expiresAt`; revoking it now is an owner decision, not a verifier one.

The retarget that works is
`$line = @(Get-Content backend\.env | Where-Object { $_ -match '^DATABASE_URL=' })[0]`
followed by a `/cmms?` → `/cmms_r7_scratch?` replacement, with
`select current_database()` as a preflight before anything that writes.

