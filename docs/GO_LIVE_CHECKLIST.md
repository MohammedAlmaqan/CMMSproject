# Go-live checklist

This is the durable go-live checklist for CommandPulse CMMS. It records the steps that
must be completed **at the go-live event**, as distinct from the acceptance milestone.
Go-live has not happened yet: `v1.1.0` (`5e2c478`) is the acceptance snapshot and
`v1.2.1` (`2313b02`, cut 2026-10-17) is the current deployment anchor. The steps below are
forward-looking and are re-verified on the target host, not assumed from the rehearsal
host.

*Superseded 2026-10-17 - pointer, original kept: this line read "`v1.2.0` (`a995e77`) is
the current deployment anchor". `v1.2.0` is now historical and is not moved, nor are
`v1.1.0` and `v1.0.0`.*

*History: this checklist existed only in the advisor's working memory before 2026-10-16;
that was the defect, because a durable step that lives in one person's head is not a
step the next operator can run. It is written down here so the row-334 §6.4/c defect
position and the operational deploy steps have a single, checkable home.*

## How to use

Work top to bottom on the target host and record the result of each step. An item is
closed only when its stated verification passes **on the host being deployed to** — a
pass on the rehearsal host is not a pass at go-live. The two defect-position items at the
end come from matrix row 334 (§6.4/c, "No open Critical or Major defects at go-live"),
whose `Met` is an **acceptance-time** call; the go-live verification of the defect
position is a deployment step recorded here, not a reopening of the row.

## Operational steps

1. **CA certificate.** A self-signed certificate `CN=cmms.local` is installed in the
   host's `LocalMachine\My` store (expiry 2031-10-02). The §4.2 TLS rehearsal passed over
   HTTPS on 2026-10-02 (tracker G.4) and was re-verified against the live site on
   2026-10-03 (`curl -k https://cmms.local/api/health` → 200 JSON, matrix row 256). The
   certificate is **not** in `LocalMachine\Root`, so clients still need `-k` / see a
   browser warning. Replace it with a public-CA certificate **only if the plant requires
   a machine-trusted certificate**; the installation guide recommends a public CA for
   production but does not make it mandatory. See `INSTALLATION_GUIDE.md` (Enable
   HTTPS / TLS). *Verified: cert present on this host; replacement is an owner call.*

2. **`archive_mode=on` on the live PostgreSQL cluster.** WAL archiving and PITR were
   rehearsed on 2026-10-05 (`scripts/pitr-drill.ps1`, matrix row 262 `Met`), but
   `archive_mode` is still `off` on the live `localhost:5432` cluster, so nothing is
   archiving yet. Turn it on with a real second target. See `ADMIN_GUIDE.md` 7.8.
   *Closed 2026-10-17:* archiving is now active on the live cluster. The settings were
   applied with `ALTER SYSTEM` (written to `postgresql.auto.conf`): `archive_mode=on`,
   `archive_command = 'copy "%p" "C:\cmms-wal\wal\%f"'`, `archive_timeout=300`; the
   PostgreSQL service was restarted, and `SELECT pg_switch_wal()` confirmed a segment
   reached the target — `pg_stat_archiver` reported `archived_count=1`, `failed_count=0`,
   last segment `00000001000000000000003A` at 2026-10-17 19:12:49. *Superseded open check
   (kept): `archive_mode` was off on the live cluster.*

3. **Windows Scheduled Task for the daily backup.** `scripts\backup.bat` exists and the
   paired backup/restore drill passed on 2026-09-29 (189 work orders, 75/75 attachments
   verified; the full recovery sequence was re-measured on 2026-10-14 at 85.82 s, matrix
   row 263), but the scheduled task itself has not been created. Create it and set
   `PGPASSWORD` in the task's environment. See `ADMIN_GUIDE.md` 7.4.
   *Closed 2026-10-17:* the task `CommandPulse CMMS Daily Backup` is created (daily
   02:00, runs `scripts\backup.bat`) and was verified by an on-demand run that produced
   `backups\cmms-2026-10-17-1905.sql` (9,254,347 bytes, `PostgreSQL database dump
   complete`) with its paired 211-file `-uploads` snapshot; `PGPASSWORD` is read from the
   existing machine-scoped variable, so no credential is stored in the task.
   **Recorded deviation (owner call 2026-10-17):** the task runs as the *interactive*
   user `Injaz` — only while that user is logged on — rather than a dedicated
   noninteractive service account. The owner accepted this for the single-user laptop
   deployment; the documented service-account form remains the enterprise template. A
   task created by `schtasks` also defaults to `DisallowStartIfOnBatteries`, which left
   this laptop's task queued and never running, so those power conditions were cleared
   and `StartWhenAvailable` set. *Superseded open check (kept): no CMMS/backup scheduled
   task exists on this host.*

