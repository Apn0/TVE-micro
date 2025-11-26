# Release Notes – INTAREMA TVEmicro HMI

## Version 1.0.0 (Current)

### Highlights
- Flask backend serving REST APIs for status polling, control commands, logging control, and GPIO utilities.
- PID-based temperature control for Z1/Z2 with configurable gains and polling/averaging options.
- Safety gating for motors and PWM outputs using temperature freshness checks and debounce protections on relays/GPIO.
- Sequenced start/stop handling with configurable feed start delay and motor stop delay.
- Configurable DM556 stepper driver settings (microsteps, peak current, idle half-current) and persistent config storage.

### API changes
- `/api/control` expanded to cover PID, DM556, temperature settings, logging cadence, sensor calibration, and GPIO helpers.
- `/api/data` delivers timestamped temps/motors/relays snapshots for UI polling.
- `/api/log/start` and `/api/log/stop` provide remote control of the `DataLogger` lifecycle.

### Operational updates
- Default logging flush interval set to 60s with 0.25s collection cadence.
- Temperature freshness window computed as `poll_interval * 4` (minimum 1s) to gate motor and PWM commands.
- Relay and GPIO writes enforce a 0.25s debounce to protect hardware.

### Known issues/limitations
- Log buffer durability depends on filesystem health; disk-full scenarios can drop buffered rows.
- ADC read failures surface as missing sensor values; alarms rely on stale-data detection to guard motors/heaters.
- Malformed `config.json` falls back to defaults with warnings instead of hard failure.

### Upgrade checklist
1. Backup existing `config.json` and log data.
2. Deploy updated backend code and dependencies from `backend/requirements.txt`.
3. Validate sensors/PWM/DM556 settings via `/api/status` and adjust with `UPDATE_*` commands.
4. Run a supervised start/stop sequence to confirm safety interlocks and debounce behaviors.
5. Update operator documentation and runbooks; brief the on-call rotation on changes above.
