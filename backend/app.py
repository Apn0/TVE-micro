# file: backend/app.py
"""
Main application entry point for the TVE-micro extruder control system.

This module initializes the Flask backend, configures the hardware abstraction
layer (HAL), manages the central control loop (PID, sequences, safety checks),
and exposes REST API endpoints for the frontend.
"""

import os
import sys
import json
import time
import threading
import copy
import math
import logging
import atexit
import shutil
from datetime import datetime

# Ensure the repository root is on the import path when the file is executed
# directly (e.g., `python app.py` from the backend directory).
CURRENT_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO

from backend.hardware import HardwareInterface, SYSTEM_DEFAULTS
from backend.safety import SafetyMonitor
from backend.logger import DataLogger
from backend.pid import PID
from backend.autotune import AutoTuner
from backend.alarm_utils import (
    load_alarms_from_disk,
    save_alarms_to_disk,
    create_alarm_object,
)
from backend.metrics import (
    API_VALIDATION_ERRORS_TOTAL,
    SYSTEM_STATE,
)
from prometheus_client import make_wsgi_app
from werkzeug.middleware.dispatcher import DispatcherMiddleware

# JSONDecodeError available in json module
from json import JSONDecodeError

CONFIG_FILE = os.path.join(CURRENT_DIR, "config.json")

MAX_HEATER_DUTY = 100.0
MIN_HEATER_DUTY = 0.0
MAX_PWM_DUTY = 100.0
MAX_MOTOR_RPM = 5000.0

logging.basicConfig(level=logging.INFO)
app_logger = logging.getLogger("tve.backend.app")

def _validate_pid_section(section: dict, name: str, errors: list[str]):
    """
    Validate PID configuration section.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS[name])
    for param in ("kp", "ki", "kd"):
        if param in section:
            try:
                value = float(section[param])
                if not math.isfinite(value) or value < 0:
                    raise ValueError("PID parameters must be non-negative")
                if value > 1000:
                    raise ValueError("PID parameters must be <= 1000")
                result[param] = value
            except (TypeError, ValueError):
                errors.append(f"Invalid {name}.{param}, using default")
    return result


def _validate_dm556(section: dict, errors: list[str]):
    """
    Validate DM556 motor driver configuration.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["dm556"])
    if "microsteps" in section:
        try:
            microsteps = int(section["microsteps"])
            if microsteps > 0:
                result["microsteps"] = microsteps
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid dm556.microsteps, using default")
    if "current_peak" in section:
        try:
            current_peak = float(section["current_peak"])
            if 0.1 <= current_peak <= 5.0:
                result["current_peak"] = current_peak
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid dm556.current_peak, using default")
    if "idle_half" in section:
        result["idle_half"] = bool(section.get("idle_half", result["idle_half"]))
    return result


def _validate_pins(section: dict, errors: list[str]):
    """
    Validate GPIO pin configuration.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["pins"])
    for name, default_pin in result.items():
        if name in section:
            val = section[name]
            if val is None:
                result[name] = None
                continue
            if isinstance(val, str) and not val.strip():
                result[name] = None
                continue
            try:
                pin = int(val)
                if 0 <= pin <= 40:
                    result[name] = pin
                else:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Invalid pin {name}, using default {default_pin}")
    return result


def _validate_pwm(section: dict, errors: list[str]):
    """
    Validate PWM configuration.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["pwm"])
    if "enabled" in section:
        result["enabled"] = bool(section.get("enabled", result["enabled"]))
    if "bus" in section:
        try:
            result["bus"] = int(section["bus"])
        except (TypeError, ValueError):
            errors.append("Invalid pwm.bus, using default")
    if "address" in section:
        try:
            result["address"] = int(section["address"])
        except (TypeError, ValueError):
            errors.append("Invalid pwm.address, using default")
    if "frequency" in section:
        try:
            freq = float(section["frequency"])
            if 10.0 <= freq <= 50000.0:
                result["frequency"] = freq
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid pwm.frequency, using default")
    if "channels" in section and isinstance(section["channels"], dict):
        channels = {}
        for name, ch in section["channels"].items():
            try:
                ch_num = int(ch)
                if 0 <= ch_num <= 15:
                    channels[name] = ch_num
            except (TypeError, ValueError):
                errors.append(f"Invalid pwm channel for {name}, skipping")
        if channels:
            result["channels"] = channels
    return result


def _validate_sensor_section(
    section: dict, default_section: dict, errors: list[str], sensor_key: str
):
    """
    Validate a single sensor's configuration.
    """
    result = copy.deepcopy(default_section)

    if "enabled" in section:
        result["enabled"] = bool(section.get("enabled", result["enabled"]))
    if "logical" in section:
        result["logical"] = str(section.get("logical", result["logical"]))

    for field_name, key in (("r_fixed", "r_fixed"), ("r_25", "r_25"), ("beta", "beta"), ("v_ref", "v_ref")):
        if key not in section:
            continue
        parsed = _parse_float_with_suffix(section.get(key, result.get(key)))
        if parsed is None or parsed <= 0:
            errors.append(f"{field_name} must be a positive number")
            continue
        result[key] = parsed

    if "wiring" in section:
        result["wiring"] = str(section.get("wiring", result["wiring"]))

    if "decimals" in section:
        try:
            dec = int(section.get("decimals", result["decimals"]))
            if dec < 0:
                raise ValueError
            result["decimals"] = dec
        except (TypeError, ValueError):
            errors.append("decimals must be a non-negative integer")

    if "cal_points" in section:
        cal_points = section.get("cal_points", result.get("cal_points", []))
        if isinstance(cal_points, list):
            validated_points = []
            for pt in cal_points:
                if isinstance(pt, dict) and "x" in pt and "y" in pt:
                    try:
                        validated_points.append({"x": float(pt["x"]), "y": float(pt["y"])})
                    except (TypeError, ValueError):
                        continue
            result["cal_points"] = validated_points
        else:
            errors.append("cal_points must be an array of {x, y} objects")

    if errors:
        errors.append(f"Invalid sensor configuration for key {sensor_key}, using defaults")
        return copy.deepcopy(default_section)

    return result


def _validate_sensors(section: dict, errors: list[str]):
    """
    Validate the entire sensors configuration block.
    """
    if not isinstance(section, dict):
        errors.append("Invalid sensors configuration, using defaults")
        return copy.deepcopy({int(k): v for k, v in SYSTEM_DEFAULTS["sensors"].items()})

    result: dict[int, dict] = {}
    for key, cfg in section.items():
        try:
            idx = int(key)
        except (TypeError, ValueError):
            errors.append(f"Invalid sensor key {key}, skipping")
            continue
        if not isinstance(cfg, dict):
            errors.append(f"Invalid sensor entry for key {key}, using defaults")
            cfg = {}
        default_section = SYSTEM_DEFAULTS["sensors"].get(str(idx)) or next(
            iter(SYSTEM_DEFAULTS["sensors"].values())
        )
        validated = _validate_sensor_section(cfg, default_section, errors, str(idx))
        result[idx] = validated
    if not result:
        return copy.deepcopy({int(k): v for k, v in SYSTEM_DEFAULTS["sensors"].items()})
    return result


def _validate_temp_settings(section: dict, errors: list[str]):
    """
    Validate temperature monitoring settings.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["temp_settings"])

    if "poll_interval" in section:
        try:
            value = float(section["poll_interval"])
            if 0.01 <= value <= 60.0:
                result["poll_interval"] = value
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid temp_settings.poll_interval (must be 0.01-60.0), using default")

    if "avg_window" in section:
        try:
            value = float(section["avg_window"])
            if 0.01 <= value <= 600.0:
                result["avg_window"] = value
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid temp_settings.avg_window (must be 0.01-600.0), using default")

    if "use_average" in section:
        result["use_average"] = bool(section.get("use_average", result["use_average"]))

    if "decimals_default" in section:
        try:
            dec = int(section["decimals_default"])
            if 0 <= dec <= 5:
                result["decimals_default"] = dec
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid temp_settings.decimals_default (must be 0-5), using default")

    return result


def _validate_logging(section: dict, errors: list[str]):
    """
    Validate data logging settings.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["logging"])

    if "interval" in section:
        try:
            value = float(section["interval"])
            if 0.01 <= value <= 3600.0:
                result["interval"] = value
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid logging.interval (must be 0.01-3600.0), using default")

    if "flush_interval" in section:
        try:
            value = float(section["flush_interval"])
            if 0.1 <= value <= 3600.0:
                result["flush_interval"] = value
            else:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Invalid logging.flush_interval (must be 0.1-3600.0), using default")

    return result


