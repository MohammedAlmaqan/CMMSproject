# Live-database safety proof — UAT v1.7.1

Recorded 2026-11-17. Everything in this UAT ran against `cmms_uat`, a throwaway
clone restored from `backups/cmms-uat-clone-2026-11-16-1352.sql`. This file is the
evidence that the live `cmms` database was not written to by the pass.

## Method

Two read-only queries, one per database, run with `psql -At -f`:

```sql
select 'db=' || current_database();
select 'audit_total=' || count(*) from "AuditLogEntry";
select 'audit_before_1117=' || count(*) from "AuditLogEntry" where timestamp < '2026-11-17';
select 'audit_on_1117=' || count(*) from "AuditLogEntry" where timestamp >= '2026-11-17';
select 'audit_newest=' || coalesce(max(timestamp)::text, 'none') from "AuditLogEntry";
select 'token_total=' || count(*) from "RefreshToken";
select 'token_before_1117=' || count(*) from "RefreshToken" where "createdAt" < '2026-11-17';
select 'token_on_1117=' || count(*) from "RefreshToken" where "createdAt" >= '2026-11-17';
select 'token_newest=' || coalesce(max("createdAt")::text, 'none') from "RefreshToken";
```

plus a fixture census:

```sql
select 'uat_locations='   || count(*) from "FunctionalLocation" where "locationCode" like 'UAT171-LOC-%';
select 'uat_equipment='   || count(*) from "Equipment"          where "equipmentCode" like 'UAT171-EQ-%';
select 'uat_workcenters=' || count(*) from "WorkCenter"         where code like 'UAT171-WC-%';
select 'uat_workorders='  || count(*) from "WorkOrder"          where description like 'UAT 1.7.1%';
select 'uat_notifications='|| count(*) from "Notification"      where description like 'UAT 1.7.1%';
select 'uat_users='       || count(*) from "User"               where username like 'uat171-%';
```

`timestamp without time zone` columns hold UTC; local time is UTC+3.

## Result — live `cmms`

| Fact | Value |
|---|---|
| audit rows in total | 20,999 |
| audit rows dated 2026-11-17 | **0** |
| newest audit row | 2026-11-16 13:48:22.114 UTC |
| refresh tokens in total | 151 |
| refresh tokens dated 2026-11-17 | **0** |
| newest refresh token | 2026-11-16 13:41:32.889 UTC |
| `admin.lastLogin` | 2026-11-16 13:18:03.688 UTC |
| `UAT171-*` fixtures | locations 0, equipment 0, work centres 0, work orders 0, notifications 0, users 0 |
| WorkOrder / Notification / Equipment / User | 2210 / 2187 / 6127 / 6 (unchanged) |
| applied migrations | 22 |

**Nothing in the live database carries a 2026-11-17 timestamp.** The whole pass ran
today, so a single write from it would show up as a row dated today. There are none.

## Result — throwaway `cmms_uat`

| Fact | Value |
|---|---|
| audit rows in total | 21,113 |
| audit rows restored from the clone (`< 2026-11-17`) | 20,981 |
| audit rows written by this UAT (`>= 2026-11-17`) | **132** |
| refresh tokens restored / written today | 149 / **19** |
| `UAT171-*` fixtures | locations 3, equipment 3, work centres 3, work orders 10, notifications 4, users 2 |

Every write the pass made landed here: 132 audit rows and 19 tokens dated today,
plus the `UAT171-*` fixtures. The live database has zero of each.

## Open discrepancy — recorded, not explained away

Live `cmms` is not identical to the row counts quoted in the pre-run baseline
(`AuditLogEntry` 20,980 / `RefreshToken` 148). The difference is real and predates
today's pass:

- the clone was taken 2026-11-16 at **10:52 UTC** (13:52 local) and contains
  20,981 audit rows and 149 tokens;
- live now holds 20,999 and 151 — **+18 audit rows and +2 refresh tokens**;
- all 18 rows are dated **2026-11-16 between 13:18 and 13:48 UTC**
  (16:18–16:48 local), i.e. three hours *after* the clone and the day *before*
  this pass;
- the actor is `admin` (`949c6e58-ddcc-4c7e-95c5-e9e621983710`), and the rows are
  updates to existing records plus scheduled work: `WorkOrder` status /
  `plannedStart` / `plannedFinish` edits, one `WorkOrderOperation` Create, one
  `plannedCost` update and three `MaintenancePlan` Run entries;
- no `WorkOrder`, `Notification`, `Equipment` or `User` was created on 2026-11-16
  (newest WorkOrder 2026-11-14, newest Notification 2026-11-12), so this is not a
  record-creating lifecycle walk and produced none of the `UAT171-*` fixtures.

That is ordinary operational use of the live app on 2026-11-16 afternoon — the
`MaintenancePlan` Run rows are the worker's cron. It is reported here as an open
discrepancy rather than folded into a claim of "live untouched", because the
baseline counts quoted before the pass no longer describe the live database and
the difference is not attributable to this work. What is proven, and is what
matters for the safety claim, is that the pass itself wrote nothing to `cmms`:
zero rows dated today, zero fixtures.

## Teardown

`cmms_uat` was dropped and the two throwaway servers (API on 4100, static proxy on
3000) were stopped after this file was written. Ports 3000 and 4100 are free.
