#!/usr/bin/env python3
"""Independent arithmetic for the reporting UAT.

Each function takes the *raw* work-order rows that ``GET /api/work-orders``
returns and recomputes the figure from its definition. Nothing here reads the
report handlers, so a disagreement with ``/api/reports/*`` is a real
disagreement rather than two copies of one implementation agreeing with
themselves.

The rounding mirrors ``Math.round(x * 100) / 100``: every value fed to it is
non-negative (a repair cannot end before it starts, and MTBF is clamped at
zero), which is what makes ``floor(x + 0.5)`` the exact equivalent of the
JavaScript for these inputs.
"""
import math
import re
from datetime import datetime, timezone

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def is_uuid(value):
    """True when a string is a bare database id rather than a plant label."""
    return isinstance(value, str) and bool(UUID_RE.match(value))


def parse_ts(value):
    """Parse an API timestamp (ISO-8601, usually with a trailing Z)."""
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def js_round(value, places=2):
    """``Math.round(value * 10**places) / 10**places`` for value >= 0."""
    factor = 10**places
    return math.floor(value * factor + 0.5) / factor


def repair_hours(row):
    """Hours between actual start and finish, or None when either is missing."""
    started = parse_ts(row.get("actualStart"))
    finished = parse_ts(row.get("actualFinish"))
    if started is None or finished is None:
        return None
    return (finished - started).total_seconds() / 3600.0


def mtbf(rows):
    """MTBF per equipment.

    Returns ``(by_equipment, excluded_incomplete)`` where ``by_equipment`` maps
    equipmentId -> {"mtbfHours", "breakdownCount"}. Only breakdown work orders
    (type EM) that actually started count as failures. A started-but-unfinished
    breakdown has no repair interval: it is excluded from the arithmetic and
    counted in the second return value.
    """
    per_equipment = {}
    excluded = 0
    for row in rows:
        if row.get("type") != "EM":
            continue
        equipment_id = row.get("equipmentId")
        started = parse_ts(row.get("actualStart"))
        if not equipment_id or started is None:
            continue
        hours = repair_hours(row)
        if hours is None:
            excluded += 1
            continue
        entry = per_equipment.setdefault(equipment_id, {"starts": [], "repair": 0.0})
        entry["starts"].append(started)
        entry["repair"] += hours

    result = {}
    for equipment_id, entry in per_equipment.items():
        count = len(entry["starts"])
        if count < 2:
            # One failure gives no interval to average; zero would claim the
            # asset fails back to back, so the interval is unknown.
            result[equipment_id] = {"mtbfHours": None, "breakdownCount": count}
            continue
        span_hours = (
            max(entry["starts"]) - min(entry["starts"])
        ).total_seconds() / 3600.0
        uptime = span_hours - entry["repair"]
        result[equipment_id] = {
            "mtbfHours": js_round(max(0.0, uptime / (count - 1))),
            "breakdownCount": count,
        }
    return result, excluded


def mttr(rows):
    """MTTR by equipment and by location.

    Returns ``(by_equipment, by_location, excluded_incomplete)``. Both maps hold
    ``{"mttrHours", "breakdownCount"}``. A breakdown with a missing start or
    finish contributes to neither map and is counted as excluded.
    """
    per_equipment = {}
    per_location = {}
    excluded = 0
    for row in rows:
        if row.get("type") != "EM":
            continue
        hours = repair_hours(row)
        if hours is None:
            excluded += 1
            continue
        equipment_id = row.get("equipmentId")
        if equipment_id:
            entry = per_equipment.setdefault(
                equipment_id, {"total": 0.0, "count": 0}
            )
            entry["total"] += hours
            entry["count"] += 1
        location_id = row.get("functionalLocationId")
        if location_id:
            entry = per_location.setdefault(location_id, {"total": 0.0, "count": 0})
            entry["total"] += hours
            entry["count"] += 1

    def summarise(mapping):
        return {
            key: {
                "mttrHours": js_round(entry["total"] / entry["count"]),
                "breakdownCount": entry["count"],
            }
            for key, entry in mapping.items()
        }

    return summarise(per_equipment), summarise(per_location), excluded


def downtime(rows):
    """Total downtime hours and work-order count per equipment.

    Downtime counts both corrective (CM) and emergency (EM) work orders that
    carry a start and a finish, which is what the report states.
    """
    per_equipment = {}
    for row in rows:
        if row.get("type") not in ("EM", "CM"):
            continue
        equipment_id = row.get("equipmentId")
        hours = repair_hours(row)
        if not equipment_id or hours is None:
            continue
        entry = per_equipment.setdefault(equipment_id, {"total": 0.0, "count": 0})
        entry["total"] += hours
        entry["count"] += 1
    return {
        key: {
            "totalDowntimeHours": js_round(entry["total"]),
            "workOrderCount": entry["count"],
        }
        for key, entry in per_equipment.items()
    }


def compare_maps(expected, actual, value_key, count_key):
    """Diff two id-keyed maps of {value, count}; returns a list of differences."""
    problems = []
    for key, want in expected.items():
        if key not in actual:
            problems.append(f"{key}: missing from the report")
            continue
        got = actual[key]
        if want[value_key] != got.get(value_key):
            problems.append(
                f"{key}: {value_key} expected {want[value_key]!r} got {got.get(value_key)!r}"
            )
        if want[count_key] != got.get(count_key):
            problems.append(
                f"{key}: {count_key} expected {want[count_key]!r} got {got.get(count_key)!r}"
            )
    for key in actual:
        if key not in expected:
            problems.append(f"{key}: reported but not in the raw rows")
    return problems
