# UI Overhaul — "Paper & Graphite" — Progress Log

Tracking mechanism for the industrial UI overhaul approved 2026-11-14.
Each phase is one commit (or a small number of one-concern commits) and leaves
the tree green. This file is updated in the same commit as the phase it records,
so an interrupted session can resume from the last checked box.

Authority: `docs/WCAG-AUDIT.md` is rewritten in phase 7 to describe the new
system; until then it describes the superseded dark palette.

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
- [ ] **P4 — Data surfaces.** Dense tables (32px rows, 11px uppercase header,
      tabular figures), cards, forms, banners. Sweep the 362 inline hex
      literals onto tokens.
- [ ] **P5 — Charts.** `app/src/lib/chartTokens.ts`, axis/grid/series/tooltip
      from tokens; update the two chart tests to assert token identity.
- [ ] **P6 — Cleanup.** Delete `TacticalDashboardGrid.tsx`, `three`,
      `@react-three/*`, `@types/three`; delete `.glass*`, `.kpi-canvas*`,
      glow shadows, dead Tailwind HSL layer.
- [ ] **P7 — Docs & verifiers.** Rewrite `docs/WCAG-AUDIT.md` as a contrast
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
