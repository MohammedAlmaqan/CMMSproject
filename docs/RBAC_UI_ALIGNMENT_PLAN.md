# RBAC & UI Alignment Plan — approved 2026-10-19

Permanent record of the plan for the RBAC and UI findings raised in the 2026-10-19
administrator UAT: the dashboard KPI ribbon disappears once the 3D grid loads, the
notification list has no delete control, and — systemically — several mutating controls
are shown to roles the API denies. Proposed by the implementation lead; **approved by the
owner on 2026-10-19** with the decisions recorded below. Baseline: tag `v1.4.0`
(annotated at `afc7fe5`); HEAD at approval `fb4c989`.

## Scope

| ID | Finding | Class | Register | Tracker |
|---|---|---|---|---|
| F1 | Dashboard KPI ribbon is displaced by the lazily-loaded 3D grid and clipped after the grid loads | Bug | N11 | v1.1-18 |
| F2 | Seven mutating controls are shown to roles the API denies, so a low-privilege click returns 403 | Security / UX | N12 | v1.1-19 |
| F3 | Notification delete exists at Maintenance Supervisor+ in the API but has no UI control anywhere | Missing capability | N13 | v1.1-20 |
| F4 | `PUT /work-orders/:id` floor is Requester, below the UI edit gate (Technician) and the SOW §2.2 Requester scope | Authorization | N14 | v1.1-21 |
| F5 | The root error boundary renders the raw stack trace and a light, non-conforming screen | Hygiene / info-disclosure | N15 | v1.1-22 |
| F6 | Guide/manual rows assert features that have shipped (notification form, PM/task screens, user API, Requester scoping) | Documentation | D2 | — |
| F7 | Management UIs absent for materials CRUD, work-centre CRUD, user edit, audit-log purge, functional-location CSV import and notification edit, though the APIs and services exist | Missing capability | N16 | v1.1-23 |
| F8 | No frontend capability map — action gating is ad-hoc per page, the root cause of F2/F3 | Systemic | N17 | v1.1-24 |
| F9 | `GET /users/:id` is authenticate-only while `GET /users` is Administrator-only | Authorization | N18 | v1.1-25 |
| F10 | `DELETE /external-services/:id` floor (Technician) is below the house Supervisor pattern for deletes | Consistency | N19 | v1.1-26 |
| F11 | Alerts have no per-item mark-read UI and exclude Administrator from the recipient fan-out | Gap | N20 | v1.1-27 |

## Owner decisions (2026-10-19)

1. **Sequence `C0`–`C7` approved** — the whole workstream executes in this pass.
2. **F4 direction: raise the API floor.** `PUT /api/work-orders/:id` moves from
   Requester to `authorizeMinRole('Technician')`, matching the SOW §2.2 ladder (a
   Requester raises notifications, not work-order edits) and every adjacent write. The UI
   edit gate already sits at Technician, so no UI change is needed.
3. **F2 scope: all seven controls.** The read-marking bell is gated like the six
   write-capable controls, not left visible to every role.
4. **F7 and F8 deferred to v1.1**, together with N18, N19 and N20; not in this pass.

## Approach

- **F1 (dashboard).** The grid renders its own `<div className="kpi-canvas-container">` —
  120 px of *in-flow* height — inside the page's own `.kpi-canvas-container`, which is
  `height:120px; overflow:hidden`. Before the lazy chunk resolves the Suspense fallback is
  a zero-height div, so the `.kpi-metrics-overlay` sits at `y=0` and the cards show; once
  the chunk lands, the grid's block pushes the overlay to `y=120` and it is clipped. Fix:
  the grid renders an absolutely-positioned, non-flow layer (`.kpi-canvas-layer`), and
  `.kpi-metrics-overlay` becomes absolutely positioned too, so no grid layout can displace
  the cards again.
- **F2 / F3 root cause.** There is no capability map; pages gate controls ad hoc, and some
  gate nothing. The immediate fix mirrors the API floors with `hasMinRole` from
  `app/src/lib/rbac.ts` at each control; the durable fix is the v1.1 capability map (N17).
- **Backend work (F4)** runs against a throwaway database; `cmms` is never a test target.

## Commit sequence

One concern per commit; each feature commit updates the docs its change makes stale
(doc-coupling), and `Docs: none` is stated where a change touches no documented fact.

| # | Commit | Concern |
|---|---|---|
| C0 | `docs(backlog): register RBAC/UI alignment workstream` | This plan + GAP N11–N20 + D2 + tracker v1.1-18…27 |
| C1 | `fix(app): keep dashboard KPI ribbon above the lazy 3D grid` | N11 |
| C2 | `fix(app): gate mutating controls at their API floors` | N12, all seven controls |
| C3 | `feat(app): delete a notification from the list and detail` | N13 |
| C4 | `fix(api): raise the work-order update floor above Requester` | N14 |
| C5 | `fix(app): stop leaking stack traces in the error fallback` | N15 |
| C6 | `docs: correct stale feature-availability claims` | D2 |
| C7 | `docs(records): close the RBAC/UI alignment findings` | Closure rows for N11–N15 / v1.1-18…22 |

Definition of done per step: `tsc` + eslint clean; frontend and backend tests green
(backend against a throwaway database); `scripts/verify/verify_a1.py` and
`scripts/verify/verify_a1_dispositions.py` pass; green CI at the exact SHA; live deploy and
smoke check.

## Out of scope (v1.1)

N16 (management UIs for materials, work-centre, user edit, audit purge, functional-location
import, notification edit), N17 (frontend capability map + guard tests), N18 (`GET /users/:id`
read floor), N19 (`DELETE /external-services/:id` floor) and N20 (alerts per-item read UI and
Administrator fan-out). Status moves in `docs/SOW_COMPLIANCE.md`, if any, stay the owner's.

## Closure record

To be completed at C7, citing each fix's SHA and green CI run.