def _validate_motion(section: dict, errors: list[str]):
    """
    Validate motion configuration settings.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["motion"])
    for key in ("ramp_up", "ramp_down", "max_accel", "max_jerk"):
        if key in section:
            try:
                value = float(section[key])
                if value >= 0 and math.isfinite(value):
                    result[key] = value
                else:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Invalid motion.{key}, using default")
    return result


ALLOWED_SEQUENCE_DEVICES = {"main_motor", "feed_motor", "fan", "pump"}
ALLOWED_SEQUENCE_ACTIONS = {"on", "off"}


def _validate_seq_steps(value, phase: str, errors: list[str]):
    """
    Validate a sequence of steps for a given phase.
    """
    if not isinstance(value, list):
        errors.append(f"extruder_sequence.{phase} must be a list of steps")
        return []

    validated: list[dict] = []
    for raw in value:
        if not isinstance(raw, dict):
            errors.append(f"Invalid step in extruder_sequence.{phase}; expected object")
            continue

        device = str(raw.get("device", ""))
        action = str(raw.get("action", "")).lower()
        delay = _coerce_finite(raw.get("delay"))
        enabled = bool(raw.get("enabled", True))

        if device not in ALLOWED_SEQUENCE_DEVICES:
            errors.append(f"Unknown device in extruder_sequence.{phase}: {device}")
            continue
        if action not in ALLOWED_SEQUENCE_ACTIONS:
            errors.append(f"Invalid action for {device} in extruder_sequence.{phase}")
            continue
        if delay is not None and delay < 0:
            errors.append(
                f"Delay for {device} in extruder_sequence.{phase} must be non-negative"
            )
            continue

        validated.append(
            {
                "device": device,
                "action": action,
                "delay": max(0.0, delay if delay is not None else 0.0),
                "enabled": enabled,
            }
        )

    return validated


def _merge_seq_steps(base: list[dict], incoming: list[dict]):
    """
    Merge default steps with incoming config overrides.
    """
    merged = {step.get("device"): step for step in base if step.get("device")}
    for step in incoming:
        dev = step.get("device")
        if not dev:
            continue
        merged[dev] = {**merged.get(dev, {}), **step}
    return list(merged.values())


def _validate_extruder_sequence(section: dict, errors: list[str]):
    """
    Validate the extruder startup/shutdown sequence.
    """
    result = copy.deepcopy(SYSTEM_DEFAULTS["extruder_sequence"])

    if "check_temp_before_start" in section:
        result["check_temp_before_start"] = bool(
            section.get("check_temp_before_start", result["check_temp_before_start"])
        )

    # Legacy support for simple delays
    legacy_start = section.get("start_delay_feed")
    legacy_stop = section.get("stop_delay_motor")
    if legacy_start is not None or legacy_stop is not None:
        legacy_steps = {
            "startup": [
                {
                    "device": "main_motor",
                    "action": "on",
                    "delay": 0.0,
                    "enabled": True,
                },
                {
                    "device": "feed_motor",
                    "action": "on",
                    "delay": max(0.0, legacy_start or 0.0),
                    "enabled": True,
                },
            ],
            "shutdown": [
                {
                    "device": "feed_motor",
                    "action": "off",
                    "delay": 0.0,
                    "enabled": True,
                },
                {
                    "device": "main_motor",
                    "action": "off",
                    "delay": max(0.0, legacy_stop or 0.0),
                    "enabled": True,
                },
            ],
        }
        for phase, steps in legacy_steps.items():
            result[phase] = _merge_seq_steps(result.get(phase, []), steps)

    for phase in ("startup", "shutdown", "emergency"):
        if phase in section:
            validated_steps = _validate_seq_steps(section[phase], phase, errors)
            result[phase] = _merge_seq_steps(result.get(phase, []), validated_steps)

    return result


def validate_config(raw_cfg: dict):
    """
    Validate the entire application configuration dictionary.

    Args:
        raw_cfg (dict): The raw configuration dictionary loaded from JSON.

    Returns:
        dict: A validated configuration dictionary with defaults applied where necessary.
    """
    errors: list[str] = []
    cfg = copy.deepcopy(SYSTEM_DEFAULTS)

    cfg["z1"] = _validate_pid_section(raw_cfg.get("z1", {}), "z1", errors)
    cfg["z2"] = _validate_pid_section(raw_cfg.get("z2", {}), "z2", errors)
    cfg["dm556"] = _validate_dm556(raw_cfg.get("dm556", {}), errors)
    cfg["pins"] = _validate_pins(raw_cfg.get("pins", {}), errors)
    cfg["pwm"] = _validate_pwm(raw_cfg.get("pwm", {}), errors)
    cfg["sensors"] = _validate_sensors(raw_cfg.get("sensors", {}), errors)
    cfg["adc"] = copy.deepcopy(SYSTEM_DEFAULTS["adc"])
    if "adc" in raw_cfg:
        try:
            result = copy.deepcopy(SYSTEM_DEFAULTS["adc"])
            if "enabled" in raw_cfg["adc"]:
                result["enabled"] = bool(raw_cfg["adc"].get("enabled", result["enabled"]))
            if "bus" in raw_cfg["adc"]:
                result["bus"] = int(raw_cfg["adc"]["bus"])
            if "address" in raw_cfg["adc"]:
                result["address"] = int(raw_cfg["adc"]["address"])
            if "fsr" in raw_cfg["adc"]:
                fsr = float(raw_cfg["adc"]["fsr"])
                if fsr > 0:
                    result["fsr"] = fsr
                else:
                    raise ValueError
            cfg["adc"] = result
        except (TypeError, ValueError):
            errors.append("Invalid adc configuration, using defaults")

    cfg["temp_settings"] = _validate_temp_settings(raw_cfg.get("temp_settings", {}), errors)
    cfg["logging"] = _validate_logging(raw_cfg.get("logging", {}), errors)
    cfg["motion"] = _validate_motion(raw_cfg.get("motion", {}), errors)
    cfg["extruder_sequence"] = _validate_extruder_sequence(
        raw_cfg.get("extruder_sequence", {}), errors
    )

    if errors:
        for err in errors:
            print(f"CONFIG_WARNING: {err}")

    return cfg


def load_config():
    """
    Load and validate configuration from config.json.
    Falls back to defaults if file is missing (non-interactive) or corrupt.
    Backs up corrupt files.
    """
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                raw_cfg = json.load(f)
            return validate_config(raw_cfg)
          
        except JSONDecodeError:
            app_logger.error(f"Malformed JSON in {CONFIG_FILE}")

            # Backup malformed file
            ts = datetime.now().strftime("%Y%m%d%H%M%S")
            backup_path = f"{CONFIG_FILE}.bak.{ts}"
            app_logger.warning(f"Backing up malformed config to {backup_path}")
            try:
                shutil.copy(CONFIG_FILE, backup_path)
            except Exception as copy_err:
                app_logger.error(f"Failed to backup corrupt config: {copy_err}")

            print(f"Error: {CONFIG_FILE} contains invalid JSON. Using defaults.")
            return validate_config({})

        except Exception as e:
            ts = datetime.now().strftime("%Y%m%d%H%M%S")
            backup_path = f"{CONFIG_FILE}.bak.{ts}"
            app_logger.error(f"Failed to load config.json: {e}")
            app_logger.warning(f"Backing up corrupt config to {backup_path} and loading defaults.")
            try:
                shutil.copy(CONFIG_FILE, backup_path)
            except Exception as copy_err:
                app_logger.error(f"Failed to backup corrupt config: {copy_err}")

            return validate_config({})

    else:
        print(f"Configuration file {CONFIG_FILE} not found.")
        # Check if running interactively
        if sys.stdin.isatty():
            try:
                resp = input("Use default configuration from hardware.py? [y/N] ")
                if resp.lower().startswith("y"):
                    return validate_config({})
            except (EOFError, OSError):
                pass
            print("Startup aborted: No configuration file.")
            sys.exit(1)
        else:
            print("Non-interactive mode detected. Using default configuration.")
            return validate_config({})


def _coerce_finite(value: object) -> float | None:
    """
    Safely convert object to finite float or None.
    Unified helper for config loading and API validation.
    """
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num):
        return None
    return num


def _validate_payload(payload: dict, schema: dict) -> tuple[dict, list[str]]:
    """
    Validate and clean a payload against a schema.
    Returns (cleaned_data, errors).

    Schema format:
    {
        "field_name": {
            "type": type (int, float, str, bool),
            "required": bool,
            "min": number,
            "max": number,
            "allowed": list,
        }
    }
    """
    cleaned = {}
    errors = []

    for field, rules in schema.items():
        val = payload.get(field)

        # Check required
        if rules.get("required", False) and val is None:
            errors.append(f"Missing required field: {field}")
            continue

        if val is None:
            continue

        target_type = rules.get("type")

        # Type Coercion & Check
        if target_type == float:
            val = _coerce_finite(val)
            if val is None:
                errors.append(f"{field} must be a number")
                continue
        elif target_type == int:
            try:
                val = int(val)
            except (ValueError, TypeError):
                errors.append(f"{field} must be an integer")
                continue
        elif target_type == bool:
            if not isinstance(val, bool):
                # Try to coerce mildy? Or strict?
                # Strict: must be bool. Loose: Allow 0/1.
                # Let's be strict for API unless it's query param.
                # But existing code does bool(req.get(...)).
                if val in (1, 0): val = bool(val)
                elif isinstance(val, str) and val.lower() in ("true", "false"):
                    val = val.lower() == "true"
                elif not isinstance(val, bool):
                     errors.append(f"{field} must be a boolean")
                     continue
        elif target_type == str:
            if not isinstance(val, str):
                errors.append(f"{field} must be a string")
                continue

        # Range Check
        if "min" in rules and val < rules["min"]:
            errors.append(f"{field} must be >= {rules['min']}")
            continue
        if "max" in rules and val > rules["max"]:
            errors.append(f"{field} must be <= {rules['max']}")
            continue

        # Allowed Values
        if "allowed" in rules and val not in rules["allowed"]:
            errors.append(f"{field} must be one of {rules['allowed']}")
            continue

        cleaned[field] = val

    return cleaned, errors


def _parse_float_with_suffix(value: object) -> float | None:
    """Coerce a value to float, allowing engineering suffixes like 'k' or 'M'."""

    multiplier = 1.0

    if isinstance(value, str):
        trimmed = value.strip().lower()
        if trimmed.endswith("k"):
            multiplier = 1e3
            trimmed = trimmed[:-1]
        elif trimmed.endswith("m"):
            multiplier = 1e6
            trimmed = trimmed[:-1]
        value = trimmed

    coerced = _coerce_finite(value)
    if coerced is None:
        return None
    return coerced * multiplier

sys_config = load_config()
sensor_cfg = {int(k): v for k, v in sys_config.get("sensors", {}).items()}

running_event = threading.Event()
running_event.set()
alarm_clear_pending = False

hal: HardwareInterface | None = None

safety = SafetyMonitor()
logger = DataLogger()
logger.configure(sys_config.get("logging", {}))

pid_z1 = PID(**sys_config["z1"], output_limits=(0, 100))
pid_z2 = PID(**sys_config["z2"], output_limits=(0, 100))

auto_tuner = AutoTuner()

state = {
    "status": "READY",
    "mode": "AUTO",
    "active_alarms": [],
    "alarm_history": load_alarms_from_disk(),
    "target_z1": 0.0,
    "target_z2": 0.0,
    "manual_duty_z1": 0.0,
    "manual_duty_z2": 0.0,
    "heater_duty_z1": 0.0,
    "heater_duty_z2": 0.0,
    "temps": {},
    "temps_timestamp": 0.0,
    "motors": {"main": 0.0, "feed": 0.0},
    "relays": {"fan": False, "pump": False},
    "peltier_duty": 0.0,
    "pwm": {k: 0.0 for k in sys_config.get("pwm", {}).get("channels", {})},
    "seq_start_time": 0.0,
}

state_lock = threading.Lock()

_control_thread: threading.Thread | None = None
_control_stop = threading.Event()

relay_toggle_times: dict[str, float] = {}
gpio_write_times: dict[int, float] = {}
TOGGLE_DEBOUNCE_SEC = 0.25

app = Flask(__name__)
CORS(app)

# Initialize SocketIO in 'threading' mode to work with your existing threads
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Add prometheus wsgi middleware to export metrics at /metrics
app.wsgi_app = DispatcherMiddleware(app.wsgi_app, {
    '/metrics': make_wsgi_app()
})


# _safe_float removed in favor of unified _coerce_finite


def _clamp(value: float, min_value: float, max_value: float) -> float:
    """Clamp a float between min and max."""
    return max(min_value, min(max_value, value))


def _temps_fresh(now: float) -> tuple[bool, str | None]:
    """Check if temperature data is recent enough."""
    poll_interval = float(sys_config.get("temp_settings", {}).get("poll_interval", 0.25))
    allowed_age = max(1.0, poll_interval * 4)
    with state_lock:
        ts = state.get("temps_timestamp", 0.0)
    if ts <= 0 or now - ts > allowed_age:
        return False, "TEMP_DATA_STALE"
    return True, None

def _all_outputs_off():
    """Turn off all hardware outputs immediately."""
    hal.set_heater_duty("z1", 0.0)
    hal.set_heater_duty("z2", 0.0)
    hal.set_motor_rpm("main", 0.0)
    hal.set_motor_rpm("feed", 0.0)
    hal.set_relay("fan", False)
    hal.set_relay("pump", False)
    hal.set_peltier_duty(0.0)
    for name in getattr(hal, "pwm_channels", {}):
        hal.set_pwm_output(name, 0.0)
    with state_lock:
        state["motors"]["main"] = 0.0
        state["motors"]["feed"] = 0.0
        state["relays"]["fan"] = False
        state["relays"]["pump"] = False
        state["peltier_duty"] = 0.0
        for name in state.get("pwm", {}):
            state["pwm"][name] = 0.0


def _capture_output_snapshot():
    """Capture a snapshot of the current output states."""
    with state_lock:
        motors_copy = dict(state.get("motors", {}))
        relays_copy = dict(state.get("relays", {}))
        pwm_copy = dict(state.get("pwm", {}))
    return {"motors": motors_copy, "relays": relays_copy, "pwm": pwm_copy}


def _apply_sequence_action(step: dict, snapshot: dict):
    """Apply a single action from the extruder sequence."""
    device = step.get("device")
    action = step.get("action")
    enabled = step.get("enabled", True)
    if not enabled:
        return

    on = action == "on"
    if device == "main_motor":
        target = snapshot.get("motors", {}).get("main", 0.0) or 10.0
        value = target if on else 0.0
        hal.set_motor_rpm("main", value)
        with state_lock:
            state["motors"]["main"] = value
    elif device == "feed_motor":
        target = snapshot.get("motors", {}).get("feed", 0.0) or 10.0
        value = target if on else 0.0
        hal.set_motor_rpm("feed", value)
        with state_lock:
            state["motors"]["feed"] = value
    elif device == "fan":
        hal.set_relay("fan", on)
        with state_lock:
            state["relays"]["fan"] = on
    elif device == "pump":
        hal.set_relay("pump", on)
        with state_lock:
            state["relays"]["pump"] = on


def _process_sequence_phase(phase: str, seq_cfg: dict, start_time: float, now: float, actions_done: set[str], snapshot: dict):
    """
    Execute the startup/shutdown sequence based on elapsed time.

    Args:
        phase (str): 'startup', 'shutdown', or 'emergency'.
        seq_cfg (dict): Sequence configuration.
        start_time (float): Timestamp when the sequence started.
        now (float): Current timestamp.
        actions_done (set): Set of action keys already performed.
        snapshot (dict): Snapshot of state at sequence start.

    Returns:
        bool: True if the sequence phase is complete, False otherwise.
    """
    steps = [s for s in seq_cfg.get(phase, []) if s.get("enabled", True)]
    if not steps and phase in ("shutdown", "emergency"):
        steps = [
            {"device": "feed_motor", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "main_motor", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "fan", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "pump", "action": "off", "delay": 0.0, "enabled": True},
        ]
    max_delay = max([s.get("delay", 0.0) for s in steps], default=0.0)
    elapsed = now - start_time if start_time else 0.0

    for step in steps:
        delay = max(0.0, float(step.get("delay", 0.0)))
        key = f"{phase}:{step.get('device')}"
        if key in actions_done:
            continue
        if elapsed + 1e-9 >= delay:
            _apply_sequence_action(step, snapshot)
            actions_done.add(key)

    done = len(actions_done) >= len(steps) or elapsed >= max_delay + 1.0
    return done

def _set_status(new_status: str):
    """Update the global system status."""
    with state_lock:
        current_status = state.get("status")
        state["status"] = new_status
        if new_status in ("READY", "RUNNING"):
            state["seq_start_time"] = 0.0
        elif current_status != new_status:
            state["seq_start_time"] = time.time()
            app_logger.info(f"state_transition: {current_status} -> {new_status}")

    try:
        SYSTEM_STATE.state(new_status)
    except Exception:
        pass


def _latch_alarm(reason: str):
    """
    Transition to ALARM state and record the alarm event.
    Turns off all outputs.
    """
    global last_btn_start_state, last_btn_stop_state

    # Determine severity
    severity = "WARNING"
    if "EMERGENCY" in reason or "CRITICAL" in reason:
        severity = "CRITICAL"

    running_event.clear()
    _all_outputs_off()
    with state_lock:
        state["seq_start_time"] = time.time()
    last_btn_start_state = False
    last_btn_stop_state = False

    with state_lock:
        # Avoid duplicate active alarms for the same reason
        existing = next(
            (a for a in state["active_alarms"] if a["type"] == reason and not a["cleared"]),
            None,
        )
        if not existing:
            new_alarm = create_alarm_object(reason, severity)
            state["active_alarms"].append(new_alarm)
            state["alarm_history"].append(new_alarm)
            save_alarms_to_disk(state["alarm_history"])

        state["status"] = "ALARM"

startup_lock = threading.Lock()


def _ensure_hal_started():
    """Lazy-initialize the Hardware Interface if needed."""
    if hal is None:
        with startup_lock:
            if hal is None:
                try:
                    startup()
                except Exception:
                    app_logger.exception("HAL startup failed")
                    return (
                        jsonify({"success": False, "msg": "HAL_NOT_INITIALIZED"}),
                        503,
                    )
    return True, None

last_btn_start_state = False
last_btn_stop_state = False

def emit_change(category, key, value, state_obj):
    """
    Updates state_obj and emits a WebSocket event if the value changed.
    """
    # Initialize category if missing
    if category not in state_obj:
        state_obj[category] = {}

    old_val = state_obj[category].get(key)

    # Update the internal state (so polling still works!)
    state_obj[category][key] = value

    # If value changed, push to WebSocket clients
    # (We use a small epsilon for floats to avoid noise)
    changed = False
    if old_val is None:
        changed = True
    elif isinstance(value, float) and isinstance(old_val, float):
        if abs(value - old_val) > 0.001:
            changed = True
    elif value != old_val:
        changed = True

    if changed:
        socketio.emit('io_update', {
            "category": category,
            "key": key,
            "val": value
        })

def control_loop():
    """
    Main background thread loop for system control.
    Handles PID loops, safety checks, sequence logic, and data logging.
    """
    global last_btn_start_state, last_btn_stop_state, alarm_clear_pending

    last_poll_time = 0
    last_log_time = 0
    temps = {}
    prev_status = None
    seq_actions_done: set[str] = set()
    seq_snapshot: dict = _capture_output_snapshot()

    while not _control_stop.is_set():
        now = time.time()

        temp_settings = sys_config.get("temp_settings", {})
        poll_interval = float(temp_settings.get("poll_interval", 0.25))

        log_settings = sys_config.get("logging", {})
        log_interval = float(log_settings.get("interval", 0.25))

        if hal is None:
            time.sleep(0.05)
            continue

        if last_poll_time == 0:
            _set_status("READY")

        btn_em = hal.get_button_state("btn_emergency")
        alarm_req = "EMERGENCY_STOP_BTN" if btn_em else None

        if alarm_clear_pending:
            if btn_em:
                _latch_alarm("EMERGENCY_STOP_BTN")
                alarm_clear_pending = False
                time.sleep(0.05)
                continue
            running_event.set()
            safety.reset()

            # Mark all active alarms as cleared if they are resolvable
            # Note: Persistent conditions (like e-stop button held down) will re-trigger
            # almost immediately in the next loop, which is correct.
            with state_lock:
                # Move active alarms to history only?
                # Actually, we keep them in history, but remove from active list if they are cleared.
                # However, logic below re-latches if condition persists.
                # So we just empty the active list for a "try clear" attempt.
                for alarm in state["active_alarms"]:
                    alarm["cleared"] = True
                    # Update the record in history too
                    for h in state["alarm_history"]:
                        if h["id"] == alarm["id"]:
                            h["cleared"] = True
                            break

                state["active_alarms"] = []
                save_alarms_to_disk(state["alarm_history"])
                state["status"] = "READY"

            alarm_clear_pending = False
            time.sleep(0.05)
            continue

        btn_start = hal.get_button_state("btn_start")
        start_event = btn_start and not last_btn_start_state
        last_btn_start_state = btn_start

        btn_stop = hal.get_button_state("btn_stop")
        stop_event = btn_stop and not last_btn_stop_state
        last_btn_stop_state = btn_stop
        should_poll = (now - last_poll_time) >= poll_interval or start_event
        if should_poll:
            last_poll_time = now
            temps = hal.get_temps()

            with state_lock:
                # 1. Update Temperatures via emit_change
                for sensor, val in temps.items():
                    emit_change("temps", sensor, val, state)

                state["temps_timestamp"] = hal.get_last_temp_timestamp() or now

                # 2. Update Motors (get current RPMs from HAL)
                # We assume HAL has current values stored in self.motors
                emit_change("motors", "main", hal.motors.get("main", 0.0), state)
                emit_change("motors", "feed", hal.motors.get("feed", 0.0), state)

                # 3. Update Relays
                emit_change("relays", "fan", hal.relays.get("fan", False), state)
                emit_change("relays", "pump", hal.relays.get("pump", False), state)

                # 4. Update PWM
                for ch_name, duty in hal.pwm_outputs.items():
                    emit_change("pwm", ch_name, duty, state)

                # Standard status updates
                status = state["status"]
                mode = state["mode"]
                target_z1 = state["target_z1"]
                target_z2 = state["target_z2"]
        else:
            with state_lock:
                status = state["status"]
                mode = state["mode"]
                target_z1 = state["target_z1"]
                target_z2 = state["target_z2"]

        if status == "STOPPING" and running_event.is_set():
            with state_lock:
                motors_snapshot = dict(state.get("motors", {}))
            if all(abs(motors_snapshot.get(name, 0.0)) < 1e-6 for name in ("main", "feed")):
                _set_status("READY")
                with state_lock:
                    status = state["status"]

        if running_event.is_set() and status != "ALARM" and should_poll:
            ok, reason = safety.check(state, hal)
            if not ok:
                alarm_req = alarm_req or reason

        # START button logic: Only allow starting from READY.
        if (
            running_event.is_set()
            and not alarm_req
            and start_event
            and status == "READY"
        ):
            seq = sys_config.get("extruder_sequence", {})
            temps_for_start = temps if temps else hal.get_temps()
            with state_lock:
                state["temps"] = temps_for_start

            if seq.get("check_temp_before_start", True):
                allowed, reason = safety.guard_motor_temp(temps_for_start)
                if allowed:
                    _set_status("STARTING")
                else:
                    alarm_req = reason
            else:
                _set_status("STARTING")

        # STOP button logic: Only allow stopping from RUNNING or STARTING.
        stop_requested = False
        if stop_event and status in ("RUNNING", "STARTING"):
            stop_requested = True

        if stop_requested:
            _set_status("STOPPING")
        elif status not in ("READY", "STARTING", "RUNNING", "STOPPING", "ALARM", "OFF"):
             # Fallback for invalid state
             app_logger.warning(f"Invalid state detected: {status}. Resetting to READY.")
             _set_status("READY")
        elif status not in ("READY", "STARTING", "RUNNING", "STOPPING", "ALARM", "OFF"):
             # Fallback for invalid state
             app_logger.warning(f"Invalid state detected: {status}. Resetting to READY.")
             _set_status("READY")

        if alarm_req:
            _latch_alarm(alarm_req)

        with state_lock:
            status = state["status"]
            mode = state["mode"]
            target_z1 = state["target_z1"]
            target_z2 = state["target_z2"]
            temps = dict(state.get("temps", {}))
            temps_timestamp = state.get("temps_timestamp", 0.0)
            seq_start_time = state.get("seq_start_time", 0.0)

        now = time.time()

        if status != prev_status:
            seq_actions_done.clear()
            seq_snapshot = _capture_output_snapshot()
            prev_status = status
            if status in ("STARTING", "STOPPING", "ALARM") and not seq_start_time:
                with state_lock:
                    state["seq_start_time"] = now
                    seq_start_time = now

        if not running_event.is_set() and status != "ALARM":
            with state_lock:
                state["status"] = "ALARM"
                status = "ALARM"
                seq_start_time = state.get("seq_start_time", now) or now

        seq_cfg = sys_config.get("extruder_sequence", {})

        if status == "ALARM" or not running_event.is_set():
            if status == "ALARM":
                if not seq_start_time:
                    with state_lock:
                        state["seq_start_time"] = now
                        seq_start_time = now
                _process_sequence_phase("emergency", seq_cfg, seq_start_time, now, seq_actions_done, seq_snapshot)
            led = (int(now * 10) % 2) == 0
            hal.set_led_state("led_status", led)
            with state_lock:
                snapshot = dict(state)
            try:
                logger.log(snapshot, hal)
            except Exception:
                app_logger.exception("Failed to log snapshot while in alarm loop")
            time.sleep(0.05)
            continue

        if status in ("STARTING", "STOPPING") and not seq_start_time:
            with state_lock:
                state["seq_start_time"] = now
                seq_start_time = now
            seq_snapshot = _capture_output_snapshot()

        if status == "STARTING":
            if _process_sequence_phase("startup", seq_cfg, seq_start_time, now, seq_actions_done, seq_snapshot):
                with state_lock:
                    state["status"] = "RUNNING"
                    state["seq_start_time"] = 0.0
                seq_actions_done.clear()
                status = "RUNNING"
                prev_status = status
        elif status == "STOPPING":
            if _process_sequence_phase("shutdown", seq_cfg, seq_start_time, now, seq_actions_done, seq_snapshot):
                with state_lock:
                    state["status"] = "READY"
                    state["seq_start_time"] = 0.0
                seq_actions_done.clear()
                status = "READY"
                prev_status = status

        if status == "RUNNING":
            led = True
        elif status in ("STARTING", "STOPPING"):
            led = (int(now * 2) % 2) == 0
        else:
            led = False
        hal.set_led_state("led_status", led)

        # Global safety check for stale temperatures (AUTO or MANUAL)
        freshness_timeout = float(temp_settings.get("freshness_timeout", poll_interval * 4))
        temps_age = now - temps_timestamp if temps_timestamp else float("inf")
        temps_fresh = temps_timestamp and temps_age <= freshness_timeout

        # Check individual sensors used for heating control
        t2_ts = hal.get_sensor_timestamp("t2")
        t3_ts = hal.get_sensor_timestamp("t3")
        t2_age = now - t2_ts if t2_ts else float("inf")
        t3_age = now - t3_ts if t3_ts else float("inf")

        sensors_fresh = (
            t2_ts and t2_age <= freshness_timeout and
            t3_ts and t3_age <= freshness_timeout
        )

        if not temps_fresh or not sensors_fresh:
            _latch_alarm(alarm_req or "TEMP_DATA_STALE")
            # Explicitly force heaters off now to be safe, although _latch_alarm does it too
            hal.set_heater_duty("z1", 0.0)
            hal.set_heater_duty("z2", 0.0)
            with state_lock:
                state["heater_duty_z1"] = 0.0
                state["heater_duty_z2"] = 0.0
            time.sleep(0.05)
            continue

        if mode == "AUTO":
            t2 = temps.get("t2")
            t3 = temps.get("t3")

            # --- Check AutoTuner ---
            if auto_tuner.active:
                # Determine which sensor we are tuning
                tune_input = t2 if auto_tuner.zone_name == 'z1' else t3

                # Update Tuner
                tune_out = auto_tuner.update(tune_input)

                if tune_out is not None:
                    # Tuner is controlling this zone
                    if auto_tuner.zone_name == 'z1':
                        hal.set_heater_duty("z1", tune_out)
                        with state_lock:
                            state["heater_duty_z1"] = tune_out
                            # Force other PID to track/reset to avoid windup
                            pid_z1.reset()

                    elif auto_tuner.zone_name == 'z2':
                        hal.set_heater_duty("z2", tune_out)
                        with state_lock:
                            state["heater_duty_z2"] = tune_out
                            pid_z2.reset()

                    # Update status in state for frontend
                    with state_lock:
                        state["autotune_status"] = auto_tuner.state
                        state["autotune_cycle"] = auto_tuner.cycle_count

                # If tuner finished just now
                if auto_tuner.state in ("DONE", "FAILED") and not auto_tuner.active:
                    with state_lock:
                        state["autotune_status"] = auto_tuner.state
                        if auto_tuner.state == "DONE":
                            res = auto_tuner.get_pid_suggestions()
                            state["autotune_result"] = res

            else:
                # --- Standard PID Logic ---
                pid_z1.setpoint = target_z1
                pid_z2.setpoint = target_z2

                def apply_heater(temp_val, controller, heater_name):
                    if temp_val is None:
                        controller.reset()
                        hal.set_heater_duty(heater_name, 0.0)
                        with state_lock:
                            state[f"heater_duty_{heater_name}"] = 0.0
                        return

                    out = controller.compute(temp_val)
                    if out is None:
                        return

                    hal.set_heater_duty(heater_name, out)
                    with state_lock:
                        state[f"heater_duty_{heater_name}"] = out

                apply_heater(t2, pid_z1, "z1")
                apply_heater(t3, pid_z2, "z2")

        elif mode == "MANUAL":
            # In manual mode, ensure the hardware reflects the state
            # This is redundant if SET_HEATER worked, but adds robustness against resets
            with state_lock:
                d1 = state.get("manual_duty_z1", 0.0)
                d2 = state.get("manual_duty_z2", 0.0)
            hal.set_heater_duty("z1", d1)
            hal.set_heater_duty("z2", d2)
            with state_lock:
                state["heater_duty_z1"] = d1
                state["heater_duty_z2"] = d2

        if now - last_log_time >= log_interval:
            last_log_time = now
            with state_lock:
                snap = dict(state)
            try:
                logger.log(snap, hal)
            except Exception:
                app_logger.exception("Failed to log periodic snapshot")

        time.sleep(0.05)

def start_background_threads():
    """Start the background control thread if it's not already running."""
    global _control_thread
    if _control_thread and _control_thread.is_alive():
        return
    _control_stop.clear()
    _control_thread = threading.Thread(target=control_loop, daemon=True)
    _control_thread.start()

