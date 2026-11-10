# Project State Reconciliation (v1.6.11, 2026-11-09)

Reference record. Two versions live in this file. **v1.0** is the external-advisor
reconciliation as delivered on 2026-11-09, reproduced verbatim in Part 1. **v1.1** is the
same day's follow-up pass: it answered v1.0's open questions, corrected three of its
statements and recorded one authorised host change. Corrections never overwrite the text
they correct — Part 1 stands as written and Part 2 carries the correction, per the
"Preserve history rather than overwriting it" rule in `AGENTS.md`.

Both versions answer instruction prompts that are **not** reproduced here. Where the text
says "the prompt says …" or names a "follow-up brief", it refers to that instruction set;
every such sentence also states the measured fact, so no claim here depends on reading the
prompt.

Scope: HEAD `3423b89b7c1b1a64482febf76b70c46b4edfa159` (`v1.6.11`), branch `main`. The
passes were read-only against the repository and the host, with exactly one runtime action
— removal of the leftover IIS site `cmms-v167-test` (§6.3) — and two file operations: this
file created, and one bullet added to `AGENTS.md`. No commit, no push, no tag, and no write
to the live `cmms` database.

## Revision history

| Date | Revision | Note |
|---|---|---|
| 2026-11-09 | 1.0 | Initial reconciliation at `3423b89` (`v1.6.11`): release state, application vs installer state, runtime posture, verification state, document-currency audit, open-items register, current workstream, uncertainty. Read-only; no edits, no migrations, no writes to `cmms`, no tags. |
| 2026-11-09 | 1.1 | Follow-up at the same HEAD: corrected the v1.1 backlog over-count, characterised the twelve untracked entries and the four root directories among them, fixed the deployment anchor, resolved host items D.1–D.4, established that `verify_r7.py` is not read-only, and removed the leftover IIS site. One authorised runtime action; no code, doc or database change beyond this file and one `AGENTS.md` bullet. |

---

# Part 1 — v1.0 (verbatim, 2026-11-09)

The text below is the 2026-11-09 assessment exactly as delivered, from its own title to its
last table row. It is not reformatted, renumbered, trimmed or spell-corrected. Where v1.1
supersedes a statement, the correction is in Part 2 and the original is left standing.

<!-- begin: v1.0, verbatim -->

# Project State Reconciliation for External Advisor (v2)

Repository: `C:\Users\Injaz\Documents\Default Project\CMMSproject` · Branch `main` · Assessed 2026-11-09 · Read-only pass (no edits, no migrations, no writes to `cmms`, no tags).

Standing-State Report (2026-11-09, v1.6.11) is the prior evidence base. Items it already proved are marked CONFIRMED with a pointer; only re-checked where cheap or contested.

---

## 1. Version and release state

### 1.1 HEAD and tag identity — [CODE] CONFIRMED

| Check | Result | Evidence |
|---|---|---|
| `git rev-parse HEAD` | `3423b89b7c1b1a64482febf76b70c46b4edfa159` | `git rev-parse HEAD` |
| `git rev-parse v1.6.11^{commit}` | `3423b89b7c1b1a64482febf76b70c46b4edfa159` | same |
| Is HEAD a descendant of `3423b89`? | HEAD **is** `3423b89` (identical commit, so trivially an ancestor relationship) | `git merge-base --is-ancestor 3423b89 HEAD` → exit 0 |
| Branch / working tree | `main`; no tracked modifications, no staged changes | `git status --short` |

### 1.2 CI at the tag — [CODE] CONFIRMED

Run `42604665070`, conclusion **success**, `headSha = 3423b89…`, created `2026-11-09T10:54:18Z`. Three jobs, all success:

| Job | Job ID | Conclusion |
|---|---|---|
| Installer | `129117448558` | success |
| Frontend (ubuntu-latest) | — | success |
| Backend (ubuntu-latest) | `129117449065` | success |

Evidence: `gh run view 42604665070 --json …`. (The prompt says "both jobs"; the workflow actually defines three.)

### 1.3 Bundle — [CODE] CONFIRMED

`C:\Users\Injaz\Documents\Default Project\CommandPulse-CMMS-v1.6.11` — 227 files, **7,507,018 B**, **225** non-blank `SHA256SUMS.txt` entries. `python scripts/verify/verify_bundle.py --tag v1.6.11 --secrets` → **exit 0** (31 OK, 0 drift, 0 missing, CRED none). Evidence: recursive `Get-ChildItem` count/sum; `verify_bundle.py` exit code measured this pass.

### 1.4 Reproducible build — CONFIRMED-BY-RECORD

The two build artifacts are **no longer on disk**; only the record remains.

- `RELEASE_NOTES.md:34–39`: two independent checkouts (fresh `git archive` + worktree) each produced `F5530C9FC2C821854040EE45A2CD58A3B4CD721F7E53F90C0CB4B694A7FDC900`, 2,327,997 B, ProductVersion `1.6.11`, payload digest `c247e0af…`, Inno Setup 6.7.3.
- `RELEASE_NOTES.md:41–53`: that build was installed through its own UI on 2026-11-09 (`installer/tests/gui-e2e-v169.ps1`, log `install-20261109-135011.log`), scratch DB `cmms_installer_v1611`, port 4002, then removed.

### 1.5 Gap A — tag inventory and ancestry — [CODE]

Nineteen tags exist; **every tagged commit is an ancestor of HEAD**.

| Tag | Commit | Ancestor of HEAD | Subject |
|---|---|---|---|
| v1.0.0 | `0d941df` | YES | docs(readme): backend test count 156 -> 159 |
| v1.1.0 | `5e2c478` | YES | register: backfill B1/D2 closure-log run numbers (257) |
| v1.2.0 | `a995e77` | YES | Docs: correct the CI citation for the D-20 promotion commit |
| v1.2.1 | `2313b02` | YES | docs/handoff: the fleet i… |
| v1.3.0 | `e5ffc00` | YES | — |
| **v1.4.0** | **`afc7fe5`** | **YES** | **docs: final handover audit report** |
| v1.5.0 | `9f3084c` | YES | — |
| v1.6.0 | `0c8874e` | YES | — |
| v1.6.1 | `69e4ecc` | YES | — |
| v1.6.2 | `a8a4223` | YES | — |
| v1.6.3 | `32b32b7` | YES | — |
| v1.6.4 | `f245123` | YES | — |
| v1.6.5 | `1deb8f6` | YES | — |
| v1.6.6 | `7113b1f` | YES | — |
| v1.6.7 | `1b3046c` | YES | — |
| v1.6.8 | `10da8df` | YES | — |
| v1.6.9 | `badf1bc` | YES | — |
| v1.6.10 | `323e4ce` (tag object `e396daf`) | YES | chore(release): declare and document 1.6.10 |
| v1.6.11 | `3423b89` | YES | chore(release): declare and document 1.6.11 |

**`v1.4.0` is tagged** at `afc7fe5`, subject "docs: final handover audit report". `FINAL_HANDOVER_REPORT.md:765` authorises "tag the pushed commit `v1.4.0` and push the tag" — the intent was executed, not abandoned. There is no separate release-notes entry for v1.4.0 (release notes start at v1.6.0, `RELEASE_NOTES.md:835`), which is why the tag looked unconfirmed.

### 1.6 Gap B — deployment anchor on this host — [DEPLOY]