4. **PM2 autostart on boot.** `pm2 start` / `pm2 save` / `pm2 startup` are documented in
   `INSTALLATION_GUIDE.md`, but no saved PM2 process list exists on this host, so PM2
   will not restore the apps after a reboot. Run `pm2 save` and the generated
   `pm2 startup` command.
   *Closed 2026-10-17:* both apps run under PM2 from `backend/ecosystem.config.cjs` —
   `cmms-api` (fork, port 4000) and `cmms-worker` (fork) are `online` as user `Injaz` — and
   `pm2 save` wrote `C:\Users\Injaz\.pm2\dump.pm2`. **`pm2 startup` does not apply on this
   host:** it is Unix-only and exits with `Error: Init system not found` under Windows, so
   it produces no copy-paste command. The Windows equivalent was registered instead: the
   Scheduled Task `CommandPulse CMMS PM2 Resurrect` runs `pm2 resurrect` at logon and is
   present (`State: Ready`). **Recorded deviation:** it is a *logon* task, not a boot task,
   so PM2 starts only once `Injaz` logs on — the same "logged-on only" model already
   accepted for the backup task — and a pre-logon boot task would need a stored password or
   an S4U principal. *Superseded open check (kept): no `dump.pm2` on this host.*

5. **Apply the pending migrations to the live `cmms` database.** The live `cmms`
   database is behind the repository schema by **three** migrations — not one. Applied:
   19 of 22. Pending: `20261009120000_status_and_type_check_constraints` (C15),
   `20261014120000_refresh_token_last_used` (**the C1 migration**), and
   `20261015120000_alert_type_scheduler_stale`. Apply them with `prisma migrate deploy`
   as part of the cutover (or as the pre-migration step in `migration-runbook.md` §3).
   *Verified: live `cmms` lacks `RefreshToken.lastUsedAt`, the `WorkOrder_status_check`
   constraint and the widened `SystemAlert_alertType_check`.*

6. **Hosts entry for `cmms.local` on the target host.** `127.0.0.1 cmms.local` is already
   present in this host's hosts file; add the same line on the target host if it differs.
   See `INSTALLATION_GUIDE.md` (Enable HTTPS / TLS, Verify). *Verified: present on this
   host.*