def startup():
    """Initialize the hardware and start background threads."""
    global hal
    if hal is not None:
        return
    hal = HardwareInterface(
        sys_config["pins"],
        sensor_config=sensor_cfg,
        adc_config=sys_config.get("adc"),
        pwm_config=sys_config.get("pwm"),
        running_event=running_event,
    )
    with state_lock:
        # If we have any uncleared alarms from disk, we might want to stay in ALARM
        # But usually startup assumes a clean slate unless the condition persists.
        # We'll default to READY, and let the loop catch persistent alarms.
        if state.get("status") != "ALARM":
            state["status"] = "READY"
            state["seq_start_time"] = 0.0
    start_background_threads()

def shutdown():
    """Shutdown the application and release hardware resources."""
    _control_stop.set()
    if _control_thread:
        _control_thread.join(timeout=2.0)
    if hal:
        try:
            hal.set_heater_duty("z1", 0)
            hal.set_heater_duty("z2", 0)
            hal.set_motor_rpm("main", 0)
            hal.set_motor_rpm("feed", 0)
            hal.set_relay("fan", False)
            hal.set_relay("pump", False)
        except Exception:
            app_logger.exception("Failed to put hardware into safe state during shutdown")
        try:
            hal.shutdown()
        except Exception:
            app_logger.exception("Failed to shutdown hardware cleanly")
    globals()["hal"] = None
    globals()["_control_thread"] = None

