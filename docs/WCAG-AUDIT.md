# WCAG 2.1 AA Record — "Paper & Graphite"

Status: **rewritten 2026-11-15** for the token-based light UI. Every figure in
this document is derived from the live tokens in `app/src/index.css`, not from a
remembered hex value. The superseded dark-palette record (2026-10-05 light pass
and its 2026-10-19 amendments) is preserved verbatim in Appendix A.

Scope: WCAG 2.1 AA-level pass over the routes `verify_g3_5.py` walks — 11
static pages (`/dashboard`, `/work-orders`, `/work-orders/new`,
`/notifications`, `/equipment`, `/locations`, `/materials`, `/work-centers`,
`/preventive-maintenance`, `/reports`, `/administration`), the three detail
pages (`/work-orders/:id`, `/notifications/:id`, `/equipment/:id`), the login
flow, the Command Palette overlay and the global stylesheet.

`/code-lists`, `/safety-checklists`, `/crafts` and `/task-lists` are not in the
verifier's route list; they are recorded as an uncovered gap below rather than
claimed as verified.

Verify: `python scripts/verify/verify_g3_5.py` (exit 0 on PASS). The stylesheet
check now resolves `.text-tertiary` and `--bg-app` from the live CSSOM, computes
their contrast ratio and requires ≥ 4.5:1; it no longer matches a hardcoded
`rgb(146, 146, 155)`.

## How the figures are produced

`app/src/index.css` is the only colour source. It is layered as

1. **primitives** — raw ramps (`--grey-*`, `--amber-*`, `--blue-*`, `--green-*`,
   `--red-*`, `--violet-700`, `--teal-700`, `--slate-600`);
2. **semantic** — meaning (`--bg-app`, `--surface-*`, `--text-*`, `--border-*`,
   `--accent*`, `--nav-*`, `--status-<tone>-{fg,bg,border}`, `--chart-*`);
3. **component** — measurements (`--row-h`, `--control-h`, radii, focus ring).

A component never names a hex literal. Chart `fill`/`stroke` values are read
from the computed `--chart-*` variables through `app/src/lib/chartTokens.ts`,
because SVG presentation attributes cannot resolve `var()` in every engine.

Ratios below are WCAG 2.1 relative-luminance ratios computed from the resolved
token values (`var()` chains followed to a primitive). They can be re-derived
from source at any time by resolving the token and applying the 0.03928 /
2.4 exponent formula; nothing in the tables is measured by eye.

## Conformance targets applied

- **1.3.1 Info and Relationships** — form controls named (label/aria-label).
- **1.4.1 Use of Colour** — status is never colour-only: `StatusBadge` emits a
  colour dot, a glyph for derived states (Clock for Overdue, AlertTriangle for
  Breakdown) and the text label together.
- **1.4.3 Contrast (Minimum)** — body text ≥ 4.5:1; large text ≥ 3:1.
- **1.4.11 Non-text Contrast** — see "Non-text contrast" below.
- **2.1.1 Keyboard** — every interactive control reachable and operable.
- **2.4.1 Bypass Blocks** — skip-to-main-content link.
- **2.4.3 Focus Order / 2.4.7 Focus Visible** — logical Tab order and a visible
  focus ring on every focused element.
- **4.1.2 Name, Role, Value** — dialog semantics, toggle state, sortable headers.

## Contrast matrix — light ("Paper")

