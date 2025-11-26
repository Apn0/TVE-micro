# Instruction vs Implementation Review

This repository previously documented several fixes in `probable_failure_review.md`. The table below captures whether those instructions match the current backend implementation.

| Instruction from prior review | Current code status | Evidence |
| --- | --- | --- |
| **Config load now crashes on sensor parsing** — remove duplicate `_validate_sensor_section` and unreachable code in `load_config`. | **Resolved.** There is a single `_validate_sensor_section` helper, and `load_config` simply reads the JSON then passes it to `validate_config` without unreachable branches. | `_validate_sensor_section` has one definition and is used by `_validate_sensors`, while `load_config` returns `validate_config(raw_cfg)`.【F:backend/app.py†L176-L227】【F:backend/app.py†L355-L368】 |
| **Start button defaults to STOPPING when idle** — guard the STOPPING transition. | **Still present.** `control_loop` sets STOPPING whenever status is STARTING or RUNNING and no new start edge occurs, causing oscillation. | The start-event block is followed by `elif status in ("STARTING", "RUNNING"):` which forces STOPPING even without a stop command.【F:backend/app.py†L560-L580】 |
| **REST update branches duplicate and conflict** — consolidate validation in `UPDATE_PID`, `SET_TEMP_SETTINGS`, and `SET_LOGGING_SETTINGS`. | **Resolved.** Each handler now performs a single validation/update path without duplicate legacy blocks. | The REST command handlers validate input once and immediately apply updates for PID, temp settings, and logging settings.【F:backend/app.py†L966-L1069】 |

## Summary
- Most previously documented issues are already fixed in the current backend code, except the start/stop sequencing branch which still unconditionally transitions to `STOPPING` when status is `STARTING` or `RUNNING`.
- Future work should prioritize tightening that control-loop transition to respect explicit stop events.