atexit.register(shutdown)

@app.route("/api/status", methods=["GET"])
def api_status():
    """Return the current system status and configuration."""
    ok, resp = _ensure_hal_started()
    if not ok:
        return resp
    with state_lock:
        snapshot = dict(state)
    return jsonify({"state": snapshot, "config": sys_config})

@app.route("/api/data", methods=["GET"])
def api_data():
    """Return real-time data (temps, motors, relays)."""
    ok, resp = _ensure_hal_started()
    if not ok:
        return resp
    now = time.time()
    temps = hal.get_temps()
    with state_lock:
        snap = dict(state)
    return jsonify({
        "timestamp": now,
        "temps": temps,
        "motors": snap.get("motors", {}),
        "relays": snap.get("relays", {}),
        "peltier_duty": snap.get("peltier_duty", 0.0),
        "status": snap.get("status", "READY"),
        "mode": snap.get("mode", "AUTO"),
    })

@app.route("/api/log/start", methods=["POST"])
def log_start():
    """Start the data logger."""
    logger.start()
    return jsonify({"success": True})

@app.route("/api/log/stop", methods=["POST"])
def log_stop():
    """Stop the data logger."""
    logger.stop()
    return jsonify({"success": True})

@app.route("/api/history/sensors", methods=["GET"])
def history_sensors():
    """
    Retrieve sensor history from the log file.
    Returns the last 1000 records.
    """
    # Read the logging.csv file and return data
    log_file = "logging.csv"
    if not os.path.exists(log_file):
        return jsonify([])

    try:
        data = []
        # Basic CSV reading - optimization: read only last N lines or by timestamp
        # For now, we'll return the last 1000 lines to avoid payload explosion
        with open(log_file, "r") as f:
            lines = f.readlines()

        header = lines[0].strip().split(",")
        # Skip header, take last 1000
        content_lines = lines[1:][-1000:]

        for line in content_lines:
            parts = line.strip().split(",")
            if len(parts) != len(header):
                continue
            entry = {}
            for i, col in enumerate(header):
                # Try to convert to float/int if possible
                val = parts[i]
                try:
                    if "." in val:
                        entry[col] = float(val)
                    else:
                        entry[col] = int(val)
                except ValueError:
                    entry[col] = val

            # Map CSV columns to the format frontend expects in 'history'
            # Frontend expects: { t, temps: {t1, t2...}, ... }
            # The CSV likely has flattened structure like timestamp, t1, t2, z1_duty, etc.
            # We need to reconstruct the structure or let frontend parse it.
            # However, existing frontend code for history uses specific object structure.
            # Let's map it here to match what App.jsx expects in `setHistory`.

            mapped = {
                "t": int(entry.get("timestamp", 0) * 1000), # JS uses ms
                "temps": {},
                "relays": {},
                "motors": {},
                "pwm": {},
                "status": entry.get("status", "UNKNOWN"),
                "mode": entry.get("mode", "AUTO")
            }

            # Helper to extract potential keys
            for key, val in entry.items():
                if key in ("t1", "t2", "t3", "motor_temp", "motor"): # sensor names
                    if key == "motor": mapped["temps"]["motor"] = val # disambiguate
                    else: mapped["temps"][key] = val
                elif key.startswith("temp_"):
                    mapped["temps"][key.replace("temp_", "")] = val
                elif key in ("fan", "pump", "ssr_z1", "ssr_z2"):
                    mapped["relays"][key] = bool(val)
                elif key.startswith("relay_"):
                    mapped["relays"][key.replace("relay_", "")] = bool(val)
                elif key in ("main_rpm", "feed_rpm"):
                    mapped["motors"][key.replace("_rpm", "")] = val
                elif key.startswith("motor_"):
                    mapped["motors"][key.replace("motor_", "")] = val
                elif key in ("manual_duty_z1", "manual_duty_z2", "target_z1", "target_z2"):
                    mapped[key] = val

            data.append(mapped)

        return jsonify(data)
    except Exception as e:
        app_logger.error(f"Failed to read history: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/gpio", methods=["GET", "POST"])