| Pair | Ratio | Requirement |
|---|---|---|
| `--text-1` on `--bg-app` | 16.28 | 4.5 |
| `--text-1` on `--surface-1` | 17.76 | 4.5 |
| `--text-1` on `--surface-2` | 15.42 | 4.5 |
| `--text-1` on `--surface-3` | 14.06 | 4.5 |
| `--text-2` on `--bg-app` | 7.46 | 4.5 |
| `--text-2` on `--surface-1` | 8.14 | 4.5 |
| `--text-2` on `--surface-2` | 7.07 | 4.5 |
| `--text-2` on `--surface-3` | 6.45 | 4.5 |
| `--text-3` on `--bg-app` | 5.32 | 4.5 |
| `--text-3` on `--surface-1` | 5.81 | 4.5 |
| `--text-3` on `--surface-2` | 5.04 | 4.5 |
| `--text-3` on `--surface-3` | 4.60 | 4.5 |
| `--accent` on `--surface-1` | 5.02 | 4.5 |
| `--accent-ink` on `--accent-fill` | 5.83 | 4.5 |
| `--nav-text` on `--nav-bg` | 9.77 | 4.5 |
| `--nav-accent` on `--nav-bg` | 7.73 | 4.5 |
| `--nav-text-active` on `--nav-active-bg` | 13.13 | 4.5 |
| `--status-open-fg` on `--status-open-bg` | 6.10 | 4.5 |
| `--status-scheduled-fg` on `--status-scheduled-bg` | 7.08 | 4.5 |
| `--status-active-fg` on `--status-active-bg` | 5.49 | 4.5 |
| `--status-hold-fg` on `--status-hold-bg` | 6.58 | 4.5 |
| `--status-done-fg` on `--status-done-bg` | 4.84 | 4.5 |
| `--status-void-fg` on `--status-void-bg` | 6.58 | 4.5 |
| `--status-overdue-fg` on `--status-overdue-bg` | 5.30 | 4.5 |
| `--status-breakdown-fg` on `--status-breakdown-bg` | 6.47 | 4.5 |
| `--chart-axis-tick` on `--surface-1` | 8.14 | 4.5 |
| `--chart-series-1` … `--chart-series-6` on `--surface-1` | 6.70 / 5.02 / 5.47 / 6.47 / 7.10 / 7.58 | 3.0 (graphic) |
| `--focus` on `--bg-app` | 6.14 | 3.0 |

`--accent-fill` (`--amber-500`) is reserved for fills and icons; it is never
used as body text on white (its ratio there is 3.19:1). Text that must carry the
accent uses `--accent` (`--amber-600`, 5.02:1 on `--surface-1`).

## Contrast matrix — graphite (`[data-theme="dark"]`)

No runtime control sets `data-theme` today; the block is the maintained dark
counterpart and is verified so a future theme switch cannot ship a failing pair.

| Pair | Ratio | Requirement |
|---|---|---|
| `--text-1` on `--bg-app` | 15.34 | 4.5 |
| `--text-1` on `--surface-3` | 10.90 | 4.5 |
| `--text-2` on `--bg-app` | 8.82 | 4.5 |
| `--text-2` on `--surface-3` | 6.27 | 4.5 |
| `--text-3` on `--bg-app` | 7.04 | 4.5 |
| `--text-3` on `--surface-2` | 5.94 | 4.5 |
| `--text-3` on `--surface-3` | 5.00 | 4.5 |
| `--accent` on `--surface-1` | 7.62 | 4.5 |
| `--accent-ink` on `--accent-fill` | 5.83 | 4.5 |
| `--nav-text` on `--nav-bg` | 8.62 | 4.5 |
| `--nav-accent` on `--nav-bg` | 8.72 | 4.5 |
| `--nav-text-active` on `--nav-active-bg` | 14.51 | 4.5 |
| `--status-open-fg` on `--status-open-bg` | 8.30 | 4.5 |
| `--status-scheduled-fg` on `--status-scheduled-bg` | 7.89 | 4.5 |
| `--status-active-fg` on `--status-active-bg` | 8.01 | 4.5 |
| `--status-hold-fg` on `--status-hold-bg` | 8.42 | 4.5 |
| `--status-done-fg` on `--status-done-bg` | 9.41 | 4.5 |
| `--status-void-fg` on `--status-void-bg` | 8.42 | 4.5 |
| `--status-overdue-fg` on `--status-overdue-bg` | 8.54 | 4.5 |
| `--status-breakdown-fg` on `--status-breakdown-bg` | 6.47 | 4.5 |
| `--chart-axis-tick` on `--surface-1` | 8.04 | 4.5 |
| `--chart-series-1` … `--chart-series-6` on `--surface-1` | 6.07 / 9.24 / 8.02 / 5.58 / 5.67 / 6.02 | 3.0 (graphic) |
| `--focus` on `--surface-1` | 6.07 | 3.0 |

## Non-text contrast (1.4.11)

| Pair | Ratio | Verdict |
|---|---|---|
| `--focus` ring on `--surface-1` | 6.70 | pass (≥ 3.0) |
| `--focus` ring on `--bg-app` | 6.14 | pass |
| `--border-strong` on `--surface-1` | 1.91 | **open gap** |
| `--border-subtle` on `--surface-1` | 1.42 | decorative only |
| `--surface-3` fill on `--surface-1` | 1.26 | decorative only |

