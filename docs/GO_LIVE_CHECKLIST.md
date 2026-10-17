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
   *Verified open: `archive_mode` is off on the live cluster.*

3. **Windows Scheduled Task for the daily backup.** `scripts\backup.bat` exists and the
   paired backup/restore drill passed on 2026-09-29 (189 work orders, 75/75 attachments
   verified; the full recovery sequence was re-measured on 2026-10-14 at 85.82 s, matrix
   row 263), but the scheduled task itself has not been created. Create it and set
   `PGPASSWORD` in the task's environment. See `ADMIN_GUIDE.md` 7.4. *Verified open: no
   CMMS/backup scheduled task exists on this host.*

4. **PM2 autostart on boot.** `pm2 start` / `pm2 save` / `pm2 startup` are documented in
   `INSTALLATION_GUIDE.md`, but no saved PM2 process list exists on this host, so PM2
   will not restore the apps after a reboot. Run `pm2 save` and the generated
   `pm2 startup` command. *Verified open: no `dump.pm2` on this host.*

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
   inbound 443 (already permitted by the host's IIS rules). The block-4000 commands are
   in `INSTALLATION_GUIDE.md` (Enable HTTPS / TLS). *Verified open: no `CMMS*` firewall
   rules exist on this host.*

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
   instance. *Verified open: C1 has run only against a throwaway database.*

## Defect position (matrix row 334 §6.4/c)

10. **Verify the PM-page defect stays closed through the go-live event.** `b47c2be`
    (2026-10-16) fixed the `normalizeDecimals` Date flattening that made the Preventive
    Maintenance page throw on `new Date({})`. Confirm on the deployed build that
    `/preventive-maintenance` renders the plan list. See `SOW_COMPLIANCE.md` row 334 and
    `HANDOFF.md` (Date-window impact check). *Verified: `b47c2be` is an ancestor of the
    `v1.2.1` deployment anchor (`2313b02`), so the fix ships with the anchor; it was not an
    ancestor of the previous `v1.2.0` anchor (`a995e77`).*

11. **Verify no other Critical/Major defect was open at acceptance and is still open at
    go-live.** Any such defect must be closed before deployment. Row 334's `Met` is an
    acceptance-time call on the defect position as it stood on 2026-10-05; this step
    re-checks that position at go-live. *Verified open: re-check to be performed at
    go-live.*