def gpio_control():
    """
    Get GPIO status or control GPIO pins directly.

    GET: Returns status of all GPIO pins.
    POST: Set GPIO mode or value.
    """
    ok, resp = _ensure_hal_started()
    if not ok:
        return resp

    if request.method == "GET":
        if not hasattr(hal, "get_gpio_status"):
            app_logger.warning("HardwareInterface missing get_gpio_status; returning 501")
            return jsonify({"success": False, "msg": "GPIO_STATUS_UNAVAILABLE"}), 501

        status = hal.get_gpio_status()
        return jsonify({"success": True, "status": status})

    data = request.get_json(force=True) or {}
    cmd = data.get("command")
    req = data.get("value", {})

    try:
        if cmd == "SET_GPIO_MODE":
            pin = int(req.get("pin"))
            mode = req.get("mode")
            pull_up_down = req.get("pull_up_down", "up")
            hal.set_gpio_mode(pin, mode, pull_up_down)
        elif cmd == "SET_GPIO_VALUE":
            pin = int(req.get("pin"))
            value = int(req.get("value"))
            hal.set_gpio_value(pin, value)
    except (ValueError, TypeError):
        API_VALIDATION_ERRORS_TOTAL.inc()
        app_logger.warning("api_validation_failed: INVALID_PIN_OR_VALUE")
        return jsonify({"success": False, "msg": "INVALID_PIN_OR_VALUE"}), 400
    if cmd not in ("SET_GPIO_MODE", "SET_GPIO_VALUE"):
        API_VALIDATION_ERRORS_TOTAL.inc()
        app_logger.warning("api_validation_failed: UNKNOWN_GPIO_COMMAND")
        return jsonify({"success": False, "msg": "UNKNOWN_GPIO_COMMAND"})

    return jsonify({"success": True})