**Open gap, recorded not silently accepted.** Form controls draw a
`--border-subtle` boundary on a `--surface-3` fill, so the boundary itself is
below 1.4.11's 3:1. Every control still has a visible `<label>`/`aria-label`,
and the focus ring passes at 6.1–6.7:1, which is what keyboard users navigate
by. Raising the control boundary is a visual-weight decision for the owner, not
an engineering fix to slip in: the measured remedy is
`--border-control: var(--grey-500)` (`#8a919b`, 3.18:1 on `--surface-1`)
applied to input/select/textarea borders only. Hairline rules between table rows
and cards stay `--border-subtle`; they are decorative and carry no meaning that
is not also carried by spacing and the row content.

## Interaction and semantics

| Concern | Where | Record |
|---|---|---|
| Skip link | `AppLayout.tsx` | `.skip-link` → `#main-content`; `main` is a landmark with `tabIndex={-1}` (2.4.1) |
| Focus ring | `index.css` | `:focus-visible { outline: var(--focus-width) solid var(--focus); outline-offset: var(--focus-offset) }` (2.4.7) |
| Command Palette | `CommandPalette.tsx` | `role="dialog"`, `aria-modal="true"`, `aria-label`, named input, Escape closes, focus returns, Tab wraps inside the dialog's focusable set (2.1.1, 4.1.2) |
| Sortable headers | list pages | `<th role="button" tabIndex={0}>` with `aria-label="Sort by …"` and Enter/Space activation |
| Clickable rows | list pages | `<tr tabIndex={0} role="link">` with Enter activation |
| Status | `StatusBadge.tsx` | dot + glyph + label; derived Overdue/Breakdown carry an icon (1.4.1) |
| Icon-only buttons | all pages | `aria-label` on pagination, bell, sidebar collapse, password toggle, back/close, dismiss |
| Native selects | all pages | `color-scheme: light` plus an explicit `select option` background/foreground from the tokens (1.4.3) |

## Known remaining gaps

- **Control boundaries at 1.4.11** — see "Non-text contrast" above; measured,
  with the remedy recorded, awaiting an owner decision on visual weight.
- **Sort state is not exposed programmatically.** Sortable `<th>`s carry
  `role="button"` and `aria-label="Sort by …"`, but no `aria-sort` and no
  direction-dependent icon, so a screen-reader user is told the column is
  sortable but not which column is currently sorted or in which direction.
  `aria-sort` on the active `<th>` is the standard remedy; adding it changes
  the header contract, so it is recorded here rather than slipped into this
  pass.
- **Four pages are outside the verifier's route list.** `/code-lists`,
  `/safety-checklists`, `/crafts` and `/task-lists` exist in `App.tsx` but are
  not walked by `verify_g3_5.py`, so their keyboard, naming and contrast state
  is not asserted by any automated check. They are built from the same
  `data-table`/token components as the covered pages, but that is an argument,
  not a measurement. Adding them to the route list is a scope call.

The three items that stood here in the previous record were closed before this
rewrite and are therefore not restated as open: the Command Palette Tab focus
trap (`v1.1-11`), the repeated `WorkOrderDetailPage` row labels (`C6`, `093bb5b`)
and the title-only icon names (`C8`, `bd88162`). Re-derived from source on
2026-11-15: `CommandPalette.tsx` cycles Tab through the dialog's own focusable
set, `WorkOrderDetailPage.tsx` disambiguates its row actions with
sequence-numbered `aria-label`s, and the audited icon buttons carry both `title`
and `aria-label`.

## Verification summary

- Every route the verifier walks (11 static pages + 3 detail pages): no page
  errors, ≥ 1 keyboard-focusable control, zero interactive elements trapped
  with `tabindex="-1"`, named search/filter controls.
- Keyboard-only Tab walks pass on login, `/work-orders`, `/work-orders/:id`.
- Skip link + `#main-content` landmark present after login.
- CSSOM shows the `:focus-visible` rule and the computed `.text-tertiary`
  colour clears 4.5:1 against the computed `--bg-app`.

---

# Appendix A — superseded record (2026-10-05 → 2026-11-14, kept verbatim)

The following is the previous dark-palette audit, preserved as written so the
history of each fix is not lost. Headings are re-levelled for the appendix;
the text is unchanged. Its hex values describe the retired palette;
where a figure disagrees with the token matrices above, the matrices are
current. The 2026-10-19 amendment already superseded the "~11:1" figure it
corrects in place.

## WCAG 2.1 AA Light Pass — Audit & Remediation Record

