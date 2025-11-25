# file: hardware.py
"""
HardwareInterface with ADS1115 + NTC integration.

- Keeps original API:
    HardwareInterface(pin_config)
    .set_heater_duty(heater, duty)
    .set_motor_rpm(motor, rpm)
    .set_relay(relay, state)
    .get_temps() -> {"t1","t2","t3","motor"}
    .is_motor_fault() -> bool

- New features:
    - ADS1115 support on A0–A3 for 4 NTCs
    - Per-channel mapping to logical sensors: t1, t2, t3, motor
    - Per-channel NTC calibration (Rfixed, R25, Beta, Vref, wiring)
    - Optional multi-point linear correction
    - Selectable averaging vs raw
    - Adjustable poll interval and averaging window
    - Adjustable decimals per sensor and global default

To configure sensors/ADC, you can (optionally) pass:
    HardwareInterface(pin_config, sensor_config=..., adc_config=...)
If you do nothing extra, defaults assume 4x 100k NTC to GND on ADS1115, mapped to t1/t2/t3/motor.
"""

import time
import random
import threading
import math
from typing import Dict, Any, List, Tuple

# --- Platform / GPIO detection ------------------------------------------------

try:
    import RPi.GPIO as GPIO  # type: ignore
    PLATFORM = "PI"
except ImportError:
    GPIO = None  # type: ignore
    PLATFORM = "WIN"

# --- Optional ADS1115 support -------------------------------------------------

try:
    from smbus2 import SMBus  # type: ignore
except Exception:
    try:
        from smbus import SMBus  # type: ignore
    except Exception:
        SMBus = None  # type: ignore

# --- Logical sensors ----------------------------------------------------------

LOGICAL_SENSORS = ["t1", "t2", "t3", "motor"]

# --- Default sensor + ADC configuration ---------------------------------------

DEFAULT_SENSOR_CONFIG: Dict[int, Dict[str, Any]] = {
    0: {
        "enabled": True,
        "logical": "t1",       # "t1","t2","t3","motor" or None
        "r_fixed": 100_000.0,  # Ω – series resistor
        "r_25": 100_000.0,     # Ω @ 25 °C
        "beta": 3950.0,        # K
        "v_ref": 3.3,          # V supply
        "wiring": "ntc_to_gnd",# or "ntc_to_vref"
        "decimals": 1,
        "cal_points": [],
    },
    1: {
        "enabled": True,
        "logical": "t2",
        "r_fixed": 100_000.0,
        "r_25": 100_000.0,
        "beta": 3950.0,
        "v_ref": 3.3,
        "wiring": "ntc_to_gnd",
        "decimals": 1,
        "cal_points": [],
    },
    2: {
        "enabled": True,
        "logical": "t3",
        "r_fixed": 100_000.0,
        "r_25": 100_000.0,
        "beta": 3950.0,
        "v_ref": 3.3,
        "wiring": "ntc_to_gnd",
        "decimals": 1,
        "cal_points": [],
    },
    3: {
        "enabled": True,
        "logical": "motor",
        "r_fixed": 100_000.0,
        "r_25": 100_000.0,
        "beta": 3950.0,
        "v_ref": 3.3,
        "wiring": "ntc_to_gnd",
        "decimals": 1,
        "cal_points": [],
    },
}

DEFAULT_ADC_CONFIG: Dict[str, Any] = {
    "enabled": True,
    "bus": 1,
    "address": 0x48,
    "fsr": 4.096,
}

# --- Helper: linear calibration -----------------------------------------------

def _fit_linear_correction(cal_points: List[Dict[str, float]]) -> Tuple[float, float]:
    """
    cal_points: list of {"raw_temp": float, "true_temp": float}
    Returns (slope, offset) such that true ≈ slope * raw + offset.
    If fewer than 2 points, returns (1.0, 0.0).
    """
    if not cal_points or len(cal_points) < 2:
        return 1.0, 0.0

    xs = [float(p["raw_temp"]) for p in cal_points]
    ys = [float(p["true_temp"]) for p in cal_points]
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n

    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs) or 1.0
    slope = num / den
    offset = my - slope * mx
    return slope, offset

# --- ADS1115 driver -----------------------------------------------------------

