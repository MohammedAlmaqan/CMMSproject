# Row 24 — calibration pass/fail capture depth: written scope-clarification request

**To:** SOW owner
**From:** vendor
**Date:** 2026-10-02
**Subject:** DECISION_REGISTER §6.4 scope gate — calibration pass/fail capture depth (worksheet row 24, SOW §3.3.1)

**References:** `docs/DECISION_REGISTER.md` §6.4 (and §5, worksheet row 24); `docs/SOW_COMPLIANCE.md` row 24; `docs/CMMS_FINALIZATION_TRACKER.md` Phase H (H.0).

## Why this is being asked

The SOW owner confirmed on 2026-09-26 that the plant runs a calibration programme, so §3.3.1 ("Calibration work orders with pass/fail tracking") applies and is a Build row. `DECISION_REGISTER` §6.4 records that the real deliverable is **larger than a pass/fail label**, that **the label-only version must not be built**, and that the required depth is a scope clarification **the owner must close, not a decision the vendor may make**. This request closes that gate before any Phase H calibration work begins, as §6.4 requires.

## The question

For calibration work orders, which capture depth should the CMMS implement?

- **(i) Pass/fail only** — a result field per calibration work order, with no readings.
- **(ii) Full** — pass/fail plus as-found/as-left readings, the reference standard used, and the calibration due date/interval.

Only these two options are offered, matching §6.4. The label-only version — the current state, a `CAL` type with no result capture — is explicitly **not** to be built.

## What is needed from you

A written reply selecting **(i)** or **(ii)** (or a described alternative). On receipt, the answer will be recorded against `DECISION_REGISTER` §6.4 and worksheet row 24, and row 24 will be built to that depth. Work on the other Phase H rows is proceeding in parallel; **row 24 itself does not start until your answer arrives**.

## Status

Prepared and placed on record 2026-10-02. **Answered 2026-10-02: the SOW owner selected (ii) full** — pass/fail plus as-found/as-left readings, the reference standard used, and the calibration due date/interval, as defined above. Recorded against `DECISION_REGISTER` §6.4 and worksheet row 24. Row 24 is approved to build at that depth; the label-only version is not to be built.
