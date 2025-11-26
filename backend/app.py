# file: backend/app.py
import os
import json
import time
import threading
import copy
import math

from flask import Flask, request, jsonify
import atexit

from backend.hardware import HardwareInterface
from backend.safety import SafetyMonitor
from backend.logger import DataLogger
from backend.pid import PID

CONFIG_FILE = "config.json"

MAX_HEATER_DUTY = 100.0
MIN_HEATER_DUTY = 0.0
MAX_PWM_DUTY = 100.0
MAX_MOTOR_RPM = 5000.0

DEFAULT_CONFIG = {
    "z1": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "z2": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "dm556": {
        "microsteps": 1600,
        "current_peak": 2.7,
        "idle_half": True,
    },
    "pins": {
        "ssr_z1": 17,
        "ssr_z2": 27,
        "ssr_fan": 22,
        "ssr_pump": 23,
        "step_main": 5,
        "dir_main": 6,
        "step_feed": 13,
        "dir_feed": 19,
        "alm_main": 16,
    },
    "pwm": {
        "enabled": True,
        "bus": 1,
        "address": 0x80,
        "frequency": 1000,
        "channels": {
            "fan": 0,
            "fan_nozzle": 1,
            "pump": 2,
            "led_status": 3,
        },
    },
    "sensors": {
        "0": {"enabled": True, "logical": "t1", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "1": {"enabled": True, "logical": "t2", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "2": {"enabled": True, "logical": "t3", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "3": {"enabled": True, "logical": "motor", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
    },
    "adc": {
        "enabled": True,
        "bus": 1,
        "address": 0x48,
        "fsr": 4.096,
    },
    "temp_settings": {
        "poll_interval": 0.25,
        "avg_window": 2.0,
        "use_average": True,
        "decimals_default": 1,
        "freshness_timeout": 1.0,
    },
    "logging": {
        "interval": 0.25,
        "flush_interval": 60.0,
    },
    "extruder_sequence": {
        "start_delay_feed": 2.0,
        "stop_delay_motor": 5.0,
        "check_temp_before_start": True,
    },
}

def _validate_pid_section(section: dict, name: str, errors: list[str]):
    result = copy.deepcopy(DEFAULT_CONFIG[name])
    for param in ("kp", "ki", "kd"):
        if param in section:
            try:
                value = float(section[param])
                if value < 0:
                    raise ValueError("PID parameters must be non-negative")
                result[param] = value
            except (TypeError, ValueError):
                errors.append(f"Invalid {name}.{param}, using default")
    return result


def _validate_dm556(section: dict, errors: list[str]):
    result = copy.deepcopy(DEFAULT_CONFIG["dm556"])
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
    result = copy.deepcopy(DEFAULT_CONFIG["pins"])
    for name, default_pin in result.items():
        if name in section:
            try:
                pin = int(section[name])
                if 0 <= pin <= 40:
                    result[name] = pin
                else:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Invalid pin {name}, using default {default_pin}")
    return result


def _validate_pwm(section: dict, errors: list[str]):
    result = copy.deepcopy(DEFAULT_CONFIG["pwm"])
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


def _validate_sensor_section(section: dict, errors: list[str]):
    result = copy.deepcopy(section)
    try:
        result["enabled"] = bool(section.get("enabled", True))
        result["logical"] = str(section.get("logical", ""))
        result["r_fixed"] = float(section.get("r_fixed", 0))
        result["r_25"] = float(section.get("r_25", 0))
        result["beta"] = float(section.get("beta", 0))
        result["v_ref"] = float(section.get("v_ref", 0))
        result["wiring"] = str(section.get("wiring", ""))
        result["decimals"] = int(section.get("decimals", 1))
        cal_points = section.get("cal_points", [])
        if not isinstance(cal_points, list):
            raise ValueError
        result["cal_points"] = cal_points
    except (TypeError, ValueError):
        errors.append("Invalid sensor configuration detected, using defaults for sensor")
        return None
    return result


def _validate_sensors(section: dict, errors: list[str]):
    result: dict[int, dict] = {}
    for key, cfg in section.items():
        try:
            idx = int(key)
        except (TypeError, ValueError):
            errors.append(f"Invalid sensor key {key}, skipping")
            continue
        validated = _validate_sensor_section(cfg, errors)
        if validated:
            result[idx] = validated
    if not result:
        return copy.deepcopy({int(k): v for k, v in DEFAULT_CONFIG["sensors"].items()})
    return result


def _validate_temp_settings(section: dict, errors: list[str]):
    result = copy.deepcopy(DEFAULT_CONFIG["temp_settings"])
    for key in ("poll_interval", "avg_window"):
        if key in section:
            try:
                value = float(section[key])
                if value > 0:
                    result[key] = value
                else:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Invalid temp_settings.{key}, using default")
    if "use_average" in section:
        result["use_average"] = bool(section.get("use_average", result["use_average"]))
    if "decimals_default" in section:
        try:
            dec = int(section["decimals_default"])
            if dec >= 0:
                result["decimals_default"] = dec
        except (TypeError, ValueError):
            errors.append("Invalid temp_settings.decimals_default, using default")
    return result


def _validate_logging(section: dict, errors: list[str]):
    result = copy.deepcopy(DEFAULT_CONFIG["logging"])
    for key in ("interval", "flush_interval"):
        if key in section:
            try:
                value = float(section[key])
                if value > 0:
                    result[key] = value
                else:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Invalid logging.{key}, using default")
    return result


def _validate_extruder_sequence(section: dict, errors: list[str]):
    result = copy.deepcopy(DEFAULT_CONFIG["extruder_sequence"])
    for key in ("start_delay_feed", "stop_delay_motor"):
        if key in section:
            try:
                value = float(section[key])
                if value >= 0:
                    result[key] = value
                else:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Invalid extruder_sequence.{key}, using default")
    if "check_temp_before_start" in section:
        result["check_temp_before_start"] = bool(
            section.get("check_temp_before_start", result["check_temp_before_start"])
        )
    return result


def validate_config(raw_cfg: dict):
    errors: list[str] = []
    cfg = copy.deepcopy(DEFAULT_CONFIG)

    cfg["z1"] = _validate_pid_section(raw_cfg.get("z1", {}), "z1", errors)
    cfg["z2"] = _validate_pid_section(raw_cfg.get("z2", {}), "z2", errors)
    cfg["dm556"] = _validate_dm556(raw_cfg.get("dm556", {}), errors)
    cfg["pins"] = _validate_pins(raw_cfg.get("pins", {}), errors)
    cfg["pwm"] = _validate_pwm(raw_cfg.get("pwm", {}), errors)
    cfg["sensors"] = _validate_sensors(raw_cfg.get("sensors", {}), errors)
    cfg["adc"] = copy.deepcopy(DEFAULT_CONFIG["adc"])
    if "adc" in raw_cfg:
        try:
            result = copy.deepcopy(DEFAULT_CONFIG["adc"])
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
    cfg["extruder_sequence"] = _validate_extruder_sequence(
        raw_cfg.get("extruder_sequence", {}), errors
    )

    if errors:
        for err in errors:
            print(f"CONFIG_WARNING: {err}")

    return cfg


def load_config():
    raw_cfg: dict = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                raw_cfg = json.load(f)
        except Exception:
            raw_cfg = {}

    if not isinstance(raw_cfg, dict):
        raw_cfg = {}

    return validate_config(raw_cfg)


def _coerce_finite(value):
    try:
        coerced = float(value)
    except (TypeError, ValueError):
        return None
    return coerced if math.isfinite(coerced) else None

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

state = {
    "status": "READY",
    "mode": "AUTO",
    "alarm_msg": "",
    "target_z1": 0.0,
    "target_z2": 0.0,
    "manual_duty_z1": 0.0,
    "manual_duty_z2": 0.0,
    "temps": {},
    "temps_timestamp": 0.0,
    "motors": {"main": 0.0, "feed": 0.0},
    "relays": {"fan": False, "pump": False},
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


def _safe_float(val: object) -> float | None:
    try:
        num = float(val)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num):
        return None
    return num


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _temps_fresh(now: float) -> tuple[bool, str | None]:
    poll_interval = float(sys_config.get("temp_settings", {}).get("poll_interval", 0.25))
    allowed_age = max(1.0, poll_interval * 4)
    with state_lock:
        ts = state.get("temps_timestamp", 0.0)
    if ts <= 0 or now - ts > allowed_age:
        return False, "TEMP_DATA_STALE"
    return True, None

def _all_outputs_off():
    hal.set_heater_duty("z1", 0.0)
    hal.set_heater_duty("z2", 0.0)
    hal.set_motor_rpm("main", 0.0)
    hal.set_motor_rpm("feed", 0.0)
    hal.set_relay("fan", False)
    hal.set_relay("pump", False)
    for name in getattr(hal, "pwm_channels", {}):
        hal.set_pwm_output(name, 0.0)
    with state_lock:
        state["motors"]["main"] = 0.0
        state["motors"]["feed"] = 0.0
        state["relays"]["fan"] = False
        state["relays"]["pump"] = False
        for name in state.get("pwm", {}):
            state["pwm"][name] = 0.0

def _set_status(new_status: str):
    with state_lock:
        state["status"] = new_status
        state["seq_start_time"] = time.time()


def _latch_alarm(reason: str):
    global last_btn_start_state

    running_event.clear()
    _all_outputs_off()
    last_btn_start_state = False
    with state_lock:
        state["status"] = "ALARM"
        state["alarm_msg"] = reason

def _ensure_hal_started():
    if hal is None:
        return False, (jsonify({"success": False, "msg": "HAL_NOT_INITIALIZED"}), 503)
    return True, None

last_btn_start_state = False

def control_loop():
    global last_btn_start_state, alarm_clear_pending

    last_poll_time = 0
    last_log_time = 0
    temps = {}

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
            with state_lock:
                state["status"] = "READY"
                state["alarm_msg"] = ""
            alarm_clear_pending = False
            time.sleep(0.05)
            continue

        btn_start = hal.get_button_state("btn_start")
        start_event = btn_start and not last_btn_start_state
        last_btn_start_state = btn_start
        should_poll = (now - last_poll_time) >= poll_interval or start_event
        if should_poll:
            last_poll_time = now
            temps = hal.get_temps()

            with state_lock:
                state["temps"] = temps
                state["temps_timestamp"] = now
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

        if (
            running_event.is_set()
            and not alarm_req
            and start_event
            and status in ("READY", "RUNNING")
        ):
            seq = sys_config.get("extruder_sequence", {})
            temps_for_start = temps if temps else hal.get_temps()
            with state_lock:
                state["temps"] = temps_for_start
            if status == "READY":
                if seq.get("check_temp_before_start", True):
                    allowed, reason = safety.guard_motor_temp(temps_for_start)
                    if allowed:
                        _set_status("STARTING")
                    else:
                        alarm_req = reason
                else:
                    _set_status("STARTING")
        else:
            _set_status("STOPPING")

        if alarm_req:
            _latch_alarm(alarm_req)

        with state_lock:
            status = state["status"]
            mode = state["mode"]
            target_z1 = state["target_z1"]
            target_z2 = state["target_z2"]
            temps = dict(state.get("temps", {}))
            temps_timestamp = state.get("temps_timestamp", 0.0)

        now = time.time()

        if not running_event.is_set() and status != "ALARM":
            with state_lock:
                state["status"] = "ALARM"
                status = "ALARM"

        if status == "ALARM" or not running_event.is_set():
            led = (int(now * 10) % 2) == 0
            hal.set_led_state("led_status", led)
            with state_lock:
                snapshot = dict(state)
            try:
                logger.log(snapshot, hal)
            except:
                pass
            time.sleep(0.05)
            continue

        if status == "RUNNING":
            led = True
        elif status in ("STARTING", "STOPPING"):
            led = (int(now * 2) % 2) == 0
        else:
            led = False
        hal.set_led_state("led_status", led)

        seq = sys_config.get("extruder_sequence", {})
        with state_lock:
            seq_start_time = state.get("seq_start_time", 0.0)
            motors_snapshot = dict(state.get("motors", {}))
        if status in ("STARTING", "STOPPING") and not seq_start_time:
            _set_status(status)
            with state_lock:
                seq_start_time = state.get("seq_start_time", now)
                motors_snapshot = dict(state.get("motors", {}))
        elapsed = now - (seq_start_time or now)
        max_start_time = seq.get("start_delay_feed", 2.0) + 1.0
        max_stop_time = seq.get("stop_delay_motor", 5.0) + 1.0

        if status == "STARTING":
            main_rpm = motors_snapshot.get("main", 0.0) or 10.0
            hal.set_motor_rpm("main", main_rpm)

            if elapsed >= seq.get("start_delay_feed", 2.0) or elapsed >= max_start_time:
                feed_rpm = motors_snapshot.get("feed", 0.0) or 10.0
                hal.set_motor_rpm("feed", feed_rpm)
                with state_lock:
                    state["motors"]["main"] = main_rpm
                    state["motors"]["feed"] = feed_rpm
                    state["status"] = "RUNNING"

        elif status == "STOPPING":
            hal.set_motor_rpm("feed", 0.0)
            if elapsed >= seq.get("stop_delay_motor", 5.0) or elapsed >= max_stop_time:
                hal.set_motor_rpm("main", 0.0)
                with state_lock:
                    state["motors"]["main"] = 0.0
                    state["motors"]["feed"] = 0.0
                    state["status"] = "READY"

        if mode == "AUTO":
            t2 = temps.get("t2")
            t3 = temps.get("t3")

            pid_z1.setpoint = target_z1
            pid_z2.setpoint = target_z2

            freshness_timeout = float(temp_settings.get("freshness_timeout", poll_interval * 4))
            temps_age = now - temps_timestamp if temps_timestamp else float("inf")
            temps_fresh = temps_timestamp and temps_age <= freshness_timeout

            def apply_heater(temp_val, controller, heater_name):
                if not temps_fresh or temp_val is None:
                    controller.reset()
                    hal.set_heater_duty(heater_name, 0.0)
                    return

                out = controller.compute(temp_val)
                if out is None:
                    return

                hal.set_heater_duty(heater_name, out)

            apply_heater(t2, pid_z1, "z1")
            apply_heater(t3, pid_z2, "z2")

        if now - last_log_time >= log_interval:
            last_log_time = now
            with state_lock:
                snap = dict(state)
            try:
                logger.log(snap, hal)
            except:
                pass

        time.sleep(0.05)

def start_background_threads():
    global _control_thread
    if _control_thread and _control_thread.is_alive():
        return
    _control_stop.clear()
    _control_thread = threading.Thread(target=control_loop, daemon=True)
    _control_thread.start()

def startup():
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
        if state.get("status") != "ALARM":
            state["status"] = "READY"
            state["alarm_msg"] = ""
            state["seq_start_time"] = 0.0
    start_background_threads()

def shutdown():
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
        except:
            pass
        try:
            hal.shutdown()
        except:
            pass
    globals()["hal"] = None
    globals()["_control_thread"] = None

atexit.register(shutdown)

@app.route("/api/status", methods=["GET"])
def api_status():
    ok, resp = _ensure_hal_started()
    if not ok:
        return resp
    with state_lock:
        snapshot = dict(state)
    return jsonify({"state": snapshot, "config": sys_config})

@app.route("/api/data", methods=["GET"])
def api_data():
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
        "status": snap.get("status", "READY"),
        "mode": snap.get("mode", "AUTO"),
    })

@app.route("/api/log/start", methods=["POST"])
def log_start():
    logger.start()
    return jsonify({"success": True})

@app.route("/api/log/stop", methods=["POST"])
def log_stop():
    logger.stop()
    return jsonify({"success": True})

@app.route("/api/gpio", methods=["GET", "POST"])
def gpio_control():
    ok, resp = _ensure_hal_started()
    if not ok:
        return resp

    if request.method == "GET":
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
        return jsonify({"success": False, "msg": "INVALID_PIN_OR_VALUE"}), 400
    if cmd not in ("SET_GPIO_MODE", "SET_GPIO_VALUE"):
        return jsonify({"success": False, "msg": "UNKNOWN_GPIO_COMMAND"})

    return jsonify({"success": True})

@app.route("/api/control", methods=["POST"])
def control():
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

    if alarm and cmd not in ("CLEAR_ALARM", "EMERGENCY_STOP"):
        return jsonify({"success": False, "msg": "ALARM_ACTIVE"})

    if cmd == "SET_MODE":
        mode = req.get("mode")
        if mode not in ("AUTO", "MANUAL"):
            return jsonify({"success": False, "msg": "INVALID_MODE"})
        with state_lock:
            state["mode"] = mode

    elif cmd == "SET_TARGET":
        target_z1 = state.get("target_z1")
        target_z2 = state.get("target_z2")

        if "z1" in req:
            t = _coerce_finite(req.get("z1"))
            if t is None:
                return jsonify({"success": False, "msg": "INVALID_TARGET"}), 400
            target_z1 = t
        if "z2" in req:
            t = _coerce_finite(req.get("z2"))
            if t is None:
                return jsonify({"success": False, "msg": "INVALID_TARGET"}), 400
            target_z2 = t

        with state_lock:
            if target_z1 is not None:
                state["target_z1"] = target_z1
            if target_z2 is not None:
                state["target_z2"] = target_z2

    elif cmd == "SET_HEATER":
        zone = req.get("zone")
        duty = _coerce_finite(req.get("duty", 0))
        if zone not in ("z1", "z2"):
            return jsonify({"success": False, "msg": "INVALID_ZONE"})
        if duty is None or duty < MIN_HEATER_DUTY or duty > MAX_HEATER_DUTY:
            return jsonify({"success": False, "msg": "INVALID_DUTY"}), 400
        hal.set_heater_duty(zone, duty)
        with state_lock:
            if zone == "z1":
                state["manual_duty_z1"] = duty
            else:
                state["manual_duty_z2"] = duty

    elif cmd == "SET_MOTOR":
        motor = req.get("motor")
        rpm = _safe_float(req.get("rpm", 0))
        if rpm is None:
            return jsonify({"success": False, "msg": "INVALID_RPM"}), 400
        rpm = _clamp(rpm, -5000.0, 5000.0)
        if motor not in ("main", "feed"):
            return jsonify({"success": False, "msg": "INVALID_MOTOR"})
        if rpm is None or abs(rpm) > MAX_MOTOR_RPM:
            return jsonify({"success": False, "msg": "INVALID_RPM"}), 400
        with state_lock:
            temps = dict(state["temps"])
            temps_timestamp = state.get("temps_timestamp", 0.0)
        if rpm != 0:
            fresh, reason = _temps_fresh(request_time)
            if not fresh:
                return jsonify({"success": False, "msg": reason}), 400
            if request_time - temps_timestamp > 0:
                allowed, reason = safety.guard_motor_temp(temps)
            else:
                allowed, reason = False, "TEMP_DATA_STALE"
            if not allowed:
                hal.set_motor_rpm("main", 0)
                hal.set_motor_rpm("feed", 0)
                with state_lock:
                    state["status"] = "ALARM"
                    state["alarm_msg"] = reason
                    state["motors"]["main"] = 0
                    state["motors"]["feed"] = 0
                return jsonify({"success": False, "msg": reason})
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

    elif cmd == "SET_PWM_OUTPUT":
        name = req.get("name")
        duty = _safe_float(req.get("duty", 0))
        if duty is None:
            return jsonify({"success": False, "msg": "INVALID_DUTY"}), 400
        duty = _clamp(duty, 0.0, 100.0)
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
        with state_lock:
            state["status"] = "READY"
            state["alarm_msg"] = ""
        safety.reset()
        running_event.clear()
        alarm_clear_pending = True

    elif cmd == "UPDATE_PID":
        zone = req.get("zone")
        params = req.get("params", {})
        if zone not in ("z1", "z2"):
            return jsonify({"success": False, "msg": "INVALID_ZONE"})
        kp = _coerce_finite(params.get("kp", params.get("p")))
        ki = _coerce_finite(params.get("ki", params.get("i")))
        kd = _coerce_finite(params.get("kd", params.get("d")))
        for val in (kp, ki, kd):
            if val is not None and val < 0:
                return jsonify({"success": False, "msg": "INVALID_PID"}), 400
        target = pid_z1 if zone == "z1" else pid_z2
        for key in ("kp", "ki", "kd"):
            if key in params:
                val = _safe_float(params.get(key))
                if val is None or val < 0:
                    return jsonify({"success": False, "msg": "INVALID_PID_PARAM"}), 400
                setattr(target, key, val)
        sys_config[zone] = {"kp": target.kp, "ki": target.ki, "kd": target.kd}

    elif cmd == "UPDATE_PINS":
        pins = req.get("pins", {})
        if not isinstance(pins, dict):
            return jsonify({"success": False, "msg": "INVALID_PINS"}), 400
        validation_errors: list[str] = []
        current = sys_config.get("pins", DEFAULT_CONFIG["pins"])
        validated = _validate_pins({**current, **pins}, validation_errors)
        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        sys_config["pins"] = validated

    elif cmd == "UPDATE_EXTRUDER_SEQ":
        seq = req.get("sequence", {})
        sanitized_seq = {}
        for key in ("start_delay_feed", "stop_delay_motor"):
            if key in seq:
                val = _coerce_finite(seq.get(key))
                if val is None or val < 0:
                    return jsonify({"success": False, "msg": "INVALID_SEQUENCE"}), 400
                sanitized_seq[key] = val
        sys_config["extruder_sequence"].update(sanitized_seq)

    elif cmd == "UPDATE_DM556":
        params = req.get("params", {})
        if not isinstance(params, dict):
            return jsonify({"success": False, "msg": "INVALID_DM556_PARAMS"}), 400
        validation_errors: list[str] = []
        current = sys_config.get("dm556", DEFAULT_CONFIG["dm556"])
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
        current = sys_config.get("temp_settings", DEFAULT_CONFIG["temp_settings"])
        validated = _validate_temp_settings({**current, **params}, validation_errors)
        if validation_errors:
            return (
                jsonify({"success": False, "msg": "; ".join(validation_errors)}),
                400,
            )
        try:
            if "poll_interval" in params:
                poll_interval = _coerce_finite(params.get("poll_interval"))
                if poll_interval is None or poll_interval <= 0:
                    return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"}), 400
                hal.set_temp_poll_interval(poll_interval)
            if "avg_window" in params:
                avg_window = _coerce_finite(params.get("avg_window"))
                if avg_window is None or avg_window <= 0:
                    return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"}), 400
                hal.set_temp_average_window(avg_window)
            if "use_average" in params:
                hal.set_temp_use_average(bool(params["use_average"]))
            if "decimals_default" in params:
                decimals_default = params.get("decimals_default")
                try:
                    decimals_default = int(decimals_default)
                except (TypeError, ValueError):
                    return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"}), 400
                if decimals_default < 0:
                    return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"}), 400
                hal.set_temp_decimals_default(decimals_default)
        except:
            return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"})
        sys_config["temp_settings"] = {
            "poll_interval": hal.temp_poll_interval,
            "avg_window": hal.temp_avg_window,
            "use_average": hal.temp_use_average,
            "decimals_default": hal.temp_decimals_default,
        }

    elif cmd == "SET_LOGGING_SETTINGS":
        params = req.get("params", {})
        if "interval" in params:
            interval = _coerce_finite(params.get("interval"))
            if interval is None or interval <= 0:
                return jsonify({"success": False, "msg": "INVALID_LOG_INTERVAL"}), 400
            sys_config["logging"]["interval"] = interval
        if "flush_interval" in params:
            flush_interval = _coerce_finite(params.get("flush_interval"))
            if flush_interval is None or flush_interval <= 0:
                return jsonify({"success": False, "msg": "INVALID_LOG_INTERVAL"}), 400
            sys_config["logging"]["flush_interval"] = flush_interval
        logger.configure(sys_config["logging"])

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

        known_pins = {v for v in hal.pins.values() if v is not None}
        known_pins.update(getattr(hal, "pin_modes", {}).keys())
        if int_pin not in known_pins:
            return jsonify({"success": False, "msg": "UNKNOWN_PIN"}), 400

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
        except:
            return jsonify({"success": False, "msg": "SAVE_ERROR"})

    else:
        return jsonify({"success": False, "msg": "UNKNOWN_COMMAND"})

    return jsonify({"success": True})

if __name__ == "__main__":
    debug = True
    if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        startup()
    app.run(host="0.0.0.0", port=5000, debug=debug)