@app.route("/api/control", methods=["POST"])
def control():
    """
    Main control endpoint for sending commands to the system.
    Supports a wide range of commands for motors, heaters, relays, configuration, etc.
    """
    data = request.get_json(force=True) or {}
    cmd = data.get("command")
    req = data.get("value", {})
    request_time = time.time()

    global state, sys_config, alarm_clear_pending

    ok, resp = _ensure_hal_started()
    if not ok:
        return resp

    with state_lock:
        alarm = state["status"] == "ALARM"
        active_alarms = state.get("active_alarms", [])

    is_critical = False
    if alarm:
        is_critical = any(a.get("severity") == "CRITICAL" for a in active_alarms)

    # Always allowed commands regardless of alarm state
    ALWAYS_ALLOWED = (
        "CLEAR_ALARM",
        "EMERGENCY_STOP",
        "ACKNOWLEDGE_ALARM",
        "GPIO_READ",
    )

    # Commands allowed in ALARM state ONLY if the alarm is NOT critical (i.e., Warnings).
    # This whitelist enables the user to:
    # 1. Switch to MANUAL mode (SET_MODE) to bypass certain checks or handle the machine manually.
    # 2. Fix configuration issues (UPDATE_*, SET_*_SETTINGS) that might be causing the alarm.
    # 3. Control non-heater actuators (Relays, Peltier, Motors) if safe/manual.
    # Note: SET_MOTOR and SET_PWM_OUTPUT have their own internal safety checks (temp freshness),
    # so they remain safe to unblock here. SET_HEATER is intentionally excluded to prevent
    # unmonitored heating during an alarm.
    WARNING_ALLOWED = (
        "SET_TARGET",
        "SET_MODE",
        "SET_MOTOR",
        "SET_RELAY",
        "SET_PELTIER",
        "SET_PWM_OUTPUT",
        "MOVE_MOTOR_STEPS",
        "STOP_MANUAL_MOVE",
        "UPDATE_PID",
        "UPDATE_PINS",
        "SET_PIN_NAME",
        "UPDATE_EXTRUDER_SEQ",
        "UPDATE_DM556",
        "SET_TEMP_SETTINGS",
        "SET_LOGGING_SETTINGS",
        "UPDATE_MOTION_CONFIG",
        "SET_SENSOR_CALIBRATION",
        "SAVE_CONFIG",
        "GPIO_CONFIG",
        "GPIO_WRITE",
    )

    if alarm:
        if cmd in ALWAYS_ALLOWED:
            pass
        elif not is_critical and cmd in WARNING_ALLOWED:
            pass
        else:
            API_VALIDATION_ERRORS_TOTAL.inc()
            app_logger.warning("api_validation_failed: ALARM_ACTIVE")
            return jsonify({"success": False, "msg": "ALARM_ACTIVE"})

    if cmd == "SET_MODE":
        mode = req.get("mode")
        if mode not in ("AUTO", "MANUAL"):
            API_VALIDATION_ERRORS_TOTAL.inc()
            app_logger.warning("api_validation_failed: INVALID_MODE")
            return jsonify({"success": False, "msg": "INVALID_MODE"})
        with state_lock:
            state["mode"] = mode

    elif cmd == "SET_TARGET":
        target_z1 = state.get("target_z1")
        target_z2 = state.get("target_z2")

        if "z1" in req:
            t = _coerce_finite(req.get("z1"))
            if t is None:
                API_VALIDATION_ERRORS_TOTAL.inc()
                app_logger.warning("api_validation_failed: INVALID_TARGET (z1)")
                return jsonify({"success": False, "msg": "INVALID_TARGET"}), 400
            target_z1 = t
        if "z2" in req:
            t = _coerce_finite(req.get("z2"))
            if t is None:
                API_VALIDATION_ERRORS_TOTAL.inc()
                app_logger.warning("api_validation_failed: INVALID_TARGET (z2)")
                return jsonify({"success": False, "msg": "INVALID_TARGET"}), 400
            target_z2 = t

        with state_lock:
            if target_z1 is not None:
                state["target_z1"] = target_z1
            if target_z2 is not None:
                state["target_z2"] = target_z2

    elif cmd == "SET_HEATER":
        schema = {
            "zone": {"type": str, "allowed": ["z1", "z2"], "required": True},
            "duty": {"type": float, "min": MIN_HEATER_DUTY, "max": MAX_HEATER_DUTY, "required": True}
        }
        cleaned, errors = _validate_payload(req, schema)
        if errors:
             API_VALIDATION_ERRORS_TOTAL.inc()
             app_logger.warning(f"api_validation_failed: {'; '.join(errors)}")
             return jsonify({"success": False, "msg": "; ".join(errors)}), 400

        zone = cleaned["zone"]
        duty = cleaned["duty"]

        hal.set_heater_duty(zone, duty)
        with state_lock:
            if zone == "z1":
                state["manual_duty_z1"] = duty
                state["heater_duty_z1"] = duty
            else:
                state["manual_duty_z2"] = duty
                state["heater_duty_z2"] = duty

    elif cmd == "SET_MOTOR":
        schema = {
            "motor": {"type": str, "allowed": ["main", "feed"], "required": True},
            "rpm": {"type": float, "min": -MAX_MOTOR_RPM, "max": MAX_MOTOR_RPM, "required": True}
        }
        cleaned, errors = _validate_payload(req, schema)
        if errors:
            API_VALIDATION_ERRORS_TOTAL.inc()
            app_logger.warning(f"api_validation_failed: {'; '.join(errors)}")
            return jsonify({"success": False, "msg": "; ".join(errors)}), 400

        motor = cleaned["motor"]
        rpm = cleaned["rpm"]

        # Debounce to prevent motor toggle spam
        motor_key = f"motor_{motor}"
        last_toggle = relay_toggle_times.get(motor_key, 0.0)
        if request_time - last_toggle < TOGGLE_DEBOUNCE_SEC:
             return jsonify({"success": False, "msg": "MOTOR_DEBOUNCE"}), 429
        relay_toggle_times[motor_key] = request_time

        with state_lock:
            temps = dict(state["temps"])
            temps_timestamp = state.get("temps_timestamp", 0.0)
        if rpm != 0:
            # Check for Manual mode bypass of Cold Extrusion Protection
            is_manual = False
            with state_lock:
                if state.get("mode") == "MANUAL":
                    is_manual = True

            fresh, reason = _temps_fresh(request_time)
            if not fresh:
                return jsonify({"success": False, "msg": reason}), 400

            allowed = True
            reason = "OK"

            # Only enforce Cold Extrusion Protection in AUTO mode
            if not is_manual:
                if request_time - temps_timestamp > 0:
                    allowed, reason = safety.guard_motor_temp(temps)
                else:
                    allowed, reason = False, "TEMP_DATA_STALE"

            if not allowed:
                hal.set_motor_rpm("main", 0)
                hal.set_motor_rpm("feed", 0)
                _latch_alarm(reason)
                with state_lock:
                    state["motors"]["main"] = 0
                    state["motors"]["feed"] = 0
                return jsonify({"success": False, "msg": reason}), 400
        hal.set_motor_rpm(motor, rpm)
        with state_lock:
            state["motors"][motor] = rpm

    elif cmd == "SET_RELAY":
        relay = req.get("relay")
        st = bool(req.get("state", False))
        if relay not in ("fan", "pump"):
            return jsonify({"success": False, "msg": "INVALID_RELAY"})
        last_toggle = relay_toggle_times.get(relay, 0.0)
        if request_time - last_toggle < TOGGLE_DEBOUNCE_SEC:
            return jsonify({"success": False, "msg": "RELAY_DEBOUNCE"}), 429
        with state_lock:
            if state["relays"].get(relay) == st:
                return jsonify({"success": True, "msg": "NO_CHANGE"})
        hal.set_relay(relay, st)
        relay_toggle_times[relay] = request_time
        with state_lock:
            state["relays"][relay] = st

    elif cmd == "SET_PELTIER":
        duty = _coerce_finite(req.get("duty", 0))
        if duty is None or duty < 0.0 or duty > 100.0:
            return jsonify({"success": False, "msg": "INVALID_DUTY"}), 400
        hal.set_peltier_duty(duty)
        with state_lock:
            state["peltier_duty"] = duty

    elif cmd == "SET_PWM_OUTPUT":
        name = req.get("name")
        duty = _coerce_finite(req.get("duty", 0))
        if duty is None:
            return jsonify({"success": False, "msg": "INVALID_DUTY"}), 400
        if duty < 0.0 or duty > MAX_PWM_DUTY:
            return jsonify({"success": False, "msg": "INVALID_DUTY"}), 400
        if name not in getattr(hal, "pwm_channels", {}):
            return jsonify({"success": False, "msg": "INVALID_PWM_CHANNEL"})
        fresh, reason = _temps_fresh(request_time)
        if not fresh:
            return jsonify({"success": False, "msg": reason}), 400
        hal.set_pwm_output(name, duty)
        with state_lock:
            state.setdefault("pwm", {})[name] = max(0.0, min(100.0, float(duty)))

    elif cmd == "MOVE_MOTOR_STEPS":
        motor = req.get("motor")
        try:
            steps = int(req.get("steps", 0))
            speed = int(req.get("speed", 1000))
        except (TypeError, ValueError):
            return jsonify({"success": False, "msg": "INVALID_MOVE_PARAMS"}), 400
        speed = max(1, min(20000, speed))
        if motor not in ("main", "feed"):
            return jsonify({"success": False, "msg": "INVALID_MOTOR"})
        hal.move_motor_steps(motor, steps, speed=speed)

    elif cmd == "STOP_MANUAL_MOVE":
        motor = req.get("motor")
        if motor not in ("main", "feed"):
            return jsonify({"success": False, "msg": "INVALID_MOTOR"})
        hal.stop_manual_move(motor)

    elif cmd == "EMERGENCY_STOP":
        _latch_alarm("EMERGENCY_STOP")

    elif cmd == "CLEAR_ALARM":
        if hal.get_button_state("btn_emergency"):
            return jsonify({"success": False, "msg": "EMERGENCY_BTN_ACTIVE"})
        _all_outputs_off()
        # Instead of clearing everything immediately, we flag that a clear is pending.
        # The control loop will handle the actual clearing and re-checking.
        alarm_clear_pending = True

    elif cmd == "ACKNOWLEDGE_ALARM":
        alarm_id = req.get("alarm_id")
        with state_lock:
            # If alarm_id is "all" or missing, acknowledge all
            if not alarm_id or alarm_id == "all":
                for alarm in state["active_alarms"]:
                    alarm["acknowledged"] = True
                for alarm in state["alarm_history"]:
                    if not alarm.get("acknowledged"):
                        alarm["acknowledged"] = True
            else:
                # Find specific alarm
                found = False
                for alarm in state["active_alarms"]:
                    if alarm["id"] == alarm_id:
                        alarm["acknowledged"] = True
                        found = True
                        break
                # Also update history
                for alarm in state["alarm_history"]:
                    if alarm["id"] == alarm_id:
                        alarm["acknowledged"] = True
                        found = True
                        break

            save_alarms_to_disk(state["alarm_history"])

    elif cmd == "UPDATE_PID":
        zone = req.get("zone")
        params = req.get("params", {})
        if zone not in ("z1", "z2") or not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_ZONE_OR_PARAMS"}), 400

        validation_errors: list[str] = []
        current = sys_config.get(zone, SYSTEM_DEFAULTS[zone])
        # _validate_pid_section now handles non-finite, negative, and >1000 checks
        validated = _validate_pid_section(
            {**current, **params}, zone, validation_errors
        )

        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        target = pid_z1 if zone == "z1" else pid_z2
        target.kp = validated["kp"]
        target.ki = validated["ki"]
        target.kd = validated["kd"]
        sys_config[zone] = validated

    elif cmd == "UPDATE_PINS":
        pins = req.get("pins", {})
        if not isinstance(pins, dict):
            return jsonify({"success": False, "msg": "INVALID_PINS"}), 400

        known_pins = set(SYSTEM_DEFAULTS["pins"].keys())
        unknown_pins = set(pins.keys()) - known_pins
        if unknown_pins:
            app_logger.warning(
                "Ignoring unknown pin names in UPDATE_PINS: %s",
                ", ".join(sorted(unknown_pins)),
            )

        validation_errors: list[str] = []
        current = sys_config.get("pins", SYSTEM_DEFAULTS["pins"])
        sanitized_pins = {k: v for k, v in pins.items() if k in known_pins}
        validated = _validate_pins({**current, **sanitized_pins}, validation_errors)
        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        sys_config["pins"] = validated
        if hal:
            hal.pins = validated

    elif cmd == "SET_PIN_NAME":
        try:
            pin = int(req.get("pin"))
            name = str(req.get("name", "")).strip()
        except (ValueError, TypeError):
            return jsonify({"success": False, "msg": "INVALID_ARGS"}), 400

        current_pins = sys_config.get("pins", SYSTEM_DEFAULTS["pins"]).copy()

        # Remove any existing keys mapping to this pin
        keys_to_remove = [k for k, v in current_pins.items() if v == pin]
        for k in keys_to_remove:
            if k in SYSTEM_DEFAULTS["pins"]:
                current_pins[k] = None
            else:
                del current_pins[k]

        # Add new mapping if name provided
        if name:
            current_pins[name] = pin

        validation_errors: list[str] = []
        validated = _validate_pins(current_pins, validation_errors)
        if validation_errors:
            return jsonify({"success": False, "msg": "; ".join(validation_errors)}), 400

        sys_config["pins"] = validated
        if hal:
            hal.pins = validated

    elif cmd == "UPDATE_EXTRUDER_SEQ":
        seq = req.get("sequence", {})
        if not isinstance(seq, dict):
            return jsonify({"success": False, "msg": "INVALID_SEQUENCE"}), 400
        validation_errors: list[str] = []
        current = sys_config.get("extruder_sequence", SYSTEM_DEFAULTS["extruder_sequence"])
        validated = _validate_extruder_sequence({**current, **seq}, validation_errors)
        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        sys_config["extruder_sequence"] = validated

    elif cmd == "UPDATE_DM556":
        params = req.get("params", {})
        if not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_DM556_PARAMS"}), 400
        validation_errors: list[str] = []
        current = sys_config.get("dm556", SYSTEM_DEFAULTS["dm556"])
        validated = _validate_dm556({**current, **params}, validation_errors)
        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        sys_config["dm556"] = validated

    elif cmd == "SET_TEMP_SETTINGS":
        params = req.get("params", {})
        if not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_TEMP_SETTINGS"}), 400

        validation_errors: list[str] = []
        current = sys_config.get("temp_settings", SYSTEM_DEFAULTS["temp_settings"])
        # _validate_temp_settings now handles ranges and types
        validated = _validate_temp_settings({**current, **params}, validation_errors)

        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        try:
            hal.set_temp_poll_interval(validated["poll_interval"])
            hal.set_temp_average_window(validated["avg_window"])
            hal.set_temp_use_average(validated["use_average"])
            hal.set_temp_decimals_default(validated["decimals_default"])
        except Exception:
            return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"}), 400
        sys_config["temp_settings"] = validated

    elif cmd == "SET_LOGGING_SETTINGS":
        params = req.get("params", {})
        if not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_LOGGING_PARAMS"}), 400

        validation_errors: list[str] = []
        current = sys_config.get("logging", SYSTEM_DEFAULTS["logging"])
        # _validate_logging now handles ranges and types
        validated = _validate_logging({**current, **params}, validation_errors)

        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        sys_config["logging"] = validated
        logger.configure(validated)

    elif cmd == "UPDATE_MOTION_CONFIG":
        params = req.get("params", {})
        if not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_MOTION_PARAMS"}), 400

        validation_errors: list[str] = []
        current = sys_config.get("motion", SYSTEM_DEFAULTS["motion"])
        validated = _validate_motion({**current, **params}, validation_errors)

        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )

        sys_config["motion"] = validated

    elif cmd == "SET_SENSOR_CALIBRATION":
        params = req.get("params", {})
        if not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_SENSOR_PARAMS"}), 400

        try:
            channel = int(params.get("channel"))
        except (TypeError, ValueError):
            return jsonify({"success": False, "msg": "INVALID_SENSOR_CHANNEL"}), 400

        if channel not in getattr(hal, "sensor_config", {}):
            return jsonify({"success": False, "msg": "INVALID_SENSOR_CHANNEL"}), 400

        current_cfg = sys_config.get("sensors", {}).get(channel) or sys_config.get(
            "sensors", {}
        ).get(str(channel))
        if current_cfg is None:
            default_cfg = SYSTEM_DEFAULTS.get("sensors", {}).get(str(channel))
            if default_cfg is None:
                return jsonify({"success": False, "msg": "INVALID_SENSOR_CHANNEL"}), 400
            current_cfg = default_cfg

        merged = {**current_cfg, **{k: v for k, v in params.items() if k != "channel"}}
        validation_errors: list[str] = []
        validated = _validate_sensor_section(
            merged, current_cfg, validation_errors, str(channel)
        )
        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )

        sys_config.setdefault("sensors", {})[channel] = validated

        try:
            hal.update_sensor_calibration(
                channel,
                r_fixed=validated.get("r_fixed"),
                r_25=validated.get("r_25"),
                beta=validated.get("beta"),
                v_ref=validated.get("v_ref"),
                wiring=validated.get("wiring"),
                cal_points=validated.get("cal_points"),
                decimals=validated.get("decimals"),
            )
            hal.sensor_config[channel]["enabled"] = validated.get(
                "enabled", hal.sensor_config[channel].get("enabled")
            )
            hal.sensor_config[channel]["logical"] = validated.get(
                "logical", hal.sensor_config[channel].get("logical")
            )
        except Exception:
            return jsonify({"success": False, "msg": "SENSOR_CALIBRATION_ERROR"}), 400

    elif cmd == "GPIO_CONFIG":
        pin = req.get("pin")
        direction = req.get("direction", "OUT")
        pull = req.get("pull")
        try:
            int_pin = int(pin)
            hal.configure_pin(int_pin, direction=direction, pull=pull)
        except Exception:
            return jsonify({"success": False, "msg": "GPIO_CONFIG_ERROR"})

    elif cmd == "GPIO_WRITE":
        pin = req.get("pin")
        desired = req.get("state", False)
        if isinstance(desired, str):
            desired = desired.lower() in ("1", "true", "on")
        elif isinstance(desired, (int, float)):
            desired = bool(desired)
        elif not isinstance(desired, bool):
            return jsonify({"success": False, "msg": "INVALID_GPIO_STATE"}), 400
        try:
            int_pin = int(pin)
        except (TypeError, ValueError):
            return jsonify({"success": False, "msg": "INVALID_PIN"}), 400

        # Allow control of any pin
        # known_pins check removed

        last_toggle = gpio_write_times.get(int_pin, 0.0)
        if request_time - last_toggle < TOGGLE_DEBOUNCE_SEC:
            return jsonify({"success": False, "msg": "GPIO_DEBOUNCE"}), 429

        try:
            hal.gpio_write(int_pin, bool(desired))
            gpio_write_times[int_pin] = request_time
        except Exception:
            return jsonify({"success": False, "msg": "GPIO_WRITE_ERROR"})

    elif cmd == "GPIO_READ":
        pin = req.get("pin")
        try:
            value = hal.gpio_read(int(pin))
            return jsonify({"success": True, "value": bool(value)})
        except Exception:
            return jsonify({"success": False, "msg": "GPIO_READ_ERROR"})

    elif cmd == "SAVE_CONFIG":
        try:
            with open(CONFIG_FILE, "w") as f:
                json.dump(sys_config, f, indent=4)
        except Exception:
            app_logger.exception("Failed to persist configuration to disk")
            return jsonify({"success": False, "msg": "SAVE_ERROR"})

    else:
        return jsonify({"success": False, "msg": "UNKNOWN_COMMAND"})

    return jsonify({"success": True})