class ADS1115Driver:
    """
    Minimal ADS1115 reader using SMBus.
    Single-ended read per channel, 4.096 V FSR, 128 SPS.
    """

    def __init__(self, bus_id=1, address=0x48, fsr=4.096):
        self.available = PLATFORM == "PI" and SMBus is not None
        self.bus_id = bus_id
        self.address = address
        self.fsr = fsr
        self.bus = None

        if self.available:
            try:
                self.bus = SMBus(self.bus_id)
            except Exception as e:
                print(f"[ADS1115] SMBus init failed: {e}")
                self.available = False

    def read_voltage(self, channel: int):
        if not self.available or self.bus is None:
            return None
        if channel not in (0, 1, 2, 3):
            return None

        mux = 0x04 + channel
        config = (
            (1 << 15) |            # OS: start single conversion
            (mux << 12) |          # MUX
            (0x01 << 9) |          # PGA ±4.096 V
            (0x01 << 8) |          # MODE single-shot
            (0x04 << 5) |          # DR 128 SPS
            (0x00 << 0)            # comparator disabled
        )
        try:
            self.bus.write_i2c_block_data(
                self.address, 0x01, [(config >> 8) & 0xFF, config & 0xFF]
            )
            time.sleep(0.01)
            data = self.bus.read_i2c_block_data(self.address, 0x00, 2)
            raw = (data[0] << 8) | data[1]
            if raw & 0x8000:
                raw -= 1 << 16
            volts = raw * (self.fsr / 32768.0)
            return volts
        except Exception as e:
            print(f"[ADS1115] read failed ch{channel}: {e}")
            return None

    def close(self):
        if self.bus is not None:
            try:
                self.bus.close()
            except Exception:
                pass
            self.bus = None

# --- HardwareInterface --------------------------------------------------------