| Evidence | Value |
|---|---|
| Services | `CommandPulseCMMSAPI`, `CommandPulseCMMSWorker`; binaries at `…\CMMSproject\backend\service\*.exe` |
| Live API entry `backend/dist/index.js` | SHA-256 `BA2E2BDF…304D7`, 12,556 B, mtime **2026-10-31 14:12** |
| Same file in bundles v1.6.8 / v1.6.9 / v1.6.11 | **identical hash** `BA2E2BDF…304D7` |
| `git diff v1.6.8..v1.6.9` app code (`backend/`, `app/`, `frontend/`) | **empty** (26 files changed, all installer/docs/release/AGENTS/.gitignore) |
| `git diff v1.6.9..HEAD` app code | **empty** |
| IIS `C:\inetpub\cmms-site\index.html` | 402 B, mtime **2026-10-31 14:21**, references `index-C2Oachnx.js` / `index-BOm1beZ5.css` |
| Site asset `index-C2Oachnx.js` vs repo `app/dist` asset | SHA-256 identical, `783CCAD8…0360`, 1,112,271 B |
| Live `_prisma_migrations` latest | `20261015120000_alert_type_scheduler_stale`, finished `2026-10-17 17:23:27` |
| `/api/health` | 200 `{"status":"ok"}` |
| Root `RELEASE_MANIFEST.md` | untracked, 3,171 B, v1.6.8-era |
| Add/Remove entry | `CommandPulse CMMS version 1.6.11`, `InstallLocation C:\Program Files (x86)\CommandPulse\CMMS\` |

**Answer:** the *installed payload* is the **v1.6.8 bundle of 2026-10-31** (that is the build date on both `backend/dist` and the IIS site, and the root manifest is a v1.6.8 artefact). The *application code* it serves is **byte-identical to v1.6.11** — v1.6.8→v1.6.9 and v1.6.9→HEAD changed no file under `backend/`, `app/` or `frontend/`, and the entry-point hash matches all three bundles. The 1.6.11 Add/Remove entry is the UI-test payload install (`C:\Program Files (x86)\…`), **not** proof that the live application was upgraded. [DOC-CLAIM] any statement that "the host runs v1.6.11" conflates the test payload with the live tree.

### 1.7 Gap C — manifest on disk — [DOC-CLAIM]

- Root `C:\Users\Injaz\Documents\Default Project\CMMSproject\RELEASE_MANIFEST.md`: **exists, untracked**, 3,171 B, v1.6.8-era. `git ls-files --error-unmatch RELEASE_MANIFEST.md` fails.
- Current-release manifest: `C:\Users\Injaz\Documents\Default Project\CommandPulse-CMMS-v1.6.11\RELEASE_MANIFEST.md`, **4,452 B**, inside the bundle.
- No v1.6.11 manifest exists at the repository root.

---

## 2. Application vs installer state

### 2.1 No application code change since v1.6.9 — [CODE] CONFIRMED

`git diff --name-status v1.6.9..HEAD` changes only:

- `.gitignore`, `AGENTS.md`, `RELEASE_NOTES.md`
- `docs/screenshots/install_v1.6.10/*.png` (9), `docs/screenshots/install_v1.6.11/*.png` (9)
- `installer/.gitattributes` (new), `installer/README.md`, `installer/build-wizard.ps1`, `installer/wizard/Comm…`

**Zero** files under `backend/`, `app/`, `frontend/`. Same result for `v1.6.8..v1.6.9` (26 files, none application code). This confirms the Standing-State claim: v1.6.10 and v1.6.11 are installer-traceability releases.

### 2.2 Migrations — [CODE]

| Side | Count |
|---|---|
| Directories in `backend/prisma/migrations` (excl. `migration.lock`) | 22 |
| Rows in live `_prisma_migrations` | 22 |
| Name-set difference (either direction) | none |
| Failed / rolled-back rows | 0 |
| `npx prisma migrate status` | exit 0, "Database schema is up to date!" |
| Latest finished | `20261015120000_alert_type_scheduler_stale`, 2026-10-17 17:23:27 |

### 2.3 API surface — [CODE] CONFIRMED

| Source | Paths | Operations |
|---|---|---|
| Live `http://127.0.0.1:4000/api-docs.json` | 111 | 166 |
| `docs/openapi.json` | 111 | 166 |
| `docs/API_REFERENCE.md:9` claim | 111 | 166 (+ 27 routers) |

Path sets are identical in both directions (no live-only, no snapshot-only). `info.version` is `1.0.0` in both.

### 2.4 Gap D — table count — [CODE] RESOLVED

| Counting method | Result |
|---|---|
| `pg_tables` / `pg_class relkind='r'` (equivalent to `\dt`) | **39 base tables** = 38 Prisma models (`grep '^model '` → 38) + `_prisma_migrations` |
| `pg_class relkind='v'` | **23 views**, all named `report_*` |
| `information_schema.tables` | 39 `BASE TABLE` + 23 `VIEW` = **62** |

**Both figures are correct under their own method.** `GO_LIVE_CHECKLIST.md`'s 39 counts base tables; the Standing-State's 62 counts tables **and** views. The 23 views are reporting views, not Prisma models.

---

## 3. Runtime posture

### 3.1 Windows services — [DEPLOY] CONFIRMED

| Service | State | StartType | Account | Binary |
|---|---|---|---|---|
| `CommandPulseCMMSAPI` | Running | Auto | LocalSystem | `…\CMMSproject\backend\service\CommandPulseCMMSAPI.exe` |
| `CommandPulseCMMSWorker` | Running | Auto | LocalSystem | `…\CMMSproject\backend\service\CommandPulseCMMSWorker.exe` |

Source: `Get-CimInstance Win32_Service -Filter "Name LIKE 'CommandPulse%'"`.

### 3.2 IIS — [DEPLOY] CONFIRMED

Site `cmms.local` (id 2), State Started, binding `https/*:443:cmms.local`, vdir physicalPath `C:\inetpub\cmms-site`. Through production (cert-validation bypass):

- `https://cmms.local/api/health` → 200, 54 B
- `https://cmms.local/` → 200, 402 B
- `https://cmms.local/assets/index-C2Oachnx.js` → 200, 1,112,271 B

Standard-user `appcmd` fails with `redirection.config` permission error; these values come from the elevated run and `Get-ChildItem` on the site root.

### 3.3 PM2 — [DEPLOY] / [UNCERTAIN]

- `pm2` is installed (`C:\Users\Injaz\AppData\Roaming\npm\pm2.ps1`), but `pm2 list` **fails**: `connect EPERM \\.\pipe\rpc.sock`.
- `C:\Users\Injaz\.pm2\dump.pm2` exists, **14,534 B**, and contains names `cmms-api` and `cmms-worker`.
- Two PM2 daemon `node.exe` processes owned by `Injaz` (pids 10952, 12096); the service processes (pids 240, 456) are owned by `SYSTEM`.
- **The applications are not registered in a usable PM2 registry**; they run as WinSW services. The dump is a stale on-disk artefact; whether those two names are actually running under PM2 **cannot be proved** because the RPC pipe is unreadable.

### 3.4 PostgreSQL — [DEPLOY] CONFIRMED

`postgresql-x64-18`: **Running / Manual (DEMAND_START) / NT AUTHORITY\NetworkService** (`sc qc` → `START_TYPE : 3 DEMAND_START`).

| Setting | Value |
|---|---|
| `archive_mode` | `on` |
| `archive_command` | `copy "%p" "C:\cmms-wal\wal\%f"` |
| `archive_timeout` | `300` |
| `wal_level` | `replica` |
| `pg_stat_archiver` | `archived=41 failed=0 last_archived=2026-11-09 14:02:00` |

### 3.5 Divergence from `AGENTS.md` "Live application posture (2026-11-03)"

| Claim in AGENTS.md | Observed | Label |
|---|---|---|
| `postgresql-x64-18` is `Running`/`Automatic`/`NetworkService` | Running/**Manual**/NetworkService | [DEPLOY] divergence |
| PM2 entries gone; `dump.pm2` has 0 apps | `dump.pm2` 14,534 B listing `cmms-api`, `cmms-worker` (registry unreachable) | [DEPLOY] divergence |
| No mention of extra IIS sites | Leftover site `cmms-v167-test` (id 3), Started, `http/*:8081` | [DEPLOY] divergence |
| Two Windows services, LocalSystem, Automatic, boot start | Confirmed | CONFIRMED |
| Watchdog every 5 min, SYSTEM, restarts API after 3 failures | Confirmed (below) | CONFIRMED |
| IIS `cmms-site`, loopback bind 4000, firewall rule | Confirmed (site/health); firewall rule not re-queried this pass | CONFIRMED / not re-checked |

### 3.6 Gap E — watchdog visibility — [DEPLOY] PRESENT-BUT-ACL-HIDDEN

Elevated session (High Mandatory Level `S-1-16-12288`) shows **both** `CommandPulse*` tasks. Standard-user `Get-ScheduledTask 'CommandPulse*'` shows only `CommandPulse CMMS Daily Backup`.