Scope: WCAG 2.1 AA-level "light pass" over all 15 authenticated routes of the
CommandPulse app plus the login flow, the Command Palette overlay and the global
stylesheet. Verify: `python scripts/verify/verify_g3_5.py` (exit 0 on PASS).

Conformance targets applied (per WCAG 2.1):
- **1.3.1 Info and Relationships** — form controls named (label/aria-label).
- **1.4.3 Contrast (Minimum)** — body text ≥ 4.5:1; large text / UI components ≥ 3:1.
- **2.1.1 Keyboard** — every interactive control reachable and operable by keyboard.
- **2.4.1 Bypass Blocks** — skip-to-main-content link.
- **2.4.3 Focus Order / 2.4.7 Focus Visible** — logical Tab order and a visible
  focus ring on every focused element.
- **4.1.2 Name, Role, Value** — dialog semantics, toggle state, sortable headers.

### Global (applies to all routes)

| Issue | Fix |
|---|---|
| Primary/tertiary text `#52525B` on `#111113` ≈ 2.4:1 (failed 4.5:1) | `.text-tertiary` → `#92929B` (~11:1 on base, ~4.8:1 on `#27272A`). Applies to pagination counts, stat captions, breadcrumbs, sidebar sub-labels. |
| `badge-cancelled` / `badge-low` `#52525B` text | → `#92929B`. |
| `badge-in-progress` / `.text-blue-status` `#2563EB` ≈ 3.7:1 (failed 3:1 for UI? passed for large; below 4.5 for text) | → `#3B82F6` (~5.1:1 on base). |
| No visible keyboard focus indicator | Global `*:focus-visible { outline: 2px solid #F59E0B; outline-offset: 2px; }` (WCAG 2.4.7). |
| No bypass block | `.skip-link` to `#main-content` in `AppLayout.tsx`; visible only on focus (WCAG 2.4.1); `main` is a landmark with `tabIndex={-1}`. |
| Icon-only **pagination** prev/next chevron buttons (Materials, Equipment, Work Orders, Notifications, Preventive Maintenance, Administration ×2) | `aria-label="Previous page"` / `aria-label="Next page"`. |
| Header bell / Sidebar collapse / Login show-password / detail back buttons | `aria-label`s added (`Notifications`, `Collapse/Expand sidebar`, `Show/Hide password`, `Back to …`). |
| Toast / dismiss buttons (3.3 pages, PM page) | `aria-label="Dismiss message"` (already present on 3.3 pages). |
| Native `<select>` option lists rendered white-on-white (browser painted the list white while option text inherited the app's light text colour) — every select dropdown in the app | Root `color-scheme: dark` (native controls, including the select list, pickers and scrollbars, paint dark) plus an explicit `select option { background-color:#18181B; color:#FAFAFA }` fallback in `index.css` (WCAG 1.4.3). Global: applies to all 12 pages using native selects. |
| Base background `#111113` read as pitch-black (2026-10-19) | Softened to `#151517`, applied to `body`, `.bg-base`, the odd-row zebra surface and the nested `#111113` panels/login wrapper. `#151517` still sits below `.bg-surface #18181B`, so the elevation ladder and the certified surface/card hierarchy are preserved. Re-checked on the new base: tertiary `#92929B` 5.9:1, amber `#D97706` 5.7:1, green `#059669` 4.8:1, blue `#3B82F6` 5.0:1 — all ≥ 4.5:1. (Supersedes the *"~11:1 on base"* figure in the `.text-tertiary` row above, which was measured on the old `#111113` base; the measured value there was ~6.1:1 and is ~5.9:1 now.) |
| Status red `.text-red-status` / `#DC2626` failed 4.5:1 on every dark surface (3.44–3.91:1, and 3.08:1 on row-hover `#27272A`) (2026-10-19) | → `#F87171` (Tailwind red-400, matching the existing error-message red), applied at the `.text-red-status`/`.badge-high`/`.criticality-a`/`.breakdown-banner` tokens and all `#DC2626` call sites (`rgba(220,38,38,…)` washes left unchanged as non-text). Now ≥ 4.5:1 everywhere: base 6.6:1, surface 6.4:1, card 6.0:1, row-hover 5.4:1. |

### Per-route record

| Route | Keyboard issues | ARIA gaps | Contrast issues | Fix applied |
|---|---|---|---|---|
| `/login` | none | password-toggle unnamed, "Enter password" input unnamed by any control | — | Show/Hide + eye button aria-label; password input remains title/label-adjacent (username/password have `<label>`) |
| `/dashboard` | none (KPI cards are real `<button>`s) | — | Draft/Cancelled dots & chart axis ticks `#52525B` | status/type colors + chart stroke/tick → `#92929B` |
| `/work-orders` | sortable `<th>` mouse-only; clickable `<tr>` keyboard-inaccessible; board-card `<div onClick>` | search + 2 filter selects unnamed; pagination unnamed | header label color `#52525B`; Cancelled dot | th → `role="button"`+`tabIndex`+Enter/Space; tr → `tabIndex 0` + `role="link"` + Enter; board card → `role="button"` + Enter/Space; aria-labels on search/selects/pagination; header → `#92929B`; Cancelled → `#92929B` |
| `/work-orders/new` | none | none | — | none needed |
| `/work-orders/:id` | — | back button, 5 × close-form buttons, icon-only "Add Service" submit, ~30 form controls without associated labels | `InfoCard` Low priority `#52525B` | aria-labels on back/close/Add Service + all operation/material/labor/service/checklist/comment controls; Priority-Low → `#92929B` |
| `/notifications` | clickable `<tr>` | search + 3 filter selects | — | tr keyboardable; aria-labels on search/selects |
| `/notifications/:id` | clickable linked-WO card | back chevron | — | back aria-label; card `role="button"` + Enter/Space |
| `/equipment` | tree toggle span inside row button (nested, mouse-only); row click | search + 2 filters; leaf `Tag` icon `#52525B` | — | restructured tree row → two sibling buttons (toggle with aria-expanded/aria-label, select row); tr keyboardable; aria-labels; `Tag` → `#92929B` |
| `/equipment/:id` | clickable history card | back chevron | — | back aria-label; card `role="button"`+Enter/Space |
| `/locations` | — | tree toggle + search | — | toggle aria-label+aria-expanded; search aria-label |
| `/materials` | sortable `<th>` mouse-only | search box | — | th keyboardable (role/tabIndex/Enter/Space); search aria-label |
| `/work-centers` | clickable header div with nested toggle button (mouse-only) | — | — | header → single `<button>` with aria-expanded; inner button removed |
| `/task-lists` | — | search box; per-operation material remove buttons | — | search aria-label; remove buttons given accessible names |
| `/preventive-maintenance` | — | search + 2 filter selects; toast dismiss; error dismiss | — | aria-labels added |
| `/reports` | none | none | chart axis tick text `#52525B` | chart stroke/tick → `#92929B` |
| `/administration` | — | 2 search/filter inputs | — | aria-labels added (`Search users`, `Filter audit log`) |
| Command Palette (`Ctrl+K`) | list rows are buttons (focusable) | overlay `<div>` had no dialog role; search box unnamed | — | `role="dialog"` + `aria-modal="true"` + `aria-label="Command palette"`; input `aria-label` |

### Known remaining gaps (acceptable for light pass)

*Superseded 2026-10-18: all four items below were remediated in the UI
gap-closure workstream — the Command Palette focus trap as C5 (`b8282d7`,
green CI run 341), the repeated row labels as C6 (`093bb5b`, run 342), the
chart tick contrast as C7 (`3ce1bec`, run 343), and the title-only icon
names as C8 (`bd88162`, push held for owner review). The list below is kept
as the record of the 2026-10-05 light pass and the owner acceptance made
on it that day.*

- `WorkOrderDetailPage` inline edit rows reuse aria-labelled controls on every
  table row; edits are mechanically equivalent.
- Chart tick text at `#92929B` on plot backgrounds meets ≥ 4.5:1 in most panes;
  axis-line strokes are decorative and excluded from the text-contrast rule.
- `title`-labelled icon buttons (e.g. transition actions in the WO list) expose
  an accessible name via the `title` attribute; these were left as-is.
- Focus trap for the Command Palette is not implemented (Escape/Enter still work;
  keyboard focus naturally returns after close).

### Verification summary

- All 14 routes: no page errors, ≥ 1 keyboard-focusable control, zero interactive
  elements trapped with `tabindex="-1"`, named search/filter controls.
- Keyboard-only Tab walks pass on login, `/work-orders`, `/work-orders/:id`.
- Skip link + `#main-content` landmark present after login.
- CSSOM shows the `:focus-visible` rule and computed `.text-tertiary` = `#92929B`.