7. **Firewall rules.** Block inbound TCP 4000 from non-loopback addresses, and allow
   inbound 443 (already permitted by the host's IIS rules). The block-4000 command is in
   `INSTALLATION_GUIDE.md` (Enable HTTPS / TLS).
   *Closed 2026-10-17:* the rule `CMMS API 4000 block external` is active (Inbound, Block,
   TCP 4000, `-RemoteAddress Any`, all profiles). Loopback stays reachable — Windows
   Firewall does not filter loopback — so `https://cmms.local/api/health` returned 200 both
   before and after the rule was applied, while external 4000 is denied. The guide's
   companion "loopback only" rule was dropped: `New-NetFirewallRule` rejected the loopback
   IPv6 literal with `0x80070057` (*"An unspecified, multicast, broadcast, or loopback IPv6
   address was specified"*), and a block rule made it redundant; `INSTALLATION_GUIDE.md`
   was corrected to the single rule. 443 needs no new rule (already allowed by the host's
   IIS rules). *Superseded open check (kept): no `CMMS*` firewall rules exist on this host.*

8. **Extractor output folder is a stable, non-git path.** The migration runbook requires
   the extractor's `--out` directory to be a scratch directory
   (`migration-runbook.md` §2), and for the cutover run it must be a stable location that
   is not the OS temp directory and not inside the repository. *Verified: no extractor
   output directory currently sits in `%TEMP%`; this is a cutover instruction.*

9. **C1 session-security verification in the deployed instance.** C1 (server-side idle
   expiry, single-use refresh rotation, revocable logout) was developed and verified
   against the throwaway `cmms_c1` database (GAP register C1 closure). After step 5
   applies the C1 migration to the deployed database, confirm the server-side idle
   window, refresh rotation and logout revocation behave as specified in the deployed
   instance. *Closed 2026-10-17 (live):* verified against the deployed API on the live
   `cmms` database (the owner authorised the session writes this requires). Sign-in → `200`;
   `POST /api/auth/refresh` returns a rotated cookie whose value differs from the presented
   one (`200`); replaying the pre-rotation cookie → `401` (single-use); `POST /api/auth/logout`
   → `204` and the rotated cookie is then refused by `/api/auth/refresh` → `401` (revocation);
   with a live session `/api/auth/me` → `200`, and once its `RefreshToken.lastUsedAt` is
   backdated past `SESSION_IDLE_MS` (30 min default) `/api/auth/me` → `401` and the row is
   revoked — server-side idle expiry, independent of the browser. *Superseded open check
   (kept): C1 has run only against a throwaway database.*

## Defect position (matrix row 334 §6.4/c)

10. **Verify the PM-page defect stays closed through the go-live event.** `b47c2be`
    (2026-10-16) fixed the `normalizeDecimals` Date flattening that made the Preventive
    Maintenance page throw on `new Date({})`. Confirm on the deployed build that
    `/preventive-maintenance` renders the plan list. See `SOW_COMPLIANCE.md` row 334 and
    `HANDOFF.md` (Date-window impact check). *Verified: `b47c2be` is an ancestor of the
    `v1.2.1` deployment anchor (`2313b02`), so the fix ships with the anchor; it was not an
    ancestor of the previous `v1.2.0` anchor (`a995e77`).* *Closed 2026-10-17 (live):*
    headless Chromium (Playwright) signed in to the deployed `https://cmms.local` and loaded
    `/preventive-maintenance`; the plan list rendered — page heading present, 1 plan row, no
    console/page errors, no `Invalid time value` and no error boundary — and the deployed
    `backend/dist/index.js` carries the `b47c2be` `instanceof Date` guard in
    `normalizeDecimals`. Screenshot: `screenshots/golive_10_pm_page.png`.

11. **Verify no other Critical/Major defect was open at acceptance and is still open at
    go-live.** Any such defect must be closed before deployment. Row 334's `Met` is an
    acceptance-time call on the defect position as it stood on 2026-10-05; this step
    re-checks that position at go-live. *Closed 2026-10-17 (go-live re-check):*
    `GAP_REGISTER.md` categories A–D are empty (no open code/data, close-now or blocker
    item); Category E holds 10 owner decisions/acceptances, not defects; the one `npm audit`
    critical (`proxy-addr`) was cleared at `89585f8`, and the sole residual is the dev-only
    `deepmerge-ts` advisory (unreachable at runtime) accepted in C21. No open Critical/Major
    defect remains. *Superseded open check (kept): re-check to be performed at go-live.*

## Security controls

12. **Restrict filesystem access to the live `backend\.env` (and the bundle `.env.deploy`).**
    `backend\.env` holds `JWT_SECRET`, the sole signing key for every access token; there is
    no access-token denylist and no signing-key rotation, so anyone who can read the file can
    mint a token for any user, including an Administrator. Both `backend\.env` and the
    bundle's `backend\.env.deploy` inherited ACEs granting non-administrator local groups
    `Modify` and `Read` respectively. Restrict each to **SYSTEM**, **Administrators** and the
    service/logon account (**Injaz** on this host), with inheritance disabled so the inherited
    group ACEs are removed. Run PowerShell as Administrator (substitute the target host's
    service account for `Injaz`):

    ```powershell
    icacls backend\.env /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" "Injaz:F"
    ```

    Verify with `icacls backend\.env` that only those three principals remain and no
    `(I)`-inherited ACE is listed. *Closed 2026-10-21 (live):* the live `backend\.env` and the
    v1.6.2 bundle's `backend\.env.deploy` were both restricted to SYSTEM / Administrators /
    Injaz with inheritance removed; `icacls` confirmed the `CodexSandboxUsers` and the
    unresolved-SID ACEs are gone. The live `JWT_SECRET` was rotated in the same change and PM2
    restarted, invalidating all pre-existing sessions.