| Property | `CommandPulse CMMS Health Watchdog` |
|---|---|
| Present | Yes |
| State | **Ready** |
| Principal | `SYSTEM`, `ServiceAccount`, `Highest` |
| LastRunTime | `11/09/2026 14:17:17` |
| LastTaskResult | `0` |
| NextRunTime | `11/09/2026 14:22:22` |
| NumberOfMissedRuns | `0` |
| Trigger | `MSFT_TaskTimeTrigger:PT5M` |
| Action | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "…\backend\service\health-watchdog.ps1" -ServiceName "CommandPulseCMMSAPI" -Url "http://127.0.0.1:4000/api/health" -LogPath "…\backend\logs\watchdog.log" -StatePath "…\backend\logs\watchdog-state.json" -Threshold 3` |
| Task-file ACL | Owner `BUILTIN\Administrators`; entries `NT AUTHORITY\SYSTEM` and `BUILTIN\Administrators` only — no `Users` |

Watchdog's own files:

| File | State |
|---|---|
| `backend\logs\watchdog-state.json` | 214 B; `lastSuccess` `2026-11-09T14:17:46`; `consecutiveFailures` 0 |
| `backend\logs\watchdog.log` | 1,612 B, mtime `2026-11-05 20:02:57` (logs failures/restarts only, so an old mtime is expected) |
| `backend\logs\watchdog.json` | absent |

**Classification: [DEPLOY] present-but-ACL-hidden.** Documentation (`ADMIN_GUIDE.md` §5.3, line 260) is correct. This is **not** [CODE] genuinely absent.

---

## 4. Verification state

### 4.1 CI — [CODE]

| Item | Result |
|---|---|
| Most recent green on `main` | run `42604665070`, `3423b89`, success, all three jobs |
| Is HEAD that SHA? | Yes — nothing landed since |
| In-progress runs | none reported |
| Most recent red on `main` | run `42603498019` at `323e4ce` (v1.6.10); Frontend+Backend passed, **Installer failed** (`RELEASE_NOTES.md:17–30`) — superseded, tag not moved |

### 4.2 Standing gates — [CODE]

| Gate | Exit | Result |
|---|---|---|
| `scripts/verify/verify_a1.py` | 0 | 214/214: Met 168, Partial 11, Not Met 0, Deferred 7, Excluded 15, Waived 13 |
| `scripts/verify/verify_a1_dispositions.py` | 0 | 77 rows — 66 Build, 11 Waive |
| `scripts/verify/verify_migration_templates.py` | 0 | pass |
| `scripts/verify/verify_bundle.py --tag v1.6.11 --secrets` | 0 | pass |

### 4.3 DB-backed suite — [CODE] CONFIRMED

CI Backend job `129117449065` on run `42604665070`: **89 test files, 1,252 tests passed, 66.49 s**. Target was the workflow's `postgres:15` **service container** (`POSTGRES_DB: cmms`), `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cmms?schema=public` (`.github/workflows/ci.yml:19–37`); the job applies migrations and runs `npx tsx prisma/seed.ts` before `npm test`. **The host live `cmms` was not the target.** Backend test files on disk = 89.

### 4.4 `verify_r7.py` — [UNCERTAIN]

The script exists and its last three commits are `8403d8f`, `4a247c8`, `7e318bc`. It is cited by `SOW_COMPLIANCE.md:332` and `:396` as the R.7 reconciliation artefact. It was **not re-run in this pass**: commit `4a247c8` changed it to resolve `DATABASE_URL` from the process environment, and `backend/.env` points at live `cmms` (AGENTS.md, Data safety). Running it would breach the read-only rule, so its last known result is **historical only** — [UNCERTAIN], not re-measured.

### 4.5 Gap F — uncommitted work — [CODE] CONTRADICTS Standing-State

`git status --short`: **0 tracked-modified, 0 staged, 12 untracked entries**.

The Standing-State says "seven untracked paths"; its own list actually enumerates **eight**, and the tree shows **twelve**:

| # | Path | In Standing-State list? |
|---|---|---|
| 1 | `IT_DEPLOYMENT_GUIDE.md` | yes |
| 2 | `RELEASE_MANIFEST.md` | yes |
| 3 | `SHA256SUMS.txt` | yes |
| 4 | `backend/ecosystem.install.config.cjs` | yes |
| 5 | `docs/E2E_V164_FINDINGS_PHASE1.md` | yes |
| 6 | `docs/migration-templates/dataset/` | yes |
| 7 | `installer/tests/gui-e2e-run.ps1` | yes |
| 8 | `playwright_uat.js` | yes |
| 9 | `frontend/` | **no** |
| 10 | `migration-templates/` | **no** |
| 11 | `ops/` | **no** |
| 12 | `site/` | **no** |

The four additional entries are directories at the repository root. None is ignored (ignored paths do not appear in `git status`).

---

## 5. Document currency audit

Status is about **accuracy against HEAD/runtime**, not about whether open items remain.

| Document | Status | Stale claim(s) / basis | Superseding source of truth |
|---|---|---|---|
| `README.md` | **PARTIALLY STALE** | PM2 presented as current runtime: lines 95, 242, 251, 313, 321, 328; no superseded banner | `ADMIN_GUIDE.md` §2.2 (line 80); `AGENTS.md` 2026-11-03 posture |
| `docs/ARCHITECTURE.md` | **PARTIALLY STALE** | PM2 as current: lines 9, 29–31, 55, 57, 151, 259, 270, 289 | `ADMIN_GUIDE.md` §2.2 |
| `docs/ADMIN_GUIDE.md` | **CURRENT** | Declares Windows services the authority (line 80), PM2 sections superseded (line 7), watchdog needs elevation (§5.3, line 260) | matches observed services + elevated task query |
| `docs/INSTALLATION_GUIDE.md` | **PARTIALLY STALE (bannered historical)** | PM2 content, but lines 25–31 carry an explicit superseded banner | banner itself; `ADMIN_GUIDE.md` §2.2 |
| `docs/IT_DEPLOYMENT_GUIDE.md` and root `IT_DEPLOYMENT_GUIDE.md` | **STALE** | Header `IT Deployment Guide (v1.6.6)`; teaches PM2 as current (§5.2, §5.6); no superseded banner | v1.6.11 app state; `ADMIN_GUIDE.md` §2.2 |
| `docs/API_REFERENCE.md` | **CURRENT** | 166 ops / 111 paths / 27 routers (line 9) matches live and snapshot | live `/api-docs.json`; `docs/openapi.json` |
| `docs/DATA_DICTIONARY.md` | **CURRENT** | 38 models, re-verified 2026-10-20 through `alert_type_scheduler_stale` (line 6) | `backend/prisma/schema.prisma` (38 `model` declarations) |
| `docs/ER_DIAGRAM.md` | **CURRENT** | 38 models, re-verified 2026-10-20 (line 5) | schema (38 models) |
| `docs/USER_MANUAL.md` | **CURRENT** | Describes present behaviour; last functional note `Updated 2026-10-20 (v1.6.0)` (line 548); no contradicting claim found | app source; no app-code change since v1.6.4 |
| `docs/WCAG-AUDIT.md` | **CURRENT (record)** | Light-pass audit record; no currency claim contradicted | — |
| `docs/GO_LIVE_CHECKLIST.md` | **PARTIALLY STALE** | Lines 5–8: "`v1.6.2` (`a8a4223`) is the current code anchor"; document is an executed go-live record but uses "current" | v1.6.11 `3423b89` (tag/CI) — resolution (d) |
| `docs/DECISION_REGISTER.md` | **CURRENT** | Status `DECIDED`; 77 rows, 20 decisions (line 9) | `verify_a1_dispositions.py` exit 0 (77 rows) |
| `docs/SOW_COMPLIANCE.md` | **CURRENT** | Summary 168/11/0/7/15/13 = 214 (lines 426–432) matches re-derivation | `verify_a1.py` exit 0 — resolution (e) |
| `docs/CMMS_FINALIZATION_TRACKER.md` | **PARTIALLY STALE (labelled history)** | Line 7 carries Phase F counts (101/50/30/8/15/10) explicitly marked as history and delegates the live column to `SOW_COMPLIANCE.md`; backlog rows v1.1-9…v1.1-28 open | `SOW_COMPLIANCE.md`; `verify_a1.py` |
| `docs/INSTALLER_TRACKER.md` | **PARTIALLY STALE (coverage gap)** | 34 rows I-01…I-34, all `Closed`; no row for the v1.6.10/v1.6.11 traceability work | resolution (c) |
| `docs/FINAL_HANDOVER_REPORT.md` | **PARTIALLY STALE (point-in-time)** | Audits `aad6a913…` (2026-10-19); HEAD is far later; authorises `v1.4.0` (line 765) | tag `v1.4.0` = `afc7fe5`; later tags v1.5.0…v1.6.11 |
| `docs/ARCHITECTURAL_EVALUATION.md` | **STALE (internal contradiction)** | Header line 8 "no code was written"; D.3 line 719 "complete and shipped in v1.6.0" | resolution (a) |
| `docs/UI_GAP_CLOSURE_PLAN.md` | **CURRENT (record)** | Approved 2026-10-18, baseline `v1.3.0` (`e5ffc00`), explicitly a plan record | — |
| `RELEASE_NOTES.md` | **CURRENT** | v1.6.11 at line 7; reproducible build + UI install at 34–53; open-items sections at 254/346/458/556/672 | measured bundle/CI |
| `RELEASE_MANIFEST.md` (root) | **STALE** | Untracked, 3,171 B, v1.6.8-era | bundle-internal v1.6.11 manifest (4,452 B) |
| `RELEASE_MANIFEST.md` (bundle-internal) | **CURRENT** | `…\CommandPulse-CMMS-v1.6.11\RELEASE_MANIFEST.md`, 4,452 B | itself |
| `AGENTS.md` | **PARTIALLY STALE** | 2026-11-03 posture says PG `Automatic` (observed Manual) and `dump.pm2` 0 apps (observed 14,534 B, 2 names) | measured service config / `dump.pm2` |

### Resolutions

**(a) ARCHITECTURAL_EVALUATION.md contradiction — [DOC-CLAIM]**
Header line 8 says the Build Now items are "no code was written"; Appendix D.3, lines 719–734, says G1–G10 are "complete and shipped in v1.6.0" with per-item SHAs. **D.3 is true at HEAD.** Evidence: `RELEASE_NOTES.md:835` opens the v1.6.0 section; `git diff v1.6.9..HEAD` shows no application change since, so shipped items remain shipped. The **header is the stale half**; a reader should believe D.3.

**(b) PM2 taught as current — [DOC-CLAIM]**
Presented as current: `README.md` (95, 242, 251, 313, 321, 328), `docs/ARCHITECTURE.md` (9, 29–31, 55, 57, 151, 259, 270, 289), `docs/IT_DEPLOYMENT_GUIDE.md` and root copy (§5.2, §5.6; header v1.6.6). Historical with a superseded banner: `docs/INSTALLATION_GUIDE.md:25–31`. Authority: `docs/ADMIN_GUIDE.md:7` and §2.2 line 80.

**(c) INSTALLER_TRACKER coverage — [DOC-CLAIM]**
Highest row is **I-34**; all 34 are `Closed` (status tally `{Closed: 34}`). There is **no row** for the v1.6.10/v1.6.11 work — `.gitattributes` LF pin (`809387f`), `build-wizard.ps1` reproducibility guards (`aaacab3`, `89f39b9`), staged/timestamp-pinned payload, dirty-tree refusal. It is documented instead in `RELEASE_NOTES.md` v1.6.10 (line 55 onward) and v1.6.11 (7–53), `installer/README.md` and the new `installer/.gitattributes` (both in the v1.6.10/11 diff).

**(d) GO_LIVE_CHECKLIST anchor — [DOC-CLAIM]**
Lines 5–8: "`v1.6.2` (`a8a4223`) is the current code anchor." The document is framed as a **durable go-live record of executed steps**, not a live reference, but the word "current" is a live claim. Against v1.6.11 (`3423b89`) it is **historical-only and needs a superseded pointer** — the document's own convention (e.g. lines 10–15) is "Superseded … pointer, original kept". `docs/HANDOFF.md:7–10` repeats the same v1.6.2 anchor and has the same defect.

**(e) SOW_COMPLIANCE summary — [CODE]**
Summary at lines 426–432: Met 168 / Partial 11 / Not Met 0 / Deferred 7 / Excluded 15 / Waived 13 / **Total 214**. Re-derived from the matrix and from `verify_a1.py` (exit 0) this pass: **exact match — no movement**. The 11 `Partial` rows are §1.3, §2.1, §4.3, §4.4, §5.1, §5.3 (×3), §5.4, §5.5, §6.1; the 7 `Deferred` rows are §1.3 warranty, §3.10 (×3), §4.1 volume, §4.6 (×2). No rows moved at HEAD; the last recorded movements are the 2026-10-15 D-20 sweep and the 2026-10-19 C7a update (`SOW_COMPLIANCE.md:434–440`).

**(f) FINAL_HANDOVER_REPORT ancestry — [CODE]**
Audited commit `aad6a9134b5d541375d8f2ee3c7072e8ea6f7ebd` (2026-10-19). HEAD `3423b89` is a descendant. The report authorises `v1.4.0` at line 765, and **the tag was cut** at `afc7fe5` ("docs: final handover audit report"), an ancestor of HEAD. Everything after that — tags v1.5.0 through v1.6.11 — postdates the audit; the report is a point-in-time record, not a live-state claim.

**(g) IT_DEPLOYMENT_GUIDE duplicates — [DOC-CLAIM]**
Two copies on disk:
- root `C:\…\CMMSproject\IT_DEPLOYMENT_GUIDE.md` — **untracked**;
- `docs\IT_DEPLOYMENT_GUIDE.md` — **tracked**.

Both are 31,815 B, SHA-256 `531DA8EC…`, byte-identical; header `IT Deployment Guide (v1.6.6)`. The bundle copy is also identical.

**(h) RELEASE_MANIFEST location — [DOC-CLAIM]**
Root file is **untracked** (`git ls-files --error-unmatch` fails) and v1.6.8-era (3,171 B). The **current-release manifest lives inside the bundle**: `CommandPulse-CMMS-v1.6.11\RELEASE_MANIFEST.md`, 4,452 B. There is no separate v1.6.11 manifest elsewhere on disk.

**(i) Untracked-file audit — [CODE]**

All twelve are **untracked**, none ignored:

| Path | Status | Stated reason / note |
|---|---|---|
| root `RELEASE_MANIFEST.md` | untracked | v1.6.8-era duplicate; no doc claims it is committed — no [DOC-CLAIM] defect found |
| `SHA256SUMS.txt` | untracked | root copy; authoritative copy is inside the bundle |
| `IT_DEPLOYMENT_GUIDE.md` (root) | untracked | duplicate of the tracked `docs/` copy |
| `docs/E2E_V164_FINDINGS_PHASE1.md` | untracked | phase-1 findings record, never committed |
| `docs/migration-templates/dataset/` | untracked | Client data; AGENTS.md forbids committing a dataset dump |
| `installer/tests/gui-e2e-run.ps1` | untracked | scratch driver; the committed harness is `gui-e2e-v169.ps1` |
| `playwright_uat.js` | untracked | scratch UAT script |
| `backend/ecosystem.install.config.cjs` | untracked | build-time installer config |
| `frontend/` | untracked | not in the Standing-State list |
| `migration-templates/` | untracked | not in the Standing-State list |
| `ops/` | untracked | not in the Standing-State list |
| `site/` | untracked | not in the Standing-State list |

No swept document was found claiming any of these paths is committed.

---

## 6. Open items register

Tags: **ED** engineering-debt · **OD** owner-decision-pending · **AR** accepted-risk · **UM** unmeasured · **DF** deferred. "Latest notes?" = carried in the most recent release-notes open-items section (v1.6.9, `RELEASE_NOTES.md:254`); v1.6.10/v1.6.11 have no open-items section.

| ID | Item | Source | Tag | Latest notes? |
|---|---|---|---|---|
| A4.1-vol | 500,000 work orders / 100,000 equipment volume limb not measured (200-VU limb is measured) | `RELEASE_NOTES.md:256–257`, `:348–349`, `:460–461` | UM | **Yes** |
| F4 | Field-level authorisation on `PUT /api/work-orders/{id}` is UI-only; API has a Technician floor | `RELEASE_NOTES.md:257–258`, `:462–463`, `:561–562`, `:679–682` | ED | **Yes** |
| CRED-v164 | `JWT_SECRET` and DB password in the v1.6.4 bundle treated as disclosed, not rotated | `RELEASE_NOTES.md:258–259`, `:467–468`, `:558–560`, `:687–689` | OD | **Yes** |
| UPG-WIN | Live upgrade restarts the API; no zero-downtime claim (planned window) | `RELEASE_NOTES.md:261–263`, `:353–356` | AR | **Yes** |
| WIZ-GUI | Wizard GUI click-through not performed (needs interactive desktop) | `RELEASE_NOTES.md:464–466` | UM | No (v1.6.7) — *v1.6.11 ran `gui-e2e-v169.ps1` through its own UI on 2026-11-09 (`:41–53`), which exercises this; the note was not updated* |
| PM-IMP | PM plan and task-list imports are header-level (targets/meters/operations/materials not importable) | `RELEASE_NOTES.md:563–565` | ED | No (v1.6.6) |
| WO-DATE | A work order can be moved to `Scheduled` via API with no dates | `RELEASE_NOTES.md:676–678` | ED | No (v1.6.5) |
| CSV-IMP | CSV import/export absent for six entity families | `RELEASE_NOTES.md:683–686` | — **closed** | No — superseded by F7 (live spec has 166 ops; `API_REFERENCE.md:9` names the CSV routes) |
| SOW-P1 | §1.3 web-based/mobile/ERP partial | `SOW_COMPLIANCE.md:426–432` | ED | — |
| SOW-P2 | §2.1 full immutable traceability partial | same | ED | — |
| SOW-P3 | §4.3 full/differential/transaction-log backups partial | same | ED | — |
| SOW-P4 | §4.4 WCAG 2.1 AA partial | same | ED | — |
| SOW-P5 | §5.1 separate background process partial | same | ED | — |
| SOW-P6 | §5.3 audit set on all tables / audit entries / all FKs (3 rows) | same | ED | — |
| SOW-P7 | §5.4 RESTful API for all CRUD partial | same | ED | — |
| SOW-P8 | §5.5 Bearer token on all calls partial | same | ED | — |
| SOW-P9 | §6.1 compiled artefacts + CI/CD partial | same | ED | — |
| SOW-D1 | §1.3 three months' warranty support | `SOW_COMPLIANCE.md:348` | DF | — |
| SOW-D2 | §3.10 ERP Equipment/Functional-Location import | `SOW_COMPLIANCE.md:348` | DF | — |
| SOW-D3 | §3.10 export material consumption | `SOW_COMPLIANCE.md:351` | DF | — |
| SOW-D4 | §3.10 export labour hours | `SOW_COMPLIANCE.md:352` | DF | — |
| SOW-D5 | §4.1 500k/100k scale | `SOW_COMPLIANCE.md:350` | DF/UM | Yes (as A4.1-vol) |
| SOW-D6 | §4.6 99.5% availability 07:00–19:00 | `SOW_COMPLIANCE.md:352` | DF | — |
| SOW-D7 | §4.6 planned maintenance windows agreed in advance | `SOW_COMPLIANCE.md:353` | DF | — |
| SOW-W | 13 waived rows (permanent non-delivery, decision IDs in Notes) | `SOW_COMPLIANCE.md:430`; `DECISION_REGISTER.md:9` | AR | — |
| AR-1 | Rec 1: index/materialise for the 500K target | `ARCHITECTURAL_EVALUATION.md:243–251` | ED | No |
| AR-2 | Rec 2: horizontal-safety (shared limiter, `pg_advisory_lock`, shared attachments, refresh-token pruning) | `:253–257` | ED | No |
| AR-3 | Rec 3: CSP, in-memory access token, magic-byte upload validation | `:259–263` | ED | No |
| AR-4 | Rec 4: Playwright RBAC in CI, ratchet lint 50→0, dependency audit, migration smoke test | `:265–269` | ED | No |
| AR-5 | Rec 5: explicit decisions on i18n/RTL, off-host backup, schema rollback | `:271–274` | OD | No |
| v1.1-9 | Row 175 cost-split editor has no screen | `CMMS_FINALIZATION_TRACKER.md:1750` | ED | No |
| v1.1-10 | Cause/failure code on a Notification | `:1751` | ED | No |
| v1.1-11…14 | Four low WCAG findings (focus trap, aria reuse, contrast, title-only names) | `:1752–1755` | ED | No |
| v1.1-15…17 | Crafts / cause-code / safety-template management screens (UI_GAP_CLOSURE_PLAN scope) | `:1756–1758`; `UI_GAP_CLOSURE_PLAN.md:10–14` | ED | No |
| v1.1-18…22 | Dashboard KPI clipping, wrong-role controls, dead notification delete, Requester floor, raw stack trace | `:1759–1763` | ED | No |
| v1.1-23…27 | Missing management UIs, capability map, `GET /users/:id` floor, delete floor, alert mark-read | `:1764–1768` | ED | No |
| v1.1-28 | Business/operational limits only discoverable from the matrix | `:1769` | ED | No |
| INST | Installer tracker non-Closed rows | `INSTALLER_TRACKER.md` | — none (34/34 Closed) | — |
| GAP-REG | "Every open item at 2026-10-08" register | `GAP_REGISTER.md:1` | AR (historical) | — |

---

## 7. Current workstream

### 7.1 What the evidence shows — [CODE]

Recent commits (`git log --oneline -12`):

```
3423b89 chore(release): declare and document 1.6.11
5075df1 fix(installer): keep a developer path out of the README sample
323e4ce chore(release): declare and document 1.6.10
aaacab3 docs(installer): record the reproducible build recipe
89f39b9 build(installer): compile a staged, timestamp-pinned payload
9a2c847 docs(agents): record working practice for search, testing and reporting
809387f fix(installer): pin wizard payload line endings to LF
badf1bc docs(release): state that the shipped setup is the tested build
32a7cb3 chore(release): declare and document 1.6.9
9907b6c test(installer): add the UI-driven wizard driver
9a6a3a4 fix(installer): keep the wizard's welcome page
26a9eb2 docs(admin): note that the watchdog task needs an elevated session to read
```

Every subject since v1.6.9 is installer traceability, release documentation, or working-practice documentation. No feature commit. `git status --short` shows **no tracked modifications** — the tree is exactly at the v1.6.11 tag with 12 untracked leftovers.

### 7.2 Focus — [CODE]

**Docs/release reconciliation and installer traceability**, not feature work, not hardening. `RELEASE_NOTES.md:9–13` states v1.6.10/11 carry "no application change"; §2.1 above confirms it by diff.

### 7.3 Stated next milestone — [UNCERTAIN]

No document states one. `RELEASE_NOTES.md` v1.6.11 ends at the verification record (line 53) with no "next" section; `CMMS_FINALIZATION_TRACKER.md` has no forward plan past the v1.1 backlog; `FINAL_HANDOVER_REPORT.md` is a point-in-time close-out. **Owner has not stated a next milestone in the documents or commit history.**

### 7.4 Gap G — natural next workstream

Of the four offered, the evidence orients toward **(i) catch up the stale docs**, and not by preference but by residue:

- The tag is an installer-traceability release; its own release note says there is no application change (`RELEASE_NOTES.md:12–13`).
- The working tree's entire non-release content is documentation and screenshots (diff above), and `AGENTS.md` carries a standing "Documentation accuracy" rule plus a precedent sweep (`v1.1-8`, closed 2026-10-16).
- The measured defects in §5 are all document-currency: PM2 taught as current in four documents, an internal contradiction in `ARCHITECTURAL_EVALUATION.md`, a v1.6.2 anchor in `GO_LIVE_CHECKLIST.md` and `HANDOFF.md`, a duplicated untracked `IT_DEPLOYMENT_GUIDE.md`, and a stale root `RELEASE_MANIFEST.md`.
- (ii) is already closed as a runtime question: the watchdog is present, Ready, and healthy (§3.6), so there is no defect to investigate.
- (iii) and (iv) have no evidence of an owner request; the architectural recommendations are explicitly "None is implemented in this commit" (`ARCHITECTURAL_EVALUATION.md:240–241`) and the v1.1 rows are a triaged backlog (`CMMS_FINALIZATION_TRACKER.md:1738`).

This is an inference from residue, labelled **[UNCERTAIN]**: it is what the project is *oriented toward*, not a stated plan.

---

## 8. Uncertainty

### 8.1 Could not verify

| Item | Reason | Label |
|---|---|---|
| Repro-build byte artefacts | No longer on disk; only `RELEASE_NOTES.md:34–39` records them | CONFIRMED-BY-RECORD |
| `verify_r7.py` current result | Re-running resolves `DATABASE_URL` from the environment and `backend/.env` targets live `cmms`; read-only rule forbids it | [UNCERTAIN] |
| PM2 registered apps | `pm2 list` fails `connect EPERM \\.\pipe\rpc.sock`; only `dump.pm2` text was readable | [UNCERTAIN] |
| `cmms-v167-test` physical path | The elevated dump queried `cmms.local` only; this site's vdir was not read | [UNCERTAIN] |
| Root `RELEASE_MANIFEST.md` provenance | Untracked; no commit or note records how it was created | [UNCERTAIN] |
| Firewall rules / loopback bind config | Not re-queried this pass (health checks reach 4000); relies on `AGENTS.md` | not re-measured |
| Whether the 1.6.11 UI-test payload is still installed | Add/Remove key present; the scratch services/DB/root were removed per `RELEASE_NOTES.md:51–53`, but the payload directory was not re-inspected | [UNCERTAIN] |

### 8.2 Documents that disagree — side chosen

| Disagreement | Side chosen | Basis |
|---|---|---|
| `AGENTS.md` says PG `Automatic`; `sc qc` says `DEMAND_START` | Observed service configuration | Source of truth over prose (`AGENTS.md`, "Verification") |
| `AGENTS.md` says `dump.pm2` has 0 apps; dump lists 2 | `AGENTS.md`'s intent (PM2 is not the runtime) | Services are the running processes; PM2 registry unreachable |
| Standing-State "seven untracked"; tree shows 12 | 12 | `git status --short` |
| Standing-State "62 tables"; GO_LIVE "39" | Both, under their own methods (39 base, 62 with views) | `pg_class` / `information_schema` re-query |
| `ARCHITECTURAL_EVALUATION.md` header vs D.3 | D.3 | `RELEASE_NOTES.md:835`; unchanged app code |
| `RELEASE_NOTES.md:683–686` says CSV absent; `API_REFERENCE.md:9` and live spec show CSV routes | `API_REFERENCE.md` / live spec | 166 ops re-derived; v1.6.5 note is historical |
| `GO_LIVE_CHECKLIST.md:5–8` / `HANDOFF.md:9` say v1.6.2 is current | v1.6.11 | `git rev-parse v1.6.11^{commit}`; CI at that SHA |

### 8.3 Suspected stale but not provable from source

- `docs/USER_MANUAL.md`: its last update note names v1.6.0 (line 548) although the application changed through v1.6.4; no measured contradiction was found, so it is classed CURRENT, not STALE.
- `docs/WCAG-AUDIT.md`: a light-pass record; whether every finding still holds at HEAD was not re-tested.
- `docs/GAP_REGISTER.md`: dated 2026-10-08 and self-described as a point-in-time register; whether entries were later closed is not recorded in the file.

### 8.4 Advisor's shortlist — resolution

| # | Item | Status | How resolved |
|---|---|---|---|
| i | **v1.4.0 tag** | **RESOLVED — exists** | `git tag --list` + `rev-parse v1.4.0^{commit}` = `afc7fe5`; subject "docs: final handover audit report"; ancestor of HEAD (exit 0). `FINAL_HANDOVER_REPORT.md:765` authorises it. No release-notes entry exists, which is why it read as unconfirmed. |
| ii | **62 vs 39 table count** | **RESOLVED — both correct** | 39 base tables (`pg_tables`/`relkind='r'`) = 38 Prisma models + `_prisma_migrations`; 23 `report_*` views (`relkind='v'`); 62 = `information_schema.tables` (39 BASE TABLE + 23 VIEW). GO_LIVE counted base tables; Standing-State counted tables+views. |
| iii | **Watchdog visibility** | **RESOLVED — present-and-ACL-hidden** | Elevated `Get-ScheduledTask` shows `CommandPulse CMMS Health Watchdog` **Ready**, SYSTEM/ServiceAccount/Highest, LastRunTime 2026-11-09 14:17:17, LastTaskResult 0, NextRunTime 14:22:22, missed 0. Task file ACL = SYSTEM + Administrators only. `watchdog-state.json` lastSuccess 14:17:46, failures 0. Classification **[DEPLOY]**; `ADMIN_GUIDE.md` §5.3 is correct. |

<!-- end: v1.0, verbatim -->

---

# Part 2 — v1.1 (follow-up, 2026-11-09)

Same HEAD (`3423b89`, `v1.6.11`), same day. This section names which prior claims were
re-tested and how they came out (§0), corrects three statements in Part 1 (§1), gives the
corrected open-items register and its diff against Part 1 §6 (§2, §3), characterises the
four untracked root directories the Standing-State list missed (§4), fixes the deployment
anchor that the word "installer" had obscured (§5), records host items D.1–D.4 (§6) and the
`verify_r7.py` safety finding with the command that is actually safe (§7), and lists exactly
what the pass changed on disk (§8).

## 0. Named prior claims — confirmed or contradicted

| Claim | Where it comes from | Verdict | Re-measured in |
|---|---|---|---|
| "the *installed payload* is the **v1.6.8 bundle of 2026-10-31**" | Part 1 §1.6 | **Contradicted in part.** The date is right; "installed" is not evidenced — no installer install ran on 2026-10-31. The payload is the developer build of 2026-10-31 14:12, byte-identical to the v1.6.11 bundle's entry point. | §5 |
| `postgresql-x64-18` is `Running`/`Automatic`/`NetworkService` | `AGENTS.md:139` (2026-11-03 posture) | **Contradicted.** `Start=3` (`DEMAND_START`) since **2026-11-05 19:19:06** (event 7040). The account is still `NetworkService`. | §6.1 |
| "`dump.pm2` has 0 apps; `dump.pm2.before-services` is the rollback copy" | `AGENTS.md:134` (2026-11-03 posture) | **Contradicted twice.** `dump.pm2` holds **2** apps; no `dump.pm2.before-services` exists. | §6.2 |
| "the firewall rule `CMMS API 4000 block external` is active on all profiles" | `AGENTS.md:121` (2026-10-17 posture) | **Contradicted.** No rule of that name and no rule covering local port 4000 or 8081 among 441 enumerated rules; the `netsh` lookup matches nothing. | §6.4 |
| Leftover IIS site `cmms-v167-test` (id 3, `http/*:8081`) is present | Part 1 §3.5, §8.1 | **Confirmed**, then removed — the one authorised runtime action. | §6.3 |
| `verify_r7.py` is a reconciliation *check* whose only obstacle to re-running is the read-only rule | Part 1 §4.4, §8.1 | **Contradicted as a characterisation.** The obstacle is the script: it `INSERT`s into eleven tables and `DELETE`s the fixture rows. It cannot be used as a read-only check against `cmms`. | §7 |
| "backlog rows v1.1-9…v1.1-28 open" | Part 1 §5 (`CMMS_FINALIZATION_TRACKER.md` row) and §6 | **Contradicted.** 15 of the 20 are closed, done or waived; 5 remain open. | §1.1, §3 |
| "12 untracked entries", against a Standing-State "seven" whose own list had eight | Part 1 §4.5 | **Confirmed.** 12 untracked, 0 modified, 0 staged, re-derived before this file was created. | §1.2, §4 |
| "CSV import/export absent for six entity families" | `RELEASE_NOTES.md:683–686`, carried as `CSV-IMP` | **Contradicted / historical.** Closed: 166 operations across 111 paths and 27 routers, with F7 CSV import and export documented. | §2 |
| the 2026-10-05 differential-backup decline is recorded in `DECISION_REGISTER.md` D-4 | follow-up brief | **Contradicted (location).** D-4 is the RPO limb. The decline is at `SOW_COMPLIANCE.md:261`, `GAP_REGISTER.md:100` (N9) and `OWNER_ACTION_SHEET.md:20` (item 6). | §1.3 |

## 1. Corrections to Part 1

**1.1 The v1.1 backlog is 5 open items, not 20.** Part 1's register carried the whole
`v1.1-9…v1.1-28` group forward as open. Read against each row's own Status cell
(`docs/CMMS_FINALIZATION_TRACKER.md:1750–1769`), **15 of the 20 are closed or waived on
owner decisions dated 2026-10-18, 2026-10-19 and 2026-10-30**, leaving 5 in 2 rows. The
over-count is 15. This is not only bookkeeping: Part 1's document-currency table calls
`CMMS_FINALIZATION_TRACKER.md` "PARTIALLY STALE (labelled history)" partly on the strength
of "backlog rows v1.1-9…v1.1-28 open", and the backlog it cites there is 75% closed. The
other leg of that verdict — the Phase F counts on line 7 being historical — is unaffected.

**1.2 The untracked count was 12 and is now 13.** Part 1 §4.5 was right: 12 entries, none
ignored. Re-derived this pass before any write, the list is identical and in the same
order, with 0 modified and 0 staged. The Standing-State's "seven untracked paths" was wrong
twice over: its own list enumerated eight, and the tree held twelve. After this pass the
tree is **13 untracked entries** (this file is the thirteenth) plus **1 tracked
modification** (`AGENTS.md`); nothing was staged.

**1.3 D-4 does not record the differential-backup decline, and still names differential
backup inside its chosen route.** `DECISION_REGISTER.md:77` (D-4) is the *RPO < 1 hour*
decision. Its decision cell reads "Build WAL archiving plus base/differential backup to
meet RPO < 1 h", and its note records the 2026-10-05 PITR rehearsal, the measured 5-minute
RPO and matrix row 262 moving `Not Met → Met`. It contains no withdrawal of the
differential limb, so read alone it implies differential backup is still planned. Three
other documents record the contrary:

- `docs/SOW_COMPLIANCE.md:261` — §4.3 mechanism row: "**Note (owner, 2026-10-05): the
  differential limb is deliberately not planned**", with the row staying `Partial` by that
  decision;
- `docs/GAP_REGISTER.md:100` (N9) — "Differential backup will not be built; transaction-log
  recovery is accepted as the mechanism and §4.3 stays `Partial` as the direct
  consequence", owner 2026-10-05;
- `docs/OWNER_ACTION_SHEET.md:20` (item 6) — "**Resolved 2026-10-05 — accepted;
  differential backup will not be built**".

Two consequences. The register class for `SOW-P3` is **AR (accepted risk)**, not ED: the
remaining `Partial` is an owner-accepted residual, not unbuilt work. And D-4's decision cell
is stale relative to the 2026-10-05 decline — a defect in the decision register, recorded
here and deliberately **not** corrected in this pass.

## 2. Corrected open-items register

Only the rows that moved or were reclassified are restated. Every other row of Part 1 §6
stands unchanged: A4.1-vol, F4, CRED-v164, UPG-WIN, WIZ-GUI, PM-IMP, WO-DATE, SOW-P1, P2 and
P4…P9, SOW-D1…D7, SOW-W, AR-1…AR-5, INST, GAP-REG.

| ID | Item | Source | Tag | State at 2026-11-09 |
|---|---|---|---|---|
| SOW-P3 | §4.3 full/differential/transaction-log backups. Full and transaction-log limbs delivered and proven (PITR drill 2026-10-05, RPO measured at 5 min, row 262 `Met`); the differential limb is declined, not outstanding | `SOW_COMPLIANCE.md:261`; `GAP_REGISTER.md:100`; `OWNER_ACTION_SHEET.md:20` | **AR** (was ED) | Row 261 stays `Partial` by owner decision 2026-10-05. Not work. |
| v1.1-23 | Management UIs: six of the eight named UIs shipped; the residual is **functional-location CSV import** and **audit-log purge**, neither reachable from the product (`purge` does not appear in `app/src`) | `CMMS_FINALIZATION_TRACKER.md:1764` | **DF** | Residual deferred to v1.1 by the owner, 2026-10-19 |
| v1.1-24…27 | Frontend capability map; `GET /users/:id` authenticate-only; `DELETE /external-services/:id` floor below the Supervisor delete pattern; alerts lack per-item mark-read and exclude Administrator | `:1765–1768` | **DF** | All four deferred to v1.1 by the owner, 2026-10-19 |

Confirmed closed during this pass: **CSV-IMP**. The live and snapshot spec carry 166
operations across 111 paths and 27 routers (`API_REFERENCE.md:9`), and `API_REFERENCE.md:55`
documents `export.csv` on every module with `import.csv` on all but notifications and users
(F7). The `RELEASE_NOTES.md:683–686` note predates F7 and is historical.

## 3. Diff against Part 1 §6

Part 1 §6 has **39 rows covering 52 register items**. Applied to it, the movements below
give **34 rows covering 37 items**.

| Part 1 §6 row | Items | Movement | Evidence |
|---|---|---|---|
| `v1.1-9` | 1 | **removed** — Closed 2026-10-18, C4 `406b393`, green CI run 340; matrix line 175 `Partial → Met` in `65d296d` under owner decision 5 | tracker `:1750` |
| `v1.1-10` | 1 | **removed** — Waived by decision D-21, 2026-10-15 | tracker `:1751`; `GAP_REGISTER.md:101` (N10) |
| `v1.1-11…14` | 4 | **removed** — C5 `b8282d7` (341), C6 `093bb5b` (342), C7 `3ce1bec` (343), C8 `bd88162` (344), all 2026-10-18 | tracker `:1752–1755` |
| `v1.1-15…17` | 3 | **removed** — C1 `dd1ab6c` (337), C2 `5ba3285` (338), C3 `b328a81` (339), all 2026-10-18 | tracker `:1756–1758` |
| `v1.1-18…22` | 5 | **removed** — C1 `80e6888`, C2 `00e2c0f`, C3 `052c5e2`, C4 `96dd5c2`, C5 `e2746df`, all 2026-10-19; batch tip `96dd5c2`, green CI run 351 | tracker `:1759–1763` |
| `v1.1-23…27` | 5 | **split into 2 rows** — `v1.1-23` stays open on its residual; `v1.1-24…27` stay open as deferred | tracker `:1764–1768` |
| `v1.1-28` | 1 | **removed** — Done 2026-10-30 (documentation audit) | tracker `:1769` |
| `CSV-IMP` | 1 | **closure confirmed** — 166 operations / 111 paths; F7 CSV documented | `API_REFERENCE.md:9`, `:55` |
| `SOW-P3` | 1 | **reclassified ED → AR** | `SOW_COMPLIANCE.md:261`; `GAP_REGISTER.md:100`; `OWNER_ACTION_SHEET.md:20` |

Net: **15 v1.1 items removed (14 closed, 1 waived), 5 remain.** Nothing else in Part 1 §6
moved, and the matrix is unchanged at **168 Met / 11 Partial / 0 Not Met / 7 Deferred / 15
Excluded / 13 Waived = 214** (`SOW_COMPLIANCE.md:426–432`).

## 4. Untracked root directories

The four directories the Standing-State list omitted are real, untracked, and none is
ignored as a directory entry. Three are byte-for-byte copies of content shipped inside the
v1.6.11 bundle; the fourth is a copy of the deployed IIS payload.

| Directory | Top entries | Files | Bytes | Newest mtime | Against the v1.6.11 bundle | Ignored? | Unignored files | What it is |
|---|---|---|---|---|---|---|---|---|
| `frontend/` | 2 | 5 | 2,028,616 | 2026-10-31 14:21:40 | **5/5 identical** | partly — `.gitignore:2:dist/` catches `frontend/dist` | 1 | The built frontend: `frontend/dist/` (4 files) plus `web.config` |
| `migration-templates/` | 32 | 61 | 32,109 | 2026-10-25 16:58:02 | **61/61 identical** | no | 61 | Copy of the bundle's template tree |
| `ops/` | 4 | 4 | 22,369 | 2026-10-28 23:41:10 | **4/4 identical** | no | 4 | Copy of the bundle's operational scripts |
| `site/` | 3 | 5 | 2,028,616 | 2026-10-31 14:21:40 | **no bundle counterpart** | no | 5 | The deployable IIS payload: `index.html` (402 B), `web.config` (884 B), `assets/` (3 files) |

Findings:

- **`site/` is the deployed payload exactly.** All 5 files are byte-identical to
  `C:\inetpub\cmms-site`, and the set equals `frontend/dist`'s 4 files plus the 884 B
  `web.config`. It is a copy, not a source: the source is `frontend/dist` +
  `frontend/web.config`.
- **`frontend/`, `migration-templates/` and `ops/` are bundle copies sitting at the
  repository root.** Nothing in them differs from the shipped bundle, so committing them
  would add no information the tag does not already carry — they are working copies left
  behind by the 2026-10-25/28 and 2026-10-31 builds.
- **The `frontend/` entry overstates itself.** In `git status` it is one directory entry; in
  content it is one file (`frontend/web.config`) plus an already-ignored `frontend/dist`.
- **No rule covers any of the four as a unit.** `git check-ignore -v frontend
  migration-templates ops site` exits 1 with no output; the only ignore interaction anywhere
  here is the `dist/` rule catching `frontend/dist`.

Disposition: **report only; nothing was changed.** None of the four should be committed
as-is. Whether they are deleted or explicitly ignored is an owner/packaging decision, not a
reconciliation one, and this section does no more than record the measurement.

## 5. Deployment anchor

**The host serves the 2026-10-31 14:12 developer build, not an installer-installed
release.** `backend/dist/index.js` is 12,556 B, mtime 2026-10-31 14:12:34, SHA-256
`BA2E2BDF489EC715171B44567465964F2A8E28B28A09E8E1F37C6FDFB8B304D7`, and the same path
inside `CommandPulse-CMMS-v1.6.11` carries the identical hash. IIS serves
`C:\inetpub\cmms-site`, whose `index.html` is 402 B, mtime 2026-10-31 14:21:40, and
references `index-C2Oachnx.js`, whose SHA-256
`783CCAD8EFD99657917AAB1FE63B653770F0EAB0CE224C63A17B21756E280360` equals the repository
copy at `app/dist/assets/index-C2Oachnx.js`. The two Windows services
(`CommandPulseCMMSAPI`, `CommandPulseCMMSWorker`) were registered on 2026-11-03 against
that same tree — binaries in `backend\service\`, working directory `backend` — and the API
listens only on `127.0.0.1:4000`. **No installer install ran on 2026-10-31:** there is no
installer log in the 14:00–14:30 window, and the day's single log,
`install-20261031-150447.log` at 15:04:47, is a `probe` run against root `C:\CMMS` with an
empty bundle and database `cmms_install` (`exists:false`). The truthful sentence is
therefore "the application **code** being served is byte-identical to v1.6.11, from a
payload built 2026-10-31 14:12 and copied to IIS at 14:21"; Part 1 §1.6's "the *installed
payload* is the **v1.6.8 bundle of 2026-10-31**" asserts an install event the evidence does
not contain, while its companion finding — that the 1.6.11 Add/Remove entry is the UI-test
payload and not proof the live application was upgraded — remains correct.

## 6. Host items

### 6.1 D.1 — PostgreSQL start type

| Item | Value | Evidence |
|---|---|---|
| `Start` | `3` (`DEMAND_START`) | `HKLM\SYSTEM\CurrentControlSet\Services\postgresql-x64-18` |
| `ObjectName` | `NT AUTHORITY\NetworkService` | same key |
| Transition | `auto → demand` on **2026-11-05 19:19:06** (the `pgagent` service follows at 19:18:57) | System event 7040 |
| `ServicesDependedOn` | `RPCSS` only | `Get-Service postgresql-x64-18` |
| Dependencies on the CMMS services | **none**, either direction | `Get-Service CommandPulseCMMSAPI,CommandPulseCMMSWorker` |

`AGENTS.md:139`'s "also under SCM (`Running`/`Automatic`/`NetworkService`)" was true on
2026-11-03 and has been stale since 2026-11-05. The consequence is not cosmetic: **a reboot
now starts the two CMMS services without PostgreSQL**, nothing declares the dependency, and
the API answers `/api/health` 200 without a database — behaviour already observed on
2026-11-03 in the reverse direction ("services started in 0.9 s without the database,
`/api/health` returned 200"). The watchdog polls that same endpoint, so it has nothing to
detect while every database-backed route is failing. Report only: **PostgreSQL's start type
was not changed in this pass**, and neither was the service dependency graph.

### 6.2 D.2 — PM2 residue

| Item | Observed |
|---|---|
| `C:\Users\Injaz\.pm2\dump.pm2` | 14,534 B, 2026-11-03 14:45:19, **2 apps**: `cmms-api` → `backend\dist\index.js`, `cmms-worker` → `backend\dist\worker.js` |
| `dump.pm2.bak` | 20,541 B, also 2 apps |
| `dump.pm2.before-services` | **absent** — contradicts `AGENTS.md:134` |
| PM2 service | none |
| Run keys, Startup folder | `HKCU`/`HKLM` `…\Run` hold no PM2 entry; the Startup folder holds only `desktop.ini` |
| `CommandPulse CMMS PM2 Resurrect` task | **absent** (explicit elevated lookup, not just a filtered list) |
| Scheduled tasks present | `CommandPulse CMMS Daily Backup`, `CommandPulse CMMS Health Watchdog` — both Ready / SYSTEM / Highest |
| Node processes | 240 and 456: children of the two services, created 2026-11-06 16:20:40 / :43, running `dist\index.js` / `dist\worker.js`. 10952 (13:30:45) and 12096 (14:21:51): orphaned `…\npm\node_modules\pm2\lib\Daemon.js`, owner `Injaz` |
| Last boot | 2026-11-05 18:46:13 |

The two PM2 daemons were started **after** the last boot, by hand at the CLI; their
timestamps fall inside the 2026-11-09 UI-test window (13:30 and 13:52 service installs).
They hold no applications: the two `dist\*.js` processes are children of the WinSW services,
not of a PM2 daemon. **A reboot would not bring PM2 up** — and would leave both daemons dead
with `dump.pm2` intact, so a later manual `pm2 resurrect` would start two duplicate
applications beside the services.

Recommendation, report only and nothing done: `pm2 kill` to clear the orphaned daemons, then
either delete the stale `dump.pm2` / `dump.pm2.bak` / `pm2.pid` or keep them knowing that
`pm2 resurrect` would double-run the applications.

### 6.3 D.3 — the leftover IIS site, removed

**Before**

| Property | Value |
|---|---|
| Site | `cmms-v167-test`, id **3**, state `Started` |
| Binding | `http/*:8081:` |
| Application pool | `cmms-v167-test` (dedicated; `cmms.local` carries no pool attribute, i.e. `DefaultAppPool`) |
| Physical path | `C:\CMMS-v167-UI\site` — **did not exist** |
| `http://127.0.0.1:8081/` | **500**, empty body |
| Port 8081 holder | PID 4 (HTTP.sys), so the request reached IIS and failed on the missing tenant |
| Firewall rule for 8081 | none |

**Action, in order**

1. `appcmd stop site "cmms-v167-test"` → `"cmms-v167-test" successfully stopped`, state
   `Stopped`.
2. `https://cmms.local/api/health` → **200**, as the gate before deleting.
3. `appcmd delete site "cmms-v167-test"` → `SITE object "cmms-v167-test" deleted`.

**After**

| Item | Value |
|---|---|
| Sites | `Default Web Site` (id 1, no bindings) + `cmms.local` (id 2, `https/*:443:cmms.local`, Started) |
| `C:\CMMS-v167-UI` | still absent — nothing to clean up on disk |
| Port 8081 | `000`; only a `TIME_WAIT` remains, nothing listens |
| `https://cmms.local/api/health` | **200** |
| `https://cmms.local/` | **200** |
| Application pools | **unchanged**: 6, including `cmms-v167-test`, plus four stale `CMCS-*` test pools |

Left in place deliberately: the `cmms-v167-test` **application pool**. It is dedicated to
the removed site and now unused, but removing the site did not require deleting it and an
idle pool costs nothing — "if in doubt, leave it". The four `CMCS-*` pools were already stale
before this pass and were left alone for the same reason.

### 6.4 D.4 — the 1.6.11 UI-test payload, and the firewall claim

| Item | Value |
|---|---|
| Install root | `C:\Program Files (x86)\CommandPulse\CMMS\` — present; `unins000.exe` dated 2026-11-09 13:49; `bundle\` empty apart from `.gitkeep`; `installer\` populated |
| Add/Remove entry | `CommandPulse CMMS version 1.6.11`, `InstallLocation C:\Program Files (x86)\CommandPulse\CMMS\` |
| Service matching `UAT\|1611` | **none** |
| Databases | `cmms`, `cmms_gate`, `postgres`, `template0`, `template1` — **no** `cmms_installer_v1611` |
| Event 7045 today | `CommandPulse CMMS API` / `Worker` installed 13:30:50 / :52 (UAT1610 binary paths) and 13:52:15 / :16 (UAT1611 binary paths); both pairs since removed |
| Live services | point at the repository `backend\service\*.exe`, not at `Program Files (x86)` |

So the UI-test **payload directory and its uninstaller** are the residue; the scratch
services, the scratch database and the install root's operational content are gone, as
`RELEASE_NOTES.md:51–53` records. The Add/Remove entry is not evidence that the live
application was upgraded.

**Firewall contradiction.** `AGENTS.md:121` states that the rule `CMMS API 4000 block
external` "is active on all profiles". Measured elevated this pass:

- 441 rules enumerated; **zero** have a display name matching `*CMMS*`, `*8081*` or
  `*4000*`;
- **zero** have a local port of 4000 or 8081 — and there is no Allow companion either;
- `netsh advfirewall firewall show rule name="CMMS API 4000 block external"` → "No rules
  match the specified criteria."

The rule is absent, not renamed. What still protects the API is the bind: `netstat` shows
`TCP 127.0.0.1:4000 … LISTENING 240` and `backend\ecosystem.config.cjs:15` sets
`BIND_HOST: '127.0.0.1'`, so port 4000 is not reachable off-host. Report only — **no
firewall change was made in this pass.** Reinstating the rule and amending the `AGENTS.md`
claim are alternatives, and choosing between them is the owner's call.

## 7. `verify_r7.py` — not read-only, and the command that is safe

Part 1 §4.4 and §8.1 recorded the script as "historical only" because it was not re-run.
That was the right call, for a stronger reason than stated: **the script writes.**

| Line range | What it does |
|---|---|
| `fixture_sql()` — 127–191 | Emits `BEGIN;`, then `INSERT INTO` rows for eleven fixture tables (`Craft`, `TaskList`, `FunctionalLocation`, `MaintenancePlan`, …), then `COMMIT` |
| Call sites — 537, 545, 702 (plus the `db_url()`-gated paths around 251/536) | Apply that fixture before asserting and delete it afterwards |
| `CLEANUP_SQL` — 194–206 | `DELETE FROM` the same tables for the fixture's natural keys |
| `db_url()` — 79–89 | Prefers the process `DATABASE_URL`; otherwise reads `backend/.env` |

`backend/.env` targets `postgresql://…@localhost:5432/cmms`. The loader
(`backend/tests/load-env.ts`) fills only variables that are **unset**, so an explicit
`DATABASE_URL` wins. `--api-port` is the script's only argument (`main()` at 519, default
4000).

Pointed at live `cmms`, it would insert fixture rows into a Client database, delete them,
and leave whatever a mid-run failure left behind. It is not a read-only check and **must
not be run against `cmms` under any circumstances**. The safe form needs a throwaway clone,
migrated, with an API instance attached to that clone:

```
# 1. throwaway clone, created by hand (never cmms)
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d postgres `
    -c "CREATE DATABASE cmms_r7_scratch;"

# 2. migrate the clone, then run the check against it
$env:DATABASE_URL='postgresql://postgres:<pw>@localhost:5432/cmms_r7_scratch'
npx prisma migrate deploy
python scripts/verify/verify_r7.py --api-port 4100

# 3. drop it when done
Remove-Item Env:\DATABASE_URL
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U postgres -d postgres `
    -c "DROP DATABASE cmms_r7_scratch;"
```

`--api-port 4100` must name an API instance running against the same clone, not the live
one. Never run it with the default environment, and never edit `backend/.env` to repoint the
project (`AGENTS.md`, Data safety).

## 8. What this pass changed

| Change | Detail |
|---|---|
| File created | `docs/PROJECT_STATE_RECONCILIATION.md` — this document |
| File edited | `AGENTS.md` — one bullet added under `## Documentation accuracy`, after the `v1.1-8` tracker bullet and before "Preserve history rather than overwriting it" |
| Host change | IIS site `cmms-v167-test` (id 3) stopped and deleted; its application pool left in place |
| Not done | no commit, no push, no `git add`, no tag, no `npm`/`prisma` command, no database write; no change to PostgreSQL service configuration, PM2, firewall, IIS bindings, PM2 dumps or the `cmms.local` site |

Tree at the end of the pass: 13 untracked entries, 1 tracked modification (`AGENTS.md`), 0
staged.