@app.route("/api/tune/start", methods=["POST"])
def tune_start():
    req = request.get_json(force=True) or {}
    zone = req.get("zone")
    setpoint = _coerce_finite(req.get("setpoint", 100.0))

    if zone not in ("z1", "z2"):
        return jsonify({"success": False, "msg": "INVALID_ZONE"}), 400

    auto_tuner.start(zone, setpoint)
    with state_lock:
        state["autotune_status"] = "STARTING"
        state["autotune_result"] = None

    return jsonify({"success": True})

@app.route("/api/tune/stop", methods=["POST"])
def tune_stop():
    auto_tuner.stop()
    with state_lock:
        state["autotune_status"] = "IDLE"
    return jsonify({"success": True})

@app.route("/api/tune/apply", methods=["POST"])
def tune_apply():
    """Apply the calculated PID values to the config."""
    with state_lock:
        res = state.get("autotune_result")

    if not res:
        return jsonify({"success": False, "msg": "NO_RESULT"}), 400

    zone = auto_tuner.zone_name # Last tuned zone
    if not zone:
        return jsonify({"success": False, "msg": "UNKNOWN_ZONE"}), 400

    # Apply to runtime PID
    target_pid = pid_z1 if zone == 'z1' else pid_z2
    target_pid.kp = res['kp']
    target_pid.ki = res['ki']
    target_pid.kd = res['kd']
    target_pid.reset()

    # Save to Config
    sys_config[zone]['kp'] = res['kp']
    sys_config[zone]['ki'] = res['ki']
    sys_config[zone]['kd'] = res['kd']

    # Trigger save to disk
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(sys_config, f, indent=4)
    except Exception:
        app_logger.exception("Failed to save config")

    return jsonify({"success": True})

if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    host = os.getenv("FLASK_RUN_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_RUN_PORT", "5000"))

    eager_start = (
        os.getenv("TVE_EAGER_STARTUP", "false").lower() == "true"
    )

    if eager_start and (not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        startup()
    app_logger.info(
        "Starting Flask app on %s:%s (hardware init %s)",
        host,
        port,
        "eager" if eager_start else "lazy",
    )
    # USE socketio.run INSTEAD OF app.run
    app_logger.info("Starting Hybrid Server (HTTP + WebSocket)")
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
