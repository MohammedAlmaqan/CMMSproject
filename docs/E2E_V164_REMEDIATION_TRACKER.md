# v1.6.5 remediation tracker

Tracks the fourteen findings from the v1.6.4 manual end-to-end test
(`docs/E2E_V164_FINDINGS_PHASE1.md`) through implementation, verification and
release. One row per finding. The **Commit** column is the durable anchor: a row
is only `Closed` when a commit exists that a reviewer can read.

- **Opened:** 2026-10-25
- **Baseline:** `v1.6.4` (`f245123`)
- **Release:** `v1.6.5`
- **Rule:** a row moves to `Closed` in the same commit that closes it, or in the
  next documentation-only commit when the closing work landed in several commits.

## Findings

| ID | Finding | Phase 1 verdict | State | Commit / evidence |
|----|---------|-----------------|-------|-------------------|
| F1 | Installer `.env` reported as containing placeholders | Not reproduced; look-alike sample files ship beside the real `.env` | Closed | `9c14f53` removes every `backend\.env.*` and asserts the generated file carries no `__TOKEN__` or sample value |
| F2 | No Sign Out for non-Administrators | Confirmed | Closed | `d6518d8` adds Sign out to the Sidebar for all roles |
| F3 | Administrator cannot reset a user's password in the UI | Confirmed | Closed | `f2dac8e` wires the per-row Password action to the existing `adminMode` dialog |
| F4 | Work-order header (Supervisor, planned dates) cannot be edited | Confirmed | Open | - |
| F5 | "Schedule" sets status without collecting dates | Confirmed | Open | - |
| F6 | Handover bundle ships stale documentation | Confirmed | Open | - |
| F7 | Most data pages have no import/export | Confirmed, asymmetric | Open | - |
| A1 | Bundle ships `backend/.env.deploy` with a concrete JWT secret | Confirmed (security) | Open | - |
| A2 | `backend/.env.example` reaches the install root | Confirmed | Closed | `9c14f53`, same copy rule as F1 |
| A3 | Two v1.6.4 commit messages describe work not in the commit | Confirmed | Open | - |
| A4 | Mojibake in tracked handover documents | Confirmed | Open | - |
| A5 | Two password floors for one credential (12 installer / 8 API) | Confirmed | Closed | `5e8c062` raises the API and UI to 12 |
| A6 | Installation guide promises a reset path the product lacks | Confirmed | Closed | Product side `f2dac8e` + `5e8c062`; guide `12ac772` names the path |
| A7 | Sidebar profile button is a dead click for five of six roles | Confirmed | Closed | `d6518d8` makes the profile block display-only |

States: `Open`, `In progress`, `Blocked`, `Closed`.

## Approved scope

Owner decisions of 2026-10-25, with the engineering call recorded where it
differs:

| Item | Owner decision | Engineering call |
|------|----------------|------------------|
| F2 / A7 | Sign Out in the global Sidebar for all roles; fix the non-admin profile target | Adopted. Profile button opens an account menu instead of navigating |
| F3 | Wire the reset dialog; raise the password floor to 12 | Adopted, API and UI together (A5) |
| F4 | Supervisor, Planner and Administrator may edit the header | Adopted |
| F5 | Option B — atomic API extension accepting dates on the status route | Adopted, plus ordered-pair validation on the dates themselves |
| F6 | Cut `v1.6.5`; fix the mojibake; write proper release notes | Adopted; also adds a bundle-vs-tag verification gate so it cannot recur |
| F7 | P1 and P2 for Work Orders and Locations first | Adopted; other modules left out of scope, recorded as open |
| A1 | Remove `.env.deploy` from the bundle | Adopted, plus a build-time guard |

## Out of scope for v1.6.5

Recorded so the boundary is explicit, not implied:

- CSV import/export UI for Work Centers, Crafts, Task Lists, Safety Checklists,
  Code Lists and PM Plans. Their backend routes do not exist either. F7's shared
  factory makes each one small, but they were not approved for this release.
- Enforcing "a work order may not be `Scheduled` without dates" (F5 option C).
  Option B was chosen; the strict rule remains an open acceptance question.
- Rotating the `JWT_SECRET` that travelled inside the v1.6.4 bundle (A1). It is
  removed from v1.6.5; whether the v1.6.4 copy is treated as disclosed is an
  owner security decision.
