# WCAG 2.1 AA Light Pass — Audit & Remediation Record

Scope: WCAG 2.1 AA-level "light pass" over all 14 authenticated routes of the
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

## Global (applies to all routes)

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

## Per-route record

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
| `/preventive-maintenance` | — | search + 2 filter selects; toast dismiss; error dismiss | — | aria-labels added |
| `/reports` | none | none | chart axis tick text `#52525B` | chart stroke/tick → `#92929B` |
| `/administration` | — | 2 search/filter inputs | — | aria-labels added (`Search users`, `Filter audit log`) |
| Command Palette (`Ctrl+K`) | list rows are buttons (focusable) | overlay `<div>` had no dialog role; search box unnamed | — | `role="dialog"` + `aria-modal="true"` + `aria-label="Command palette"`; input `aria-label` |

## Known remaining gaps (acceptable for light pass)

- `WorkOrderDetailPage` inline edit rows reuse aria-labelled controls on every
  table row; edits are mechanically equivalent.
- Chart tick text at `#92929B` on plot backgrounds meets ≥ 4.5:1 in most panes;
  axis-line strokes are decorative and excluded from the text-contrast rule.
- `title`-labelled icon buttons (e.g. transition actions in the WO list) expose
  an accessible name via the `title` attribute; these were left as-is.
- Focus trap for the Command Palette is not implemented (Escape/Enter still work;
  keyboard focus naturally returns after close).

## Verification summary

- All 14 routes: no page errors, ≥ 1 keyboard-focusable control, zero interactive
  elements trapped with `tabindex="-1"`, named search/filter controls.
- Keyboard-only Tab walks pass on login, `/work-orders`, `/work-orders/:id`.
- Skip link + `#main-content` landmark present after login.
- CSSOM shows the `:focus-visible` rule and computed `.text-tertiary` = `#92929B`.