class HardwareInterface:
    """
    Integrated HAL:
    - GPIO + heaters/motors/relays
    - ADS1115-based temperature readings (or simulation).

    Constructor (backward compatible):
        HardwareInterface(pin_config)
        HardwareInterface(pin_config, sensor_config=..., adc_config=...)
    """

    def __init__(
        self,
        pin_config,
        sensor_config=None,
        adc_config=None,
        running_event=None,
    ):
        self.platform = PLATFORM
        self.pins = pin_config  # Dictionary of Pin Numbers

        # Internal State
        self.heaters = {"z1": 0.0, "z2": 0.0}
        self.motors = {"main": 0.0, "feed": 0.0}
        self.relays = {"fan": False, "pump": False}
        self.temps = {k: 25.0 for k in LOGICAL_SENSORS}
        self.motor_fault_active = False

        # Sensor config
        self.sensor_config: Dict[int, Dict[str, Any]] = {}
        base_cfg = sensor_config or {}
        for ch, cfg in DEFAULT_SENSOR_CONFIG.items():
            merged = cfg.copy()
            if ch in base_cfg:
                merged.update(base_cfg[ch] or {})
            slope, offset = _fit_linear_correction(merged.get("cal_points", []))
            merged["corr_slope"] = slope
            merged["corr_offset"] = offset
            self.sensor_config[ch] = merged

        # ADC config
        adc_cfg = DEFAULT_ADC_CONFIG.copy()
        if adc_config:
            adc_cfg.update(adc_config)
        self.adc_cfg = adc_cfg

        if PLATFORM == "PI" and self.adc_cfg.get("enabled", True):
            self._ads = ADS1115Driver(
                bus_id=self.adc_cfg.get("bus", 1),
                address=self.adc_cfg.get("address", 0x48),
                fsr=self.adc_cfg.get("fsr", 4.096),
            )
        else:
            self._ads = ADS1115Driver(bus_id=1, address=0x48, fsr=4.096)
            self._ads.available = False

        # Temp / averaging settings
        self.temp_poll_interval = 0.25
        self.temp_use_average = True
        self.temp_avg_window = 2.0
        self.temp_decimals_default = 1

        self._temp_lock = threading.Lock()
        self._temp_samples: Dict[str, List[tuple]] = {k: [] for k in LOGICAL_SENSORS}

        # GPIO setup
        if self.platform == "PI" and GPIO is not None and self.pins:
            self._setup_gpio()
        else:
            print("[HAL] Windows or no pins. Simulation Mode.")

        # Threads (hardware + temperature)
        self.running = True
        self.running_event = running_event or threading.Event()
        if not self.running_event.is_set():
            self.running_event.set()
        self._hw_thread = threading.Thread(target=self._hardware_loop, daemon=True)
        self._hw_thread.start()

        self._temp_thread = threading.Thread(target=self._temp_loop, daemon=True)
        self._temp_thread.start()

    # --- GPIO setup ------------------------------------------------------

    def _setup_gpio(self):
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)

        outs = []
        for key in ("ssr_z1", "ssr_z2", "ssr_fan", "ssr_pump",
                    "step_main", "dir_main", "step_feed", "dir_feed"):
            if key in self.pins and self.pins[key] is not None:
                outs.append(int(self.pins[key]))

        if outs:
            GPIO.setup(outs, GPIO.OUT)

        # Inputs (DM556 Alarm)
        if "alm_main" in self.pins and self.pins["alm_main"] is not None:
            GPIO.setup(int(self.pins["alm_main"]), GPIO.IN, pull_up_down=GPIO.PUD_UP)

        # Inputs (Buttons)
        for btn in ("btn_start", "btn_emergency"):
            if btn in self.pins and self.pins[btn] is not None:
                 GPIO.setup(int(self.pins[btn]), GPIO.IN, pull_up_down=GPIO.PUD_UP)

        # Output (LED)
        if "led_status" in self.pins and self.pins["led_status"] is not None:
            GPIO.setup(int(self.pins["led_status"]), GPIO.OUT)
            GPIO.output(int(self.pins["led_status"]), GPIO.LOW)

        print("[HAL] GPIO Initialized with Config.")

    # --- Hardware loop (motors, relays, fault) ---------------------------

    def _hardware_loop(self):
        while self.running:
            if not self.running_event.is_set():
                self._force_all_off()
                # Update LED even if stopped (e.g. Alarm state handled by main loop, but if HW loop is halted we might miss it.
                # However, _force_all_off clears outputs.
                # If we want LED to blink during Alarm, we should probably not use _force_all_off blindly or separate LED control.
                # For now, let's allow LED control in force_all_off or separate it.
                # Actually, running_event.clear() is used for Emergency Stop in app.py logic...
                # BUT, if we want an LED to indicate Alarm, we need to be able to write to it.
                # I'll update _force_all_off to NOT clear the LED status pin.
                time.sleep(0.05)
                continue

            if self.platform == "WIN":
                self._simulate_physics()
            else:
                self._run_real_hardware()
            time.sleep(0.01)

    def _simulate_physics(self):
        heat_z1 = 0.1 if self.heaters["z1"] > 0 else -0.05
        heat_z2 = 0.1 if self.heaters["z2"] > 0 else -0.05

        self.temps["t2"] += heat_z1 + random.uniform(-0.01, 0.01)
        self.temps["t3"] += heat_z2 + random.uniform(-0.01, 0.01)
        self.temps["t1"] += (self.temps["t2"] - self.temps["t1"]) * 0.005

        if self.motors["main"] > 0:
            cooling = 0.1 if self.relays["fan"] else 0.0
            self.temps["motor"] += (self.motors["main"] / 1000.0) - cooling
        else:
            self.temps["motor"] -= 0.05

        for k in self.temps:
            self.temps[k] = max(20, self.temps[k])

    def _run_real_hardware(self):
        if GPIO is None:
            return

        if "alm_main" in self.pins and self.pins["alm_main"] is not None:
            if GPIO.input(int(self.pins["alm_main"])) == GPIO.LOW:
                self.motor_fault_active = True
            else:
                self.motor_fault_active = False

        now = time.time()
        cycle = now % 1.0

        def safe_out(name, value):
            pin = self.pins.get(name)
            if pin is not None:
                GPIO.output(int(pin), value)

        safe_out("ssr_z1", GPIO.HIGH if cycle < (self.heaters["z1"] / 100.0) else GPIO.LOW)
        safe_out("ssr_z2", GPIO.HIGH if cycle < (self.heaters["z2"] / 100.0) else GPIO.LOW)
        safe_out("ssr_fan", GPIO.HIGH if self.relays["fan"] else GPIO.LOW)
        safe_out("ssr_pump", GPIO.HIGH if self.relays["pump"] else GPIO.LOW)

    def get_button_state(self, btn_name):
        """Returns True if button is pressed (Active LOW assumed for pull-up)."""
        if self.platform != "PI" or GPIO is None:
            return False # TODO: Simulation hook

        pin = self.pins.get(btn_name)
        if pin is None:
            return False

        # Assume Pull-Up -> Active Low
        return GPIO.input(int(pin)) == GPIO.LOW

    def set_led_state(self, led_name, state):
        if self.platform != "PI" or GPIO is None:
            return

        pin = self.pins.get(led_name)
        if pin is not None:
            GPIO.output(int(pin), GPIO.HIGH if state else GPIO.LOW)

    # --- Temperature loop (ADS1115 or simulation) ------------------------

    def _temp_loop(self):
        while self.running:
            now = time.time()

            if self._ads is None or not self._ads.available:
                if self.platform == "WIN":
                    time.sleep(self.temp_poll_interval)
                    continue
                self._simulate_temp_loop(now)
                time.sleep(self.temp_poll_interval)
                continue

            readings_by_logical: Dict[str, float] = {}

            for ch, cfg in self.sensor_config.items():
                if not cfg.get("enabled", False):
                    continue
                logical = cfg.get("logical")
                if logical not in LOGICAL_SENSORS:
                    continue

                volts = self._ads.read_voltage(ch)
                if volts is None:
                    continue

                temp_raw = self._voltage_to_temp(volts, cfg)
                temp_corr = cfg["corr_slope"] * temp_raw + cfg["corr_offset"]
                readings_by_logical[logical] = temp_corr

            with self._temp_lock:
                for logical, val in readings_by_logical.items():
                    samples = self._temp_samples.setdefault(logical, [])
                    samples.append((now, float(val)))

                    cutoff = now - self.temp_avg_window
                    while samples and samples[0][0] < cutoff:
                        samples.pop(0)

                    if self.temp_use_average and samples:
                        avg = sum(v for _, v in samples) / len(samples)
                        value = avg
                    else:
                        value = val

                    decimals = self.temp_decimals_default
                    for cfg in self.sensor_config.values():
                        if cfg.get("logical") == logical:
                            decimals = int(cfg.get("decimals", decimals))
                            break
                    self.temps[logical] = round(value, decimals)

            time.sleep(self.temp_poll_interval)

    def _simulate_temp_loop(self, now: float):
        with self._temp_lock:
            ambient = 23.0 + 1.0 * math.sin(now / 3600.0)
            h1 = self.heaters.get("z1", 0.0) / 100.0
            h2 = self.heaters.get("z2", 0.0) / 100.0

            self.temps["t1"] += (ambient - self.temps["t1"]) * 0.02
            self.temps["t2"] += (ambient + 120 * h1 - self.temps["t2"]) * 0.05
            self.temps["t3"] += (ambient + 150 * h2 - self.temps["t3"]) * 0.06
            self.temps["motor"] += (
                ambient
                + 20 * (abs(self.motors.get("main", 0)) / 60.0)
                - self.temps["motor"]
            ) * 0.05

            for k in LOGICAL_SENSORS:
                self.temps[k] += random.uniform(-0.05, 0.05)

    # --- Voltage -> temp -------------------------------------------------

    def _voltage_to_temp(self, v_ntc: float, cfg: Dict[str, Any]) -> float:
        v_ref = float(cfg.get("v_ref", 3.3))
        r_fixed = float(cfg.get("r_fixed", 100_000.0))
        r_25 = float(cfg.get("r_25", 100_000.0))
        beta = float(cfg.get("beta", 3950.0))
        wiring = cfg.get("wiring", "ntc_to_gnd")

        if v_ntc <= 0.001:
            v_ntc = 0.001
        if v_ntc >= v_ref - 0.001:
            v_ntc = v_ref - 0.001

        if wiring == "ntc_to_gnd":
            r_ntc = r_fixed * v_ntc / (v_ref - v_ntc)
        else:
            r_ntc = r_fixed * (v_ref - v_ntc) / v_ntc

        t0 = 25.0 + 273.15
        ln_ratio = math.log(max(r_ntc, 1.0) / r_25)
        inv_t = (1.0 / t0) + ln_ratio / beta
        t_k = 1.0 / inv_t
        t_c = t_k - 273.15
        return t_c

    # --- Public API ------------------------------------------------------

    def set_heater_duty(self, heater, duty):
        if heater in self.heaters:
            self.heaters[heater] = max(0.0, min(100.0, float(duty)))

    def set_motor_rpm(self, motor, rpm):
        if motor in self.motors:
            self.motors[motor] = float(rpm)

    def set_relay(self, relay, state):
        if relay in self.relays:
            self.relays[relay] = bool(state)

    def get_temps(self):
        with self._temp_lock:
            return dict(self.temps)

    def is_motor_fault(self):
        return bool(self.motor_fault_active)

    def get_button_state(self, btn_name):
        """Returns True if button is pressed (Active LOW assumed for pull-up)."""
        if self.platform != "PI" or GPIO is None:
            # Simulation: Allow setting button states via internal variable if needed
            # For now, return False
            return getattr(self, f"_sim_{btn_name}", False)

        pin = self.pins.get(btn_name)
        if pin is None:
            return False

        # Assume Pull-Up -> Active Low
        return GPIO.input(int(pin)) == GPIO.LOW

    def set_led_state(self, led_name, state):
        if self.platform != "PI" or GPIO is None:
            return

        pin = self.pins.get(led_name)
        if pin is not None:
            GPIO.output(int(pin), GPIO.HIGH if state else GPIO.LOW)

    # --- Config hooks ----------------------------------------------------

    def set_temp_poll_interval(self, seconds: float):
        self.temp_poll_interval = max(0.05, float(seconds))

    def set_temp_average_window(self, seconds: float):
        self.temp_avg_window = max(0.1, float(seconds))

    def set_temp_use_average(self, use_average: bool):
        self.temp_use_average = bool(use_average)

    def set_temp_decimals_default(self, decimals: int):
        self.temp_decimals_default = max(0, int(decimals))

    def map_sensor(self, logical_name: str, adc_channel):
        logical_name = str(logical_name)
        if logical_name not in LOGICAL_SENSORS:
            raise ValueError(f"Unknown logical sensor '{logical_name}'")

        for ch, cfg in self.sensor_config.items():
            if cfg.get("logical") == logical_name:
                cfg["logical"] = None

        if adc_channel is None:
            return

        if adc_channel not in self.sensor_config:
            raise ValueError(f"ADC channel {adc_channel} not in sensor_config")

        self.sensor_config[adc_channel]["logical"] = logical_name

    def update_sensor_calibration(
        self,
        adc_channel: int,
        *,
        r_fixed=None,
        r_25=None,
        beta=None,
        v_ref=None,
        wiring=None,
        cal_points=None,
        decimals=None,
    ):
        if adc_channel not in self.sensor_config:
            raise ValueError(f"ADC channel {adc_channel} not in sensor_config")

        cfg = self.sensor_config[adc_channel]
        if r_fixed is not None:
            cfg["r_fixed"] = float(r_fixed)
        if r_25 is not None:
            cfg["r_25"] = float(r_25)
        if beta is not None:
            cfg["beta"] = float(beta)
        if v_ref is not None:
            cfg["v_ref"] = float(v_ref)
        if wiring is not None:
            cfg["wiring"] = str(wiring)
        if decimals is not None:
            cfg["decimals"] = int(decimals)
        if cal_points is not None:
            cfg["cal_points"] = list(cal_points)
            slope, offset = _fit_linear_correction(cfg["cal_points"])
            cfg["corr_slope"] = slope
            cfg["corr_offset"] = offset

    def _force_all_off(self):
        self.heaters["z1"] = 0.0
        self.heaters["z2"] = 0.0
        self.motors["main"] = 0.0
        self.motors["feed"] = 0.0
        self.relays["fan"] = False
        self.relays["pump"] = False

        if self.platform == "PI" and GPIO is not None:
            def safe_out(name, value):
                pin = self.pins.get(name)
                if pin is not None:
                    GPIO.output(int(pin), value)

            safe_out("ssr_z1", GPIO.LOW)
            safe_out("ssr_z2", GPIO.LOW)
            safe_out("ssr_fan", GPIO.LOW)
            safe_out("ssr_pump", GPIO.LOW)
            # NOTE: We specifically DO NOT force led_status off here,
            # because we might want to blink it during an alarm state.

    def shutdown(self):
        self.running = False
        for thread in (getattr(self, "_hw_thread", None), getattr(self, "_temp_thread", None)):
            if thread is not None:
                thread.join(timeout=2.0)
        if getattr(self, "_ads", None) is not None:
            try:
                self._ads.close()
            except Exception:
                pass
        if self.platform == "PI" and GPIO is not None:
            GPIO.cleanup()

if __name__ == "__main__":
    print("[HAL] self-test starting...")
    pins = {}
    hw = HardwareInterface(pins)
    hw.set_temp_poll_interval(0.2)
    hw.set_temp_average_window(3.0)
    hw.set_temp_use_average(True)
    hw.set_temp_decimals_default(1)

    try:
        while True:
            temps = hw.get_temps()
            print(
                time.strftime("%H:%M:%S"),
                "|",
                " ".join(f"{k}={v:.1f}°C" for k, v in temps.items()),
                "| fault=",
                hw.is_motor_fault(),
            )
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n[HAL] stopping.")
        hw.shutdown()