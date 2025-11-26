# API Reference: INTAREMA TVEmicro HMI Backend

Base URL: `http://<host>:5000`

All endpoints return JSON. Commands that mutate state enforce safety guards: alarms block most commands, temperature freshness is required for motor and PWM writes, and RPM/duty inputs are clamped to safe ranges.

## `/api/status` (GET)
Returns current state snapshot and validated configuration.

```json
{
  "state": {
    "status": "READY|RUNNING|STOPPING|ALARM",
    "mode": "AUTO|MANUAL",
    "alarm_msg": "string",
    "target_z1": 0.0,
    "target_z2": 0.0,
    "manual_duty_z1": 0.0,
    "manual_duty_z2": 0.0,
    "temps": {"t1": 0.0, "t2": 0.0, "t3": 0.0, "motor": 0.0},
    "temps_timestamp": 0.0,
    "motors": {"main": 0.0, "feed": 0.0},
    "relays": {"fan": false, "pump": false},
    "pwm": {"fan": 0.0, "fan_nozzle": 0.0, "pump": 0.0, "led_status": 0.0},
    "seq_start_time": 0.0
  },
  "config": { /* validated config.json content */ }
}
```

## `/api/data` (GET)
Returns current datapoint for UI polling.

- `timestamp`: server epoch timestamp
- `temps`: mapped sensor readings
- `motors`: latest RPMs
- `relays`: relay states
- `status`, `mode`: current status/mode

## `/api/log/start` (POST) and `/api/log/stop` (POST)
Control the `DataLogger`. Payload: none. Response: `{"success": true}`.

## `/api/gpio` (GET, POST)
- **GET**: Returns `{ "success": true, "status": {<pin>: {"mode": "IN|OUT", "value": 0|1}} }`.
- **POST**: Payload `{ "command": "SET_GPIO_MODE|SET_GPIO_VALUE", "value": { ... } }`.
  - `SET_GPIO_MODE`: `{ "pin": <int>, "mode": "IN|OUT", "pull_up_down": "up|down|off" }`
  - `SET_GPIO_VALUE`: `{ "pin": <int>, "value": 0|1 }`
  - Responses: `{ "success": true }` or HTTP 400 for invalid pin/value.

## `/api/control` (POST)
Single entry point for control and configuration commands. Common response: `{ "success": true }` or `{ "success": false, "msg": <reason> }` with HTTP 400/429 on validation errors.

### Operating mode and targets
- `SET_MODE`: `{ "command": "SET_MODE", "value": { "mode": "AUTO|MANUAL" } }`
- `SET_TARGET`: `{ "command": "SET_TARGET", "value": { "z1": <temp>, "z2": <temp> } }`

### Heater, motor, relay, and PWM control
- `SET_HEATER`: `{ "command": "SET_HEATER", "value": { "zone": "z1|z2", "duty": 0-100 } }`
- `SET_MOTOR`: `{ "command": "SET_MOTOR", "value": { "motor": "main|feed", "rpm": -5000..5000 } }` (requires fresh temps)
- `SET_RELAY`: `{ "command": "SET_RELAY", "value": { "relay": "fan|pump", "state": true|false } }` (0.25 s debounce)
- `SET_PWM_OUTPUT`: `{ "command": "SET_PWM_OUTPUT", "value": { "name": "<pwm channel>", "duty": 0-100 } }` (requires fresh temps)
- `MOVE_MOTOR_STEPS`: `{ "command": "MOVE_MOTOR_STEPS", "value": { "motor": "main|feed", "steps": <int>, "speed": 1-20000 } }`
- `STOP_MANUAL_MOVE`: `{ "command": "STOP_MANUAL_MOVE", "value": { "motor": "main|feed" } }`

### Safety and alarms
- `EMERGENCY_STOP`: `{ "command": "EMERGENCY_STOP" }` (latches alarm, shuts outputs)
- `CLEAR_ALARM`: `{ "command": "CLEAR_ALARM" }` (fails if physical emergency button engaged)

### Configuration updates
- `UPDATE_PID`: `{ "command": "UPDATE_PID", "value": { "zone": "z1|z2", "params": { "kp": <float>, "ki": <float>, "kd": <float> } } }`
- `UPDATE_PINS`: `{ "command": "UPDATE_PINS", "value": { "pins": { ... } } }`
- `UPDATE_EXTRUDER_SEQ`: `{ "command": "UPDATE_EXTRUDER_SEQ", "value": { "sequence": { "start_delay_feed": <sec>, "stop_delay_motor": <sec>, "check_temp_before_start": <bool> } } }`
- `UPDATE_DM556`: `{ "command": "UPDATE_DM556", "value": { "params": { "microsteps": <int>, "current_peak": 0.1-5.0, "idle_half": <bool> } } }`
- `SET_TEMP_SETTINGS`: `{ "command": "SET_TEMP_SETTINGS", "value": { "params": { "poll_interval": <sec>, "avg_window": <sec>, "use_average": <bool>, "decimals_default": <int> } } }`
- `SET_LOGGING_SETTINGS`: `{ "command": "SET_LOGGING_SETTINGS", "value": { "params": { "interval": <sec>, "flush_interval": <sec> } } }`
- `SET_SENSOR_CALIBRATION`: `{ "command": "SET_SENSOR_CALIBRATION", "value": { "params": { "channel": <int>, "logical": <str>, "enabled": <bool>, "r_fixed": <ohms>, "r_25": <ohms>, "beta": <float>, "v_ref": <float>, "wiring": "ntc_to_gnd", "decimals": <int>, "cal_points": [] } } }`
- GPIO helpers: `GPIO_CONFIG`, `GPIO_WRITE`, `GPIO_READ` for provisioning or diagnostic reads.
- `SAVE_CONFIG`: `{ "command": "SAVE_CONFIG" }` (persists `sys_config` to `config.json`).

### Error reasons to expect
- `ALARM_ACTIVE`: commands other than `CLEAR_ALARM`/`EMERGENCY_STOP` are blocked while alarm is latched.
- `TEMP_DATA_STALE`: sensor timestamps exceeded allowable staleness (poll interval * 4).
- `INVALID_*`: payload validation failures (zone, motor, duty/RPM, sequence params, pins, sensors).
- `RELAY_DEBOUNCE` / `GPIO_DEBOUNCE`: toggles issued faster than 0.25 s.
- `UNKNOWN_COMMAND`: unsupported `command` value.
