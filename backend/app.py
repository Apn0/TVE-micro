# file: backend/app.py
import os
import json
import time
import threading
import copy

from flask import Flask, request, jsonify

import atexit
from hardware import HardwareInterface
from safety import SafetyMonitor
from logger import DataLogger
from pid import PID

CONFIG_FILE = "config.json"

DEFAULT_CONFIG = {
    "z1": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "z2": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "dm556": {
        "microsteps": 1600,  # SW5-SW8
        "current_peak": 2.7, # SW1-SW3 (Ampères)
        "idle_half": True,   # SW4 (half current at rest)
    },
    "pins": {
        # Default BCM pins – can be changed via config/UI
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
    # ADS1115 / NTC sensor config (keys as strings for JSON)
    "sensors": {
        "0": {"enabled": True,  "logical": "t1",    "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "1": {"enabled": True,  "logical": "t2",    "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "2": {"enabled": True,  "logical": "t3",    "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "3": {"enabled": True,  "logical": "motor", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
    },
    # ADS1115 global config
    "adc": {
        "enabled": True,
        "bus": 1,
        "address": 0x48,
        "fsr": 4.096,
    },
    # Temperature loop tuning (ADS / averaging)
    "temp_settings": {
        "poll_interval": 0.25,
        "avg_window": 2.0,
        "use_average": True,
        "decimals_default": 1,
    },
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                cfg = json.load(f)
        except Exception:
            cfg = copy.deepcopy(DEFAULT_CONFIG)
    else:
        cfg = copy.deepcopy(DEFAULT_CONFIG)

    # Ensure new keys exist
    if "z1" not in cfg:
        cfg["z1"] = copy.deepcopy(DEFAULT_CONFIG["z1"])
    if "z2" not in cfg:
        cfg["z2"] = copy.deepcopy(DEFAULT_CONFIG["z2"])
    if "dm556" not in cfg:
        cfg["dm556"] = copy.deepcopy(DEFAULT_CONFIG["dm556"])
    if "pins" not in cfg:
        cfg["pins"] = copy.deepcopy(DEFAULT_CONFIG["pins"])
    if "sensors" not in cfg:
        cfg["sensors"] = copy.deepcopy(DEFAULT_CONFIG["sensors"])
    if "adc" not in cfg:
        cfg["adc"] = copy.deepcopy(DEFAULT_CONFIG["adc"])
    if "temp_settings" not in cfg:
        cfg["temp_settings"] = copy.deepcopy(DEFAULT_CONFIG["temp_settings"])
    if "extruder_sequence" not in cfg:
        cfg["extruder_sequence"] = {
            "start_delay_feed": 2.0,
            "stop_delay_motor": 5.0,
            "check_temp_before_start": True
        }
    return cfg

sys_config = load_config()

# sensor_config expects int keys for channels
sensor_cfg = {int(k): v for k, v in sys_config.get("sensors", {}).items()}

running_event = threading.Event()
running_event.set()

hal = HardwareInterface(
    sys_config["pins"],
    sensor_config=sensor_cfg,
    adc_config=sys_config.get("adc"),
    running_event=running_event,
)
hal: HardwareInterface | None = None

safety = SafetyMonitor()
logger = DataLogger()
# logger.start()  # REMOVED: Do not auto-start logging

pid_z1 = PID(**sys_config["z1"], output_limits=(0, 100))
pid_z2 = PID(**sys_config["z2"], output_limits=(0, 100))

# English status names
state = {
    "status": "READY",   # READY / ALARM / STARTING / RUNNING / STOPPING
    "mode": "AUTO",      # or "MANUAL"
    "alarm_msg": "",
    "target_z1": 0.0,
    "target_z2": 0.0,
    "manual_duty_z1": 0.0,
    "manual_duty_z2": 0.0,
    "temps": {},
    "motors": {"main": 0.0, "feed": 0.0},
    "relays": {"fan": False, "pump": False},
    "seq_start_time": 0.0, # Track sequence timing
}

state_lock = threading.Lock()
_control_thread: threading.Thread | None = None
_control_stop = threading.Event()

app = Flask(__name__)


def _all_outputs_off():
    """Cut all outputs and mirror the off state in shared state."""
    hal.set_heater_duty("z1", 0.0)
    hal.set_heater_duty("z2", 0.0)
    hal.set_motor_rpm("main", 0.0)
    hal.set_motor_rpm("feed", 0.0)
    hal.set_relay("fan", False)
    hal.set_relay("pump", False)

    with state_lock:
        state["motors"]["main"] = 0.0
        state["motors"]["feed"] = 0.0
        state["relays"]["fan"] = False
        state["relays"]["pump"] = False


def _latch_alarm(reason: str):
    """Latch an alarm, stop control flow, and ensure outputs are off."""
    running_event.clear()
    _all_outputs_off()
    with state_lock:
        state["status"] = "ALARM"
        state["alarm_msg"] = reason

def _ensure_hal_started():
    if hal is None:
        return False, (jsonify({"success": False, "msg": "HAL_NOT_INITIALIZED"}), 503)
    return True, None

# Track button state for rising edge detection
last_btn_start_state = False

def control_loop():
    """Background loop to keep temps fresh and optionally log."""
    poll_interval = sys_config.get("temp_settings", {}).get("poll_interval", 0.25)
    global last_btn_start_state

    while not _control_stop.is_set():
        if hal is None:
            _control_stop.wait(poll_interval)
            continue

        temps = hal.get_temps()
        alarm_to_latch = None

        # --- Handle Physical Inputs (Buttons) ---
        # Emergency Stop (Active High or Low? HAL says Pull-UP, Active Low)
        # But get_button_state returns True if Pressed.
        if hal.get_button_state("btn_emergency"):
             alarm_to_latch = "EMERGENCY_STOP_BTN"

        # Start Button (Rising Edge)
        btn_start_pressed = hal.get_button_state("btn_start")
        start_btn_event = btn_start_pressed and not last_btn_start_state
        last_btn_start_state = btn_start_pressed

        # Update shared state
        with state_lock:
            state["temps"] = temps

            if running_event.is_set():
                is_safe, reason = safety.check(state, hal)
                if not is_safe and state["status"] != "ALARM":
                    alarm_to_latch = reason

            alarm_active = state["status"] == "ALARM"
            status = state.get("status")
            mode = state.get("mode")
            target_z1 = state.get("target_z1", 0.0)
            target_z2 = state.get("target_z2", 0.0)

            # Button Logic
            if start_btn_event:
                if status == "READY":
                    # Check temps if configured
                    seq_cfg = sys_config.get("extruder_sequence", {})
                    if seq_cfg.get("check_temp_before_start", True):
                        # Simple check: are we within X degrees of target?
                        # TODO: Make tolerance configurable. Assuming 10C for now or relying on Safety check.
                        # Safety check `guard_motor_temp` is strict.
                        allowed, reason = safety.guard_motor_temp(temps)
                        if allowed:
                            state["status"] = "STARTING"
                            state["seq_start_time"] = time.time()
                        else:
                            print(f"[CTRL] Cannot start: {reason}")
                    else:
                        state["status"] = "STARTING"
                        state["seq_start_time"] = time.time()

                elif status == "RUNNING":
                    state["status"] = "STOPPING"
                    state["seq_start_time"] = time.time()

        if alarm_to_latch:
            _latch_alarm(alarm_to_latch)
            alarm_active = True

        # --- LED Indication ---
        # READY: Off (or maybe solid Green if we had RGB, but we have 1 LED) -> Off or On?
        # Prompt: "show if extruder is off/starting-stopping/on"
        # OFF (READY): Off
        # ON (RUNNING): On
        # STARTING/STOPPING: Blink
        # ALARM: Fast Blink

        led_val = False
        now = time.time()
        if alarm_active:
            # Fast Blink 5Hz
            led_val = (int(now * 10) % 2) == 0
        elif status == "RUNNING":
            led_val = True
        elif status in ("STARTING", "STOPPING"):
            # Blink 1Hz
            led_val = (int(now * 2) % 2) == 0
        else: # READY
            led_val = False

        hal.set_led_state("led_status", led_val)

        if alarm_active or not running_event.is_set():
            _all_outputs_off()
            # If emergency button is still pressed, ensure we stay in alarm?
            # _latch_alarm sets running_event cleared.
            # To clear alarm, user must use UI.
            # BUT: if physical button is still pressed, we should re-latch if UI tries to clear.
            # This is handled in the API cmd "CLEAR_ALARM" -> we should check button there.

            with state_lock:
                snapshot_state = dict(state)
            try:
                logger.log(snapshot_state, hal)
            except Exception:
                pass
            time.sleep(poll_interval)
            continue

        # --- SEQUENCE LOGIC ---
        seq_cfg = sys_config.get("extruder_sequence", {})

        if status == "STARTING":
            # Start Sequence
            # 1. Start Main Motor immediately (if safe)
            # 2. Wait X sec
            # 3. Start Feed Motor
            # 4. Go to RUNNING

            # Ensure Main Motor is ON
            # Target RPM? Configurable? For now use a default or last set?
            # Let's use a "default_run_rpm" or just 10% if 0?
            # Or assume user sets speed first?
            # The prompt implies a simple "Start" button. Usually there is a potentiometer or preset speed.
            # I will assume a default low speed if current target is 0, or just use current target if non-zero?
            # Safety: don't start if target is 0?
            # Let's hardcode a safe low speed for "Button Start" if currently 0: e.g. 10 RPM.

            target_main = state["motors"].get("main", 0.0)
            if target_main == 0:
                target_main = 10.0 # Default start speed
                with state_lock:
                    state["motors"]["main"] = target_main

            hal.set_motor_rpm("main", target_main)

            # Check Delay
            elapsed = now - state.get("seq_start_time", now)
            delay_feed = seq_cfg.get("start_delay_feed", 2.0)

            if elapsed >= delay_feed:
                # Start Feeder
                target_feed = state["motors"].get("feed", 0.0)
                if target_feed == 0:
                     target_feed = 10.0
                     with state_lock:
                         state["motors"]["feed"] = target_feed
                hal.set_motor_rpm("feed", target_feed)

                with state_lock:
                    state["status"] = "RUNNING"

        elif status == "STOPPING":
            # Stop Sequence
            # 1. Stop Feeder
            # 2. Wait Y sec
            # 3. Stop Main Motor
            # 4. Go to READY

            hal.set_motor_rpm("feed", 0.0)
            with state_lock:
                state["motors"]["feed"] = 0.0

            elapsed = now - state.get("seq_start_time", now)
            delay_stop = seq_cfg.get("stop_delay_motor", 5.0)

            if elapsed >= delay_stop:
                hal.set_motor_rpm("main", 0.0)
                with state_lock:
                    state["motors"]["main"] = 0.0
                    state["status"] = "READY"

        elif status == "RUNNING":
             # Ensure motors are running at target?
             # (They are set in API, but good to reinforce or just let API handle changes)
             pass

        # --- CONTROL LOGIC (Temp) ---
        if mode == "AUTO":
            # PID Control

            # Zone 1 (Assuming T2 is for Z1)
            pid_z1.setpoint = target_z1
            val_z1 = temps.get("t2")
            if val_z1 is not None:
                out_z1 = pid_z1.compute(val_z1)
                if out_z1 is not None:
                    hal.set_heater_duty("z1", out_z1)
            else:
                # Failsafe: if sensor missing, cut power
                hal.set_heater_duty("z1", 0.0)

            # Zone 2 (Assuming T3 is for Z2)
            pid_z2.setpoint = target_z2
            val_z2 = temps.get("t3")
            if val_z2 is not None:
                out_z2 = pid_z2.compute(val_z2)
                if out_z2 is not None:
                    hal.set_heater_duty("z2", out_z2)
            else:
                # Failsafe: if sensor missing, cut power
                hal.set_heater_duty("z2", 0.0)

        with state_lock:
            snapshot_state = dict(state)

        # Logging with correct signature: DataLogger.log(state, hal)
        try:
            logger.log(snapshot_state, hal)
        except Exception:
            # Ignore logging errors so the control loop keeps running
            pass

        _control_stop.wait(poll_interval)

        # --- CONTROL LOGIC ---
        if mode == "AUTO":
            # PID Control

            # Zone 1 (Assuming T2 is for Z1)
            pid_z1.setpoint = target_z1
            val_z1 = temps.get("t2")
            if val_z1 is not None:
                out_z1 = pid_z1.compute(val_z1)
                if out_z1 is not None:
                    hal.set_heater_duty("z1", out_z1)
            else:
                # Failsafe: if sensor missing, cut power
                hal.set_heater_duty("z1", 0.0)

            # Zone 2 (Assuming T3 is for Z2)
            pid_z2.setpoint = target_z2
            val_z2 = temps.get("t3")
            if val_z2 is not None:
                out_z2 = pid_z2.compute(val_z2)
                if out_z2 is not None:
                    hal.set_heater_duty("z2", out_z2)
            else:
                # Failsafe: if sensor missing, cut power
                hal.set_heater_duty("z2", 0.0)

        with state_lock:
            snapshot_state = dict(state)

        # Logging with correct signature: DataLogger.log(state, hal)
        try:
            logger.log(snapshot_state, hal)
        except Exception:
            # Ignore logging errors so the control loop keeps running
            pass

        _control_stop.wait(poll_interval)

def start_background_threads():
    global _control_thread
    if _control_thread is not None and _control_thread.is_alive():
        return
    _control_stop.clear()
    _control_thread = threading.Thread(target=control_loop, daemon=True)
    _control_thread.start()


def startup():
    global hal
    if hal is not None:
        return

    hal_instance = HardwareInterface(
        sys_config["pins"],
        sensor_config=sensor_cfg,
        adc_config=sys_config.get("adc"),
    )
    hal = hal_instance
    start_background_threads()


def shutdown():
    _control_stop.set()
    if _control_thread is not None:
        _control_thread.join(timeout=2.0)

    if hal is not None:
        try:
            hal.set_heater_duty("z1", 0.0)
            hal.set_heater_duty("z2", 0.0)
            hal.set_motor_rpm("main", 0.0)
            hal.set_motor_rpm("feed", 0.0)
            hal.set_relay("fan", False)
            hal.set_relay("pump", False)
        except Exception:
            pass
        try:
            hal.shutdown()
        except Exception:
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
        snapshot_state = dict(state)
    return jsonify({
        "state": snapshot_state,
        "config": sys_config,
    })

@app.route("/api/data", methods=["GET"])
def api_data():
    """
    Backward-compatible endpoint for charts/history.
    For now it returns a single snapshot; frontend stops getting 404.
    Extend later to return full history from DataLogger if needed.
    """
    ok, resp = _ensure_hal_started()
    if not ok:
        return resp
    now = time.time()
    temps = hal.get_temps()
    with state_lock:
        snapshot_state = dict(state)

    return jsonify({
        "timestamp": now,
        "temps": temps,
        "motors": snapshot_state.get("motors", {}),
        "relays": snapshot_state.get("relays", {}),
        "status": snapshot_state.get("status", "READY"),
        "mode": snapshot_state.get("mode", "AUTO"),
    })

@app.route("/api/log/start", methods=["POST"])
def log_start():
    logger.start()
    return jsonify({"success": True})

@app.route("/api/log/stop", methods=["POST"])
def log_stop():
    logger.stop()
    return jsonify({"success": True})

@app.route("/api/control", methods=["POST"])
def control():
    data = request.get_json(force=True) or {}
    cmd = data.get("command")
    req = data.get("value", {}) or {}

    global state, sys_config

    ok, resp = _ensure_hal_started()
    if not ok:
        return resp

    # Short-circuit commands while an alarm is active, except for clearing it
    with state_lock:
        alarm_active = state.get("status") == "ALARM"
    if alarm_active and cmd not in ("CLEAR_ALARM", "EMERGENCY_STOP"):
        return jsonify({"success": False, "msg": "ALARM_ACTIVE"})

    # ----------------------------
    # BASIC RUNTIME COMMANDS
    # ----------------------------

    if cmd == "SET_MODE":
        mode = req.get("mode")
        if mode not in ("AUTO", "MANUAL"):
            return jsonify({"success": False, "msg": "INVALID_MODE"})
        with state_lock:
            state["mode"] = mode

    elif cmd == "SET_TARGET":
        # expects: value: { "z1": float?, "z2": float? }
        with state_lock:
            if "z1" in req:
                state["target_z1"] = float(req["z1"])
            if "z2" in req:
                state["target_z2"] = float(req["z2"])

    elif cmd == "SET_HEATER":
        # expects: value: { "zone": "z1"/"z2", "duty": float }
        zone = req.get("zone")
        duty = float(req.get("duty", 0.0))
        if zone not in ("z1", "z2"):
            return jsonify({"success": False, "msg": "INVALID_ZONE"})
        hal.set_heater_duty(zone, duty)
        with state_lock:
            if zone == "z1":
                state["manual_duty_z1"] = duty
            else:
                state["manual_duty_z2"] = duty

    elif cmd == "SET_MOTOR":
        # expects: value: { "motor": "main"/"feed", "rpm": float }
        motor = req.get("motor")
        rpm = float(req.get("rpm", 0.0))
        if motor not in ("main", "feed"):
            return jsonify({"success": False, "msg": "INVALID_MOTOR"})

        with state_lock:
            temps_snapshot = dict(state.get("temps", {}))

        allowed, reason = safety.guard_motor_temp(temps_snapshot)
        if not allowed:
            hal.set_motor_rpm("main", 0.0)
            hal.set_motor_rpm("feed", 0.0)
            with state_lock:
                state["status"] = "ALARM"
                state["alarm_msg"] = reason
                state["motors"]["main"] = 0.0
                state["motors"]["feed"] = 0.0
            return jsonify({"success": False, "msg": reason})

        hal.set_motor_rpm(motor, rpm)
        with state_lock:
            state["motors"][motor] = rpm

    elif cmd == "SET_RELAY":
        # expects: value: { "relay": "fan"/"pump", "state": bool }
        relay = req.get("relay")
        st = bool(req.get("state", False))
        if relay not in ("fan", "pump"):
            return jsonify({"success": False, "msg": "INVALID_RELAY"})
        hal.set_relay(relay, st)
        with state_lock:
            state["relays"][relay] = st

    elif cmd == "EMERGENCY_STOP":
        # Immediately cut heaters and motors, raise ALARM.
        _latch_alarm("EMERGENCY_STOP")

    elif cmd == "CLEAR_ALARM":
        # Check if physical emergency button is still active
        if hal.get_button_state("btn_emergency"):
            return jsonify({"success": False, "msg": "EMERGENCY_BTN_ACTIVE"})

        _all_outputs_off()
        with state_lock:
            state["status"] = "READY"
            state["alarm_msg"] = ""
        safety.reset()
        running_event.set()

    # ----------------------------
    # CONFIG COMMANDS
    # ----------------------------

    elif cmd == "UPDATE_PID":
        # value: { "zone": "z1"/"z2", "params": {kp,ki,kd} }
        zone = req.get("zone")
        params = req.get("params") or {}
        if zone not in ("z1", "z2"):
            return jsonify({"success": False, "msg": "INVALID_ZONE"})
        target = pid_z1 if zone == "z1" else pid_z2
        target.kp = float(params.get("kp", target.kp))
        target.ki = float(params.get("ki", target.ki))
        target.kd = float(params.get("kd", target.kd))
        sys_config[zone] = {
            "kp": target.kp,
            "ki": target.ki,
            "kd": target.kd,
        }

    elif cmd == "UPDATE_PINS":
        pins = req.get("pins") or {}
        sys_config["pins"] = pins
        # NOTE: requires restart to take effect on GPIO, unless you re-init HAL manually.

    elif cmd == "UPDATE_EXTRUDER_SEQ":
        seq = req.get("sequence") or {}
        if "extruder_sequence" not in sys_config:
            sys_config["extruder_sequence"] = {}
        sys_config["extruder_sequence"].update(seq)

    elif cmd == "UPDATE_DM556":
        sys_config["dm556"] = req.get("params") or {}

    elif cmd == "SET_TEMP_SETTINGS":
        # value: { "params": {...} }
        params = req.get("params") or {}
        try:
            if "poll_interval" in params:
                hal.set_temp_poll_interval(float(params["poll_interval"]))
            if "avg_window" in params:
                hal.set_temp_average_window(float(params["avg_window"]))
            if "use_average" in params:
                hal.set_temp_use_average(bool(params["use_average"]))
            if "decimals_default" in params:
                hal.set_temp_decimals_default(int(params["decimals_default"]))
        except Exception as e:
            print("[SET_TEMP_SETTINGS] error:", e)
            return jsonify({"success": False, "msg": "TEMP_SETTINGS_ERROR"})

        sys_config["temp_settings"] = {
            "poll_interval": hal.temp_poll_interval,
            "avg_window": hal.temp_avg_window,
            "use_average": hal.temp_use_average,
            "decimals_default": hal.temp_decimals_default,
        }

    elif cmd == "SET_SENSOR_MAPPING":
        # value: { mapping: { t1: 0/1/2/3/null, t2: ..., ... } }
        mapping = req.get("mapping") or {}
        for logical, ch in mapping.items():
            try:
                hal.map_sensor(logical, None if ch is None else int(ch))
            except Exception as e:
                print(f"[SET_SENSOR_MAPPING] skip {logical} -> {ch}: {e}")

        if "sensors" not in sys_config:
            sys_config["sensors"] = {}
        for ch_int, cfg in hal.sensor_config.items():
            key = str(ch_int)
            dest = sys_config["sensors"].setdefault(key, {})
            dest["enabled"] = bool(cfg.get("enabled", True))
            dest["logical"] = cfg.get("logical")

    elif cmd == "SET_SENSOR_CALIBRATION":
        # value: { params: { channel, r_fixed?, r_25?, beta?, v_ref?, wiring?, decimals?, cal_points? } }
        params = req.get("params") or {}
        if "channel" not in params:
            return jsonify({"success": False, "msg": "CHANNEL_REQUIRED"})
        ch = int(params["channel"])
        kwargs = {}
        for k in ("r_fixed", "r_25", "beta", "v_ref"):
            if k in params:
                kwargs[k] = params[k]
        if "wiring" in params:
            kwargs["wiring"] = params["wiring"]
        if "decimals" in params:
            kwargs["decimals"] = params["decimals"]
        if "cal_points" in params:
            kwargs["cal_points"] = params["cal_points"]

        try:
            hal.update_sensor_calibration(ch, **kwargs)
        except Exception as e:
            print(f"[SET_SENSOR_CALIBRATION] error: {e}")
            return jsonify({"success": False, "msg": "CAL_ERROR"})

        if "sensors" not in sys_config:
            sys_config["sensors"] = {}
        dest = sys_config["sensors"].setdefault(str(ch), {})
        for k, v in kwargs.items():
            dest[k] = v

    elif cmd == "SAVE_CONFIG":
        try:
            with open(CONFIG_FILE, "w") as f:
                json.dump(sys_config, f, indent=4)
        except Exception as e:
            print("[SAVE_CONFIG] error:", e)
            return jsonify({"success": False, "msg": "SAVE_ERROR"})

    else:
        return jsonify({"success": False, "msg": "UNKNOWN_COMMAND"})

    return jsonify({"success": True})

if __name__ == "__main__":
    debug = True
    if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        startup()
    app.run(host="0.0.0.0", port=5000, debug=debug)
