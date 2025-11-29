# Project TODO List

This document consolidates pending tasks and technical debt identified from code reviews, failure analysis, and feature requests.

## High Priority (Stability & Safety)

### Backend Logic
- [ ] **Fix unconditional STOPPING transition**: In `control_loop` (`backend/app.py`), the `else` clause unconditionally sets status to `STOPPING` if not `STARTING` or `RUNNING`, causing oscillation. Guard this transition to respect explicit stop events.
- [ ] **Fix Sensor Parsing Crash**: Remove duplicate `_validate_sensor_section` helper in `backend/app.py` and fix the call signature in `_validate_sensors` to prevent crashes during config load.
- [ ] **Harden Config Loading**: Add schema validation and type guards in `load_config` (`backend/app.py`) to prevent malformed JSON from causing runtime issues or silent default fallbacks.
- [ ] **Consolidate REST Validation**: Refactor `UPDATE_PID`, `SET_TEMP_SETTINGS`, and `SET_LOGGING_SETTINGS` in `backend/app.py` to use a single validation path, removing duplicate legacy checks.
- [ ] **Validate REST Payloads**: Add range enforcement for RPM, duty cycle, and PID inputs in `api/control` to prevent invalid values from reaching hardware.
- [ ] **Guard Motor Safety**: Enhance `SET_MOTOR` safety checks to include guards for repeated toggles and invalid GPIO writes, in addition to existing temperature checks.
- [ ] **Fix Data Logger Reliability**: Implement error hooks, retries, and buffer backpressure in `DataLogger` (`backend/logger.py`) to handle disk-full scenarios and writer errors.
- [ ] **Validate Logged Values**: Ensure deviation-based flushing explicitly handles non-numeric values to prevent `NAN` entries and detection failures.
- [ ] **Sanitize PID Inputs**: Add sensor freshness checks and anti-windup/plausibility filters in the PID loop to handle stale or noisy readings safely.
- [ ] **Verify Alarm Recovery**: Ensure that clearing alarms does not immediately re-arm `running_event` if safety conditions (like E-STOP) persist.

### Reliability
- [ ] **Race Condition Analysis**: Exercise race conditions around `state_lock`, `_control_stop`, and `running_event` in `control_loop` to ensure robust status recovery.
- [ ] **ADS1115 Failure Handling**: Audit downstream usage of `ADS1115Driver.read_voltage` to ensure `None` returns are handled safely (triggering safe outputs) rather than propagating errors.

## Medium Priority (UX & Features)

### Frontend
- [ ] **Persist Alarms Tab View**: Update `AlarmsScreen.jsx` to persist the "Active vs History" toggle state (e.g., in parent component or local storage) so the user's preference is remembered.
- [ ] **History Empty State**: Add a visual cue for empty alarm history beyond the text message.

## Low Priority (Cleanup)
- [ ] **Remove Dead Code**: Prune unreachable code in `load_config` after fixing the validation logic.
