# UI Gap Closure Plan — approved 2026-10-18

Permanent record of the approved architecture for closing the five UI findings raised in
the 2026-10-18 backlog review. Proposed by the implementation lead; **approved by the
owner on 2026-10-18** with the five decisions recorded below. Baseline: tag `v1.3.0`
(annotated at `e5ffc00`, green CI run `39124094218`).

## Scope

| # | Finding | Source | Register / tracker IDs |
|---|---|---|---|
| 1 | Crafts management UI — full CRUD API (`backend/src/routes/crafts.ts`), no screen; the frontend only reads crafts as pickers | 2026-10-18 backlog review | GAP U1; tracker v1.1-15 |
| 2 | Cause-code / failure-code management UI — both have full CRUD APIs and work-order pickers, no screens | 2026-10-18 backlog review | GAP U2; tracker v1.1-16 |
| 3 | Safety-checklist template UI — templates are list/create only over the API (`GET`/`POST /safety-checklists/templates`); no edit/delete endpoints and no screen | 2026-10-18 backlog review | GAP U3; tracker v1.1-17 |
| 4 | Cost-split editor screen — §3.5.2 allocation is verified API-side (18 tests) with no UI | Tracker v1.1-9 / N1; matrix line 175 | GAP N1 (re-scoped); tracker v1.1-9 |
| 5 | Accessibility polish — v1.1-11 focus trap, v1.1-12 row aria-labels, v1.1-13 chart tick contrast, v1.1-14 title-only icon names | Tracker v1.1-11…14 / N2 | GAP N2; tracker v1.1-11…14 |

## Owner decisions (2026-10-18)

1. **Tag: `v1.3.0` approved** — annotated at `e5ffc00`, the green-CI pagination/envelope
   state, cut before any feature work. Minor bump because Class B1 changed three GET
   response shapes. Existing tags `v1.0.0` (`386fe3c`), `v1.1.0` (`c2154e8`),
   `v1.2.0` (`8a29576`), `v1.2.1` (`882965d`) remain untouched and immutable; the new
   tag is purely additive and is never moved, deleted or recreated.
2. **Template API approved (C3)** — add `PUT`/`DELETE`
   `/api/safety-checklists/templates/:id` (Planner+ / Supervisor+, soft-delete
   `isDeleted`, audit-logged), mirroring the `causeCodes.ts` semantics, so the template
   screen is not create-only.
3. **Code lists approved as one page** (`/code-lists`) with two sections — cause codes
   and failure codes together, not two routes.
4. **Failure codes: flat-with-parent** — parent column plus a parent `<select>`; no tree
   editor.
5. **Matrix line 175 deferred** — the §3.5.2 `Partial` → `Met` move lands in a separate
   docs commit **after** the C4 screen ships, following the feature commit; status moves
   stay the owner's.

## UI architecture

Administration is Administrator-only (`ROUTE_FLOORS`, `app/src/lib/rbac.ts`), while the
APIs grant these writes to Maintenance Planner (and Supervisor for deletes), so the three
master-data screens are **standalone routes, not Administration tabs**.

| Screen | Route | Pattern | Role gating (mirrors the API) | Backend delta |
|---|---|---|---|---|
| Crafts | `/crafts`, nav beside Work Centers / Task Lists | Flat CRUD table cloned from the C4a LocationsPage pattern; work-center picker in the form | Write: Planner+; delete: Supervisor+ | none |
| Cause + Failure codes | `/code-lists`, nav near Materials | Same CRUD pattern, two sections on one page; failure codes show a parent column and parent picker | Write: Planner+; delete: Supervisor+ | none |
| Checklist templates | `/safety-checklists` | Template list + item editor (sequence number, description; mandatory flag) | Write: Planner+; delete: Supervisor+ | **yes**: template `PUT`/`DELETE` endpoints + `updateTemplate`/`deleteTemplate` in `safetyChecklistService` (owner decision 2) |
| Cost-split | new `costs` tab on the work-order detail page (`DetailTab` union) | Existing tab bar; existing `workOrderCostSplits` API and its 18 backend tests | follows the work-order detail page's existing controls | none expected |

New screens are built to the accessibility conventions the v1.1-11…14 commits fix
(unique aria-labels, visible focus, sufficient contrast) so those commits never re-touch
the new surfaces.

## Commit sequence

One concern per commit; each feature commit flips its tracker row in the same commit
(doc-coupling). `cmms` is never a test target — backend-touching work runs against a
throwaway database.

| # | Commit | Concern |
|---|---|---|
| C0 | `docs(backlog): register UI gap-closure workstream` | This plan + GAP U1/U2/U3 + tracker v1.1-15/16/17 + v1.1-9 supersede pointer |
| C1 | `feat(app): crafts management screen` | `/crafts` over the existing API |
| C2 | `feat(app): cause and failure code list management` | `/code-lists`, one page, two sections |
| C3 | `feat(api+ui): safety checklist template management` | template edit/delete endpoints + service + screen (API and UI are one concern; the B1 precedent) |
| C4 | `feat(app): cost-split editor tab on work-order detail` | v1.1-9; matrix move lands later as its own docs commit (owner decision 5) |
| C5 | `fix(a11y): command-palette focus trap` | v1.1-11 alone |
| C6 | `fix(a11y): unique row aria-labels` | v1.1-12 alone |
| C7 | `fix(a11y): chart tick contrast` | v1.1-13 alone |
| C8 | `fix(a11y): descriptive labels on icon-only controls` | v1.1-14 alone |

Sequencing rationale: C1 establishes the master-data CRUD pattern that C2/C3 reuse; C3
is the only commit with a backend delta and lands before C4 touches the 2,300-line
work-order detail page; a11y comes last so the new screens already follow the fixed
conventions (v1.1-11 is independent and may be pulled forward on request).

Definition of done per step: `tsc` + eslint clean, tests green, `verify_a1.py` +
`verify_a1_dispositions.py` PASS, green CI at the exact SHA once pushed, tracker row
closed citing the commit, live deploy + smoke after merge.

## Out of scope

Tree editor for failure codes; navigation IA changes beyond the new items; any
`SOW_COMPLIANCE.md` status move (each is the owner's, timed per decision 5);
meter readings (N6); per-user alert opt-out (N8).
