# On-call and Support Runbooks

This playbook covers operational triage, severity definitions, escalation paths, and step-by-step actions for the INTAREMA TVEmicro HMI.

## Severity levels
- **Sev1 (Safety/Production block)**: Any alarm that cannot be cleared, unsafe heater/motor behavior, or PLC/API unreachable during production.
- **Sev2 (Degraded operations)**: UI/API available but certain commands rejected (e.g., `TEMP_DATA_STALE`, relay debounce blocking needed toggles), or logging unavailable.
- **Sev3 (Minor/Cosmetic)**: Non-blocking UI glitches, documentation gaps, or intermittent sensor dropouts that auto-recover.

## Escalation path
- **Primary on-call**: Ops engineer (24/7 pager).
- **Secondary**: Controls engineer familiar with GPIO/DM556 wiring.
- **Tertiary**: Software engineer owning `backend/app.py` and configuration schema.
- **Vendor/Plant**: Facilities or maintenance crew for hardware inspections.

Escalate within 15 minutes for Sev1, within 60 minutes for Sev2. Post-mortems are required for Sev1 within 48 hours.

## Triage tree
1. **Is an alarm latched?**
   - Yes → Note `alarm_msg`, verify emergency button state, attempt `CLEAR_ALARM` once. If blocked, treat as Sev1 and escalate.
   - No → Continue.
2. **Are temperatures fresh?**
   - If datapoints are stale in `/api/status` or `/api/data`, inspect sensors/ADC wiring; confirm `temp_settings.poll_interval` and increase if needed. Sev2 if production blocked.
3. **Actuator responsiveness**
   - Commands rejected with `RELAY_DEBOUNCE`/`GPIO_DEBOUNCE`: wait 0.25 s and retry. Persistent? Check for noisy inputs; Sev2.
   - Motors not spinning: check `SET_MOTOR` response and RPM clamp (±5000). Validate safety guard did not reject due to stale temps.
4. **Configuration integrity**
   - Run `GET /api/status` to confirm pins/PWM/sensor mappings. If incorrect, adjust with `UPDATE_*` commands and `SAVE_CONFIG`.
5. **Logging**
   - If logs are absent, POST `/api/log/start`; confirm `logging.interval` and `flush_interval` in config. Escalate to software if exceptions appear.

## Standard actions
- **Restart backend safely**
  1. POST `EMERGENCY_STOP` then `CLEAR_ALARM` to force outputs off.
  2. Stop the service via supervisor/systemd; verify `shutdown()` runs to disable heaters/motors.
  3. Restart service and verify `/api/status` returns `READY`.
- **Sensor calibration or replacement**
  1. Disable the channel (`enabled: false`) via `SET_SENSOR_CALIBRATION` if noisy.
  2. Install replacement and re-enable with proper `logical`, `beta`, `r_fixed`, `r_25`, `v_ref`, and `decimals` values.
  3. Save configuration and validate readings.
- **GPIO wiring validation**
  - Use `GPIO_CONFIG` to set direction and `GPIO_READ/WRITE` to confirm wiring continuity. Ensure pins map to `config.json` assignments.

## Communication templates
- **Incident start (Sev1/Sev2)**: “TVEmicro HMI incident <ID>: status=<status>, alarm_msg=<msg>, commands impacted=<list>. Investigating; next update in 30 min.”
- **Mitigation**: “Outputs safe, backend restarted, awaiting sensor freshness. Monitoring for 15 min before closing.”
- **Resolution**: “Restored READY state. Root cause <summary>. Follow-ups: <tickets>.”

## Post-incident
- File a post-mortem with timeline, logs, and configuration diffs.
- Add regression checks to `/api/control` commands that failed (e.g., invalid RPM validation, debounce tuning).
- Update this runbook and training materials with lessons learned.
