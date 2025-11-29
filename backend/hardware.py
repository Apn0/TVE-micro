# file: backend/hardware.py
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
import logging
from typing import Dict, Any, List, Tuple, Optional

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
# Broadcom-numbered GPIO pins present on the 40-pin Raspberry Pi header (plus
# the ID EEPROM pins). These are used to populate the GPIO control surface even
# when a pin is not explicitly mapped in the configuration.
ALL_GPIO_PINS_BCM = tuple(range(0, 28))
hardware_logger = logging.getLogger("tve.backend.hardware")

# --- Default Hardware Configuration -------------------------------------------

DEFAULT_PINS: Dict[str, int | None] = {
    "ssr_z1": None,
    "ssr_z2": None,
    "ssr_fan": None,
    "ssr_pump": None,
    "peltier": None,
    "step_main": 5,
    "dir_main": 6,
    "en_main": None,
    "step_feed": None,
    "dir_feed": None,
    "en_feed": None,
    "alm_main": None,
    "btn_start": 25,
    "btn_emergency": 8,
    "led_status": None,
    "led_red": None,
    "led_green": None,
    "led_yellow": None
}

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
        "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
}

DEFAULT_ADC_CONFIG: Dict[str, Any] = {
    "enabled": True,
    "bus": 1,
    "address": 0x48,
    "fsr": 4.096,
}

# --- Default PWM configuration -----------------------------------------------

DEFAULT_PWM_CONFIG: Dict[str, Any] = {
    "enabled": False,
    "bus": 1,
    "address": 0x40,
    "frequency": 1000,
    "channels": {
        "z1": 0,
        "z2": 1,
        "fan": 2,
        "fan_nozzle": 3,
        "pump": 4,
        "led_status": 5,
        "peltier": 6,
    },
}

# --- Full System Defaults (Moved from app.py) ---------------------------------

SYSTEM_DEFAULTS = {
    "z1": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "z2": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "dm556": {
        "microsteps": 1600,
        "current_peak": 2.7,
        "idle_half": True,
    },
    "pins": {
        "ssr_z1": None,
        "ssr_z2": None,
        "ssr_fan": None,
        "ssr_pump": None,
        "peltier": None,
        "step_main": 5,
        "dir_main": 6,
        "en_main": None,
        "step_feed": None,
        "dir_feed": None,
        "en_feed": None,
        "alm_main": None,
        "btn_start": 25,
        "btn_emergency": 8,
        "led_status": None,
        "led_red": None,
        "led_green": None,
        "led_yellow": None
    },
    "pwm": {
        "enabled": True,
        "bus": 1,
        "address": 0x40,
        "frequency": 1000,
        "channels": {
            "z1": 0,
            "z2": 1,
            "fan": 2,
            "fan_nozzle": 3,
            "pump": 4,
            "led_status": 5,
            "peltier": 6,
        },
    },
    "sensors": {
        "0": {"enabled": True, "logical": "t1", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "1": {"enabled": True, "logical": "t2", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "2": {"enabled": True, "logical": "t3", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
        "3": {"enabled": True, "logical": "motor", "r_fixed": 100000.0, "r_25": 100000.0, "beta": 3950.0, "v_ref": 3.3, "wiring": "ntc_to_gnd", "decimals": 1, "cal_points": []},
    },
    "adc": DEFAULT_ADC_CONFIG,
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
        "startup": [
            {"device": "main_motor", "action": "on", "delay": 0.0, "enabled": True},
            {"device": "feed_motor", "action": "on", "delay": 2.0, "enabled": True},
            {"device": "fan", "action": "on", "delay": 0.0, "enabled": False},
            {"device": "pump", "action": "on", "delay": 0.0, "enabled": False},
        ],
        "shutdown": [
            {"device": "feed_motor", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "main_motor", "action": "off", "delay": 5.0, "enabled": True},
            {"device": "fan", "action": "off", "delay": 0.0, "enabled": False},
            {"device": "pump", "action": "off", "delay": 0.0, "enabled": False},
        ],
        "emergency": [
            {"device": "feed_motor", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "main_motor", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "fan", "action": "off", "delay": 0.0, "enabled": True},
            {"device": "pump", "action": "off", "delay": 0.0, "enabled": True},
        ],
        "check_temp_before_start": True,
    },
    "motion": {
        "ramp_up": 0.0,
        "ramp_down": 0.0,
        "max_accel": 0.0,
        "max_jerk": 0.0,
    },
}

# --- Helper: linear calibration -----------------------------------------------

def _fit_linear_correction(cal_points: List[Dict[str, float]]) -> Tuple[float, float]:
    """
    Computes a linear regression (slope and offset) for calibration points.

    Args:
        cal_points: list of {"raw_temp": float, "true_temp": float}

    Returns:
        tuple: (slope, offset) such that true_temp ≈ slope * raw_temp + offset.
               Returns (1.0, 0.0) if fewer than 2 points are provided.
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

    Configures the ADS1115 for single-ended reads, ±4.096V range, and 128 SPS.
    """

    def __init__(self, bus_id=1, address=0x48, fsr=4.096):
        """
        Initialize the ADS1115 driver.

        Args:
            bus_id (int, optional): I2C bus number. Defaults to 1.
            address (int, optional): I2C address of the device. Defaults to 0x48.
            fsr (float, optional): Full Scale Range voltage. Defaults to 4.096.
        """
        self.available = PLATFORM == "PI" and SMBus is not None
        self.bus_id = bus_id
        self.address = address
        self.fsr = fsr
        self.bus = None
        self._error_count = 0

        if self.available:
            try:
                self.bus = SMBus(self.bus_id)
                # Probe the device to see if it's really there
                # Try reading Config Register (0x01)
                self.bus.read_word_data(self.address, 0x01)
            except Exception as e:
                print(f"[ADS1115] Init failed (device not found at 0x{self.address:02X}): {e}")
                self.available = False
                self.close()

    def read_voltage(self, channel: int, retries: int = 1):
        """
        Read the voltage from a specific channel.

        Args:
            channel (int): Channel index (0-3).
            retries (int, optional): Number of read attempts. Defaults to 1.

        Returns:
            float or None: The measured voltage in Volts, or None if reading fails.
        """
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
        attempts = max(1, int(retries) + 1)
        for attempt in range(attempts):
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
                self._error_count = 0
                return volts
            except Exception as e:
                if attempt == attempts - 1:
                    hardware_logger.warning(f"[ADS1115] read failed ch{channel}: {e}")
                    self._error_count += 1
                    if self._error_count >= 5:
                        hardware_logger.warning("[ADS1115] disabling ADC after repeated I2C errors")
                        self.available = False
                        self.close()
                    return None
                time.sleep(0.005)

    def close(self):
        """Close the I2C bus connection."""
        if self.bus is not None:
            try:
                self.bus.close()
            except Exception as exc:
                hardware_logger.warning("Failed to close ADS1115 bus: %s", exc)
            self.bus = None

# --- PCA9685 PWM driver ------------------------------------------------------

class PCA9685Driver:
    """
    Minimal PCA9685 PWM driver for controlling servos and LEDs.
    """

    def __init__(self, bus_id=1, address=0x40, frequency=1000):
        """
        Initialize the PCA9685 driver.

        Args:
            bus_id (int, optional): I2C bus number. Defaults to 1.
            address (int, optional): I2C address. Defaults to 0x40.
            frequency (float, optional): PWM frequency in Hz. Defaults to 1000.
        """
        self.available = PLATFORM == "PI" and SMBus is not None
        self.bus_id = bus_id
        self.address = int(address)
        self.frequency = frequency
        self.bus = None
        self._error_count = 0

        if self.available:
            if not 0x03 <= self.address <= 0x77:
                hardware_logger.warning(
                    "Invalid PCA9685 address 0x%02X; disabling PWM", self.address
                )
                self.available = False
                return

            try:
                self.bus = SMBus(self.bus_id)
                self._init_device()
            except Exception as e:
                print(f"[PCA9685] SMBus init failed: {e}")
                self.available = False

    def _init_device(self):
        """Initialise MODE1 and set PWM frequency."""
        # Reset
        self._write_byte(0x00, 0x00)
        self.set_frequency(self.frequency)

    def _write_byte(self, register: int, value: int):
        """Write a single byte to a register."""
        if not self.available or self.bus is None:
            return
        try:
            self.bus.write_byte_data(self.address, register, value & 0xFF)
        except Exception as e:
            print(f"[PCA9685] write failed reg=0x{register:02X}: {e}")

    def _write_word(self, register: int, value: int):
        """Write a 16-bit word to a register."""
        if not self.available or self.bus is None:
            return
        try:
            self.bus.write_word_data(self.address, register, value & 0xFFFF)
        except Exception as e:
            print(f"[PCA9685] write word failed reg=0x{register:02X}: {e}")

    def set_frequency(self, frequency_hz: float):
        """
        Set PWM frequency (approximate).

        Args:
            frequency_hz (float): Target frequency in Hz.
        """
        if not self.available or self.bus is None:
            return

        frequency_hz = max(24.0, min(1526.0, float(frequency_hz)))
        prescale_val = int(round(25_000_000.0 / (4096 * frequency_hz)) - 1)
        try:
            old_mode = self.bus.read_byte_data(self.address, 0x00)
            sleep_mode = (old_mode & 0x7F) | 0x10
            self._write_byte(0x00, sleep_mode)
            self._write_byte(0xFE, prescale_val)
            self._write_byte(0x00, old_mode)
            time.sleep(0.005)
            self._write_byte(0x00, old_mode | 0xA1)
        except Exception as e:
            print(f"[PCA9685] set_frequency failed: {e}")

    def set_duty(self, channel: int, duty: float):
        """
        Set duty cycle for a channel.

        Args:
            channel (int): PWM channel index (0-15).
            duty (float): Duty cycle (0-100%).
        """
        if not self.available or self.bus is None:
            return
        if channel < 0 or channel > 15:
            return

        duty = max(0.0, min(100.0, float(duty)))
        off_count = int(4095 * (duty / 100.0))
        on_count = 0

        base = 0x06 + 4 * channel
        try:
            self.bus.write_i2c_block_data(
                self.address,
                base,
                [
                    on_count & 0xFF,
                    (on_count >> 8) & 0x0F,
                    off_count & 0xFF,
                    (off_count >> 8) & 0x0F,
                ],
            )
            self._error_count = 0
        except Exception as e:
            print(f"[PCA9685] set_duty failed ch{channel}: {e}")
            self._error_count += 1
            if self._error_count >= 3:
                print("[PCA9685] disabling PWM after repeated I2C errors")
                self.available = False
                self.close()

    def all_off(self):
        """Turn off all PWM channels."""
        if not self.available or self.bus is None:
            return
        try:
            self._write_byte(0xFA, 0x00)
            self._write_byte(0xFB, 0x00)
            self._write_byte(0xFC, 0x00)
            self._write_byte(0xFD, 0x00)
        except Exception as e:
            print(f"[PCA9685] all_off failed: {e}")

    def close(self):
        """Close the I2C bus connection."""
        if self.bus is not None:
            try:
                self.bus.close()
            except Exception as exc:
                hardware_logger.warning("Failed to close PCA9685 bus: %s", exc)
            self.bus = None

# --- HardwareInterface --------------------------------------------------------

class HardwareInterface:
    """
    Integrated Hardware Abstraction Layer (HAL).

    This class provides a unified interface for controlling motors, heaters,
    and relays, as well as reading sensors. It handles the details of GPIO
    and I2C communication, and falls back to simulation mode if hardware is
    not present.
    """

    def __init__(
        self,
        pin_config,
        sensor_config=None,
        adc_config=None,
        pwm_config=None,
        running_event=None,
    ):
        """
        Initialize the Hardware Interface.

        Args:
            pin_config (dict): Mapping of logical names to BCM GPIO pin numbers.
            sensor_config (dict, optional): Configuration for NTC sensors.
            adc_config (dict, optional): Configuration for the ADS1115 ADC.
            pwm_config (dict, optional): Configuration for PCA9685 PWM.
            running_event (threading.Event, optional): Event to signal system shutdown.
        """
        self.platform = PLATFORM
        self.pins = pin_config  # Dictionary of Pin Numbers

        # Internal State
        self.heaters = {"z1": 0.0, "z2": 0.0}
        self.motors = {"main": 0.0, "feed": 0.0}
        self.relays = {"fan": False, "pump": False}
        self.peltier_duty = 0.0
        self.temps = {k: 25.0 for k in LOGICAL_SENSORS}
        self.motor_fault_active = False
        self.pin_pull_up_down = {}
        self.pin_modes = {}
        # Simulated GPIO storage so the API remains usable off-device
        self._sim_gpio_values = {}

        # Manual motor control state
        self._manual_move_lock = threading.Lock()
        self.manual_steps_pending = {"main": 0, "feed": 0}
        self.manual_step_speed = {"main": 1000, "feed": 1000}
        self._last_step_time = {"main": 0, "feed": 0}

        self._stepper_threads = {}
        self._stepper_events = {}

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

        # PWM config
        pwm_cfg = DEFAULT_PWM_CONFIG.copy()
        if pwm_config:
            pwm_cfg.update({k: v for k, v in pwm_config.items() if k != "channels"})
            channels = DEFAULT_PWM_CONFIG.get("channels", {}).copy()
            channels.update(pwm_config.get("channels", {}))
            pwm_cfg["channels"] = channels
        self.pwm_cfg = pwm_cfg
        self.pwm_channels = self.pwm_cfg.get("channels", {})
        self.pwm_outputs: Dict[str, float] = {k: 0.0 for k in self.pwm_channels}

        if PLATFORM == "PI" and self.pwm_cfg.get("enabled", False):
            self._pwm = PCA9685Driver(
                bus_id=self.pwm_cfg.get("bus", 1),
                address=self.pwm_cfg.get("address", 0x40),
                frequency=self.pwm_cfg.get("frequency", 1000),
            )
        else:
            self._pwm = None
        self._pwm_available = self._pwm is not None and getattr(self._pwm, "available", False)
        # Only treat PWM channels as active when both enabled in config and the
        # hardware/driver is actually available. This allows GPIO SSR control to
        # remain active when PWM is disabled or the PCA9685 cannot be used.
        self._pwm_active = bool(self.pwm_cfg.get("enabled", False) and self._pwm_available)
        self._active_pwm_channels = self.pwm_channels if self._pwm_active else {}

        # Temp / averaging settings
        self.temp_poll_interval = 0.25
        self.temp_use_average = True
        self.temp_avg_window = 2.0
        self.temp_decimals_default = 1
        now = time.time()
        self._temp_timestamps: Dict[str, float] = {k: now for k in LOGICAL_SENSORS}

        # Simple in-memory store for simulated GPIO values when running without
        # real hardware. Keys are BCM pin numbers, values are booleans.
        self._sim_gpio_state: Dict[int, bool] = {}

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

        for motor_name in ("main", "feed"):
            self._stepper_events[motor_name] = threading.Event()
            self._stepper_threads[motor_name] = threading.Thread(
                target=self._stepper_loop,
                args=(motor_name,),
                daemon=True,
            )
            self._stepper_threads[motor_name].start()

    def _is_pwm_channel_active(self, name: str) -> bool:
        """Return True if the given logical output is using PWM right now."""

        return self._pwm_active and name in self._active_pwm_channels

    def _stepper_loop(self, motor_name):
        """
        Background loop for handling manual motor stepping.

        Args:
            motor_name (str): 'main' or 'feed'.
        """
        while self.running:
            self._stepper_events[motor_name].wait()

            with self._manual_move_lock:
                steps_to_move = self.manual_steps_pending[motor_name]
                speed = self.manual_step_speed[motor_name]

            if steps_to_move == 0:
                self._stepper_events[motor_name].clear()
                continue

            step_pin = self.pins.get(f"step_{motor_name}")
            en_pin = self.pins.get(f"en_{motor_name}")
            if self.platform != "PI" or GPIO is None or step_pin is None:
                print(f"[HAL] SIM: Stepping {motor_name} for {steps_to_move} steps at {speed} steps/s")
                time.sleep(abs(steps_to_move) / speed)
                with self._manual_move_lock:
                    self.manual_steps_pending[motor_name] = 0
                continue

            delay = 1.0 / speed
            if en_pin is not None:
                GPIO.output(int(en_pin), GPIO.HIGH)
            for _ in range(abs(steps_to_move)):
                with self._manual_move_lock:
                    if self.manual_steps_pending[motor_name] == 0:
                        break

                GPIO.output(step_pin, GPIO.HIGH)
                time.sleep(delay / 2)
                GPIO.output(step_pin, GPIO.LOW)
                time.sleep(delay / 2)

                with self._manual_move_lock:
                    if self.manual_steps_pending[motor_name] > 0:
                        self.manual_steps_pending[motor_name] -= 1
                    else:
                        self.manual_steps_pending[motor_name] += 1

            self._stepper_events[motor_name].clear()
            if en_pin is not None and abs(self.motors.get(motor_name, 0.0)) < 1e-6:
                GPIO.output(int(en_pin), GPIO.LOW)

    # --- GPIO setup ------------------------------------------------------

    def _setup_gpio(self):
        """Initialize GPIO pins based on configuration."""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)

        # Pins that should be initialized LOW (Standard outputs: Relays, SSRs, LEDs, Step/Dir)
        keys_low = [
            "ssr_z1", "ssr_z2", "ssr_fan", "ssr_pump", "peltier",
            "step_main", "dir_main",
            "step_feed", "dir_feed",
            "led_status", "led_red", "led_green", "led_yellow"
        ]

        # Pins that should be initialized HIGH (Active-Low Enables)
        keys_high = ["en_main", "en_feed"]

        outs_low = []
        outs_high = []

        # Collect LOW outputs
        for key in keys_low:
            # Check PWM exemption
            # Some keys map to PWM channels (z1, z2, fan, pump, peltier, led_status).
            # If active, we skip GPIO setup for them.
            if key in ("ssr_z1", "ssr_z2", "ssr_fan", "ssr_pump", "peltier", "led_status"):
                # Map logical key to PWM channel name
                pwm_name = key.replace("ssr_", "")  # ssr_z1 -> z1, ssr_fan -> fan
                if self._is_pwm_channel_active(pwm_name):
                    continue

            pin_val = self.pins.get(key)
            if pin_val is not None:
                outs_low.append(int(pin_val))

        # Collect HIGH outputs
        for key in keys_high:
            pin_val = self.pins.get(key)
            if pin_val is not None:
                outs_high.append(int(pin_val))

        # Initialize Outputs
        if outs_low:
            GPIO.setup(outs_low, GPIO.OUT, initial=GPIO.LOW)
        if outs_high:
            GPIO.setup(outs_high, GPIO.OUT, initial=GPIO.HIGH)

        # Inputs (DM556 Alarm)
        if "alm_main" in self.pins and self.pins["alm_main"] is not None:
            GPIO.setup(int(self.pins["alm_main"]), GPIO.IN, pull_up_down=GPIO.PUD_UP)

        # Inputs (Buttons)
        for btn in ("btn_start", "btn_emergency"):
            if btn in self.pins and self.pins[btn] is not None:
                 GPIO.setup(int(self.pins[btn]), GPIO.IN, pull_up_down=GPIO.PUD_UP)

        print("[HAL] GPIO Initialized with Config.")

    # --- Generic GPIO helpers (for manual poking / diagnostics) -----------

    def configure_pin(self, pin: int, direction: str = "OUT", pull: str | None = None):
        """
        Configure a GPIO pin on the fly.

        Args:
            pin (int): BCM pin number.
            direction (str): "OUT" or "IN".
            pull (str, optional): Pull direction "UP", "DOWN", or None.
        """
        if pin is None:
            return

        if self.platform == "PI" and GPIO is not None:
            mode = GPIO.OUT if direction == "OUT" else GPIO.IN
            kwargs = {}
            if direction == "IN" and pull:
                if pull == "UP":
                    kwargs["pull_up_down"] = GPIO.PUD_UP
                elif pull == "DOWN":
                    kwargs["pull_up_down"] = GPIO.PUD_DOWN
            GPIO.setup(int(pin), mode, **kwargs)
        else:
            # Simulated environment, just ensure default value exists
            self._sim_gpio_state.setdefault(int(pin), False)

    def gpio_write(self, pin: int, state: bool):
        """
        Set a pin high/low. Assumes output mode.

        Args:
            pin (int): BCM pin number.
            state (bool): True for High, False for Low.
        """
        if pin is None:
            return
        if self.platform == "PI" and GPIO is not None:
            GPIO.output(int(pin), GPIO.HIGH if state else GPIO.LOW)
        else:
            self._sim_gpio_state[int(pin)] = bool(state)

    def gpio_read(self, pin: int) -> bool:
        """
        Read a pin state.

        Args:
            pin (int): BCM pin number.

        Returns:
            bool: True if High, False if Low (or not configured).
        """
        if pin is None:
            return False
        if self.platform == "PI" and GPIO is not None:
            try:
                return bool(GPIO.input(int(pin)))
            except Exception:
                return False
        return bool(self._sim_gpio_state.get(int(pin), False))

    # --- Hardware loop (motors, relays, fault) ---------------------------

    def _hardware_loop(self):
        """
        Main loop for updating hardware outputs.
        Runs continuously in a background thread.
        """
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
        """Simulate thermal physics and motor feedback for testing on non-hardware platforms."""
        heat_z1 = 0.1 if self.heaters["z1"] > 0 else -0.05
        heat_z2 = 0.1 if self.heaters["z2"] > 0 else -0.05

        # Peltier cooling effect on t1 (throat)
        peltier_cooling = 0.2 * (self.peltier_duty / 100.0)

        self.temps["t2"] += heat_z1 + random.uniform(-0.01, 0.01)  # nosec B311 - simulation noise only
        self.temps["t3"] += heat_z2 + random.uniform(-0.01, 0.01)  # nosec B311 - simulation noise only
        self.temps["t1"] += (self.temps["t2"] - self.temps["t1"]) * 0.005 - peltier_cooling

        if self.motors["main"] > 0:
            fan_level = self.pwm_outputs.get("fan", 100.0 if self.relays["fan"] else 0.0)
            cooling = 0.1 * (fan_level / 100.0)
            self.temps["motor"] += (self.motors["main"] / 1000.0) - cooling
        else:
            self.temps["motor"] -= 0.05

        for k in self.temps:
            self.temps[k] = max(20, self.temps[k])

    def _run_real_hardware(self):
        """Update actual GPIO outputs based on internal state."""
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

        if self._is_pwm_channel_active("z1"):
            self.set_pwm_output("z1", self.heaters["z1"])
        else:
            safe_out("ssr_z1", GPIO.HIGH if cycle < (self.heaters["z1"] / 100.0) else GPIO.LOW)

        if self._is_pwm_channel_active("z2"):
            self.set_pwm_output("z2", self.heaters["z2"])
        else:
            safe_out("ssr_z2", GPIO.HIGH if cycle < (self.heaters["z2"] / 100.0) else GPIO.LOW)
        if not self._is_pwm_channel_active("fan"):
            safe_out("ssr_fan", GPIO.HIGH if self.relays["fan"] else GPIO.LOW)
        if not self._is_pwm_channel_active("pump"):
            safe_out("ssr_pump", GPIO.HIGH if self.relays["pump"] else GPIO.LOW)

        if self._is_pwm_channel_active("peltier"):
            self.set_pwm_output("peltier", self.peltier_duty)
        else:
            # Simple PWM simulation or just ON/OFF if duty > 0?
            # For non-PWM hardware pin, let's just do > 50% = ON
            safe_out("peltier", GPIO.HIGH if self.peltier_duty > 0 else GPIO.LOW)

        for motor_name in ("main", "feed"):
            en_pin = self.pins.get(f"en_{motor_name}")
            if en_pin is None:
                continue

            active = bool(
                abs(self.motors.get(motor_name, 0.0)) > 1e-3
                or self.manual_steps_pending.get(motor_name, 0) != 0
            )
            GPIO.output(int(en_pin), GPIO.HIGH if active else GPIO.LOW)

    # --- Temperature loop (ADS1115 or simulation) ------------------------

    def _temp_loop(self):
        """
        Main loop for polling temperature sensors.
        Runs continuously in a background thread.
        """
        while self.running:
            now = time.time()

            if self._ads is None or not self._ads.available:
                with self._temp_lock:
                    self._simulate_temp_loop(now, locked=True)

                    for logical in LOGICAL_SENSORS:
                        val = self.temps.get(logical)
                        samples = self._temp_samples.setdefault(logical, [])

                        if val is None or not math.isfinite(val):
                            samples.clear()
                            self.temps[logical] = None
                            self._temp_timestamps[logical] = 0.0
                            continue

                        samples.append((now, float(val)))

                        cutoff = now - self.temp_avg_window
                        while samples and samples[0][0] < cutoff:
                            samples.pop(0)

                        value = (
                            sum(v for _, v in samples) / len(samples)
                            if self.temp_use_average and samples
                            else float(val)
                        )

                        decimals = self.temp_decimals_default
                        for cfg in self.sensor_config.values():
                            if cfg.get("logical") == logical:
                                decimals = int(cfg.get("decimals", decimals))
                                break

                        self.temps[logical] = round(value, decimals)
                        self._temp_timestamps[logical] = now

                time.sleep(self.temp_poll_interval)
                continue

            readings_by_logical: Dict[str, float | None] = {k: None for k in LOGICAL_SENSORS}

            for ch, cfg in self.sensor_config.items():
                if not cfg.get("enabled", False):
                    continue
                logical = cfg.get("logical")
                if logical not in LOGICAL_SENSORS:
                    continue

                volts = self._ads.read_voltage(ch, retries=1)
                if volts is None:
                    readings_by_logical[logical] = None
                    continue

                temp_raw = self._voltage_to_temp(volts, cfg)
                temp_corr = cfg["corr_slope"] * temp_raw + cfg["corr_offset"]

                if not math.isfinite(temp_raw) or not math.isfinite(temp_corr):
                    readings_by_logical[logical] = None
                    continue

                readings_by_logical[logical] = temp_corr

            with self._temp_lock:
                for logical, val in readings_by_logical.items():
                    samples = self._temp_samples.setdefault(logical, [])

                    if val is None or not math.isfinite(val):
                        samples.clear()
                        self.temps[logical] = None
                        self._temp_timestamps[logical] = 0.0
                        continue

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
                    self._temp_timestamps[logical] = now

            time.sleep(self.temp_poll_interval)

    def get_sensor_timestamp(self, logical: str) -> float:
        """Return last valid reading timestamp for a logical sensor."""
        return float(self._temp_timestamps.get(logical, 0.0))

    def get_last_temp_timestamp(self) -> float:
        """Return the most recent timestamp across valid sensors (0 if none)."""
        return max(self._temp_timestamps.values() or [0.0])

    def _simulate_temp_loop(self, now: float, *, locked: bool = False):
        if not locked:
            with self._temp_lock:
                self._simulate_temp_loop(now, locked=True)
            return

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
            self.temps[k] += random.uniform(-0.05, 0.05)  # nosec B311 - simulation noise only

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
        """
        Set the duty cycle for a heater.

        Args:
            heater (str): "z1" or "z2".
            duty (float): 0.0 to 100.0.
        """
        if heater in self.heaters:
            clamped = max(0.0, min(100.0, float(duty)))
            self.heaters[heater] = clamped
            if self._is_pwm_channel_active(heater):
                self.set_pwm_output(heater, clamped)

    def set_motor_rpm(self, motor, rpm):
        """
        Set the RPM for a motor.

        Args:
            motor (str): "main" or "feed".
            rpm (float): Target RPM.
        """
        if motor in self.motors:
            self.motors[motor] = float(rpm)
            if float(rpm) != 0:
                self._set_motor_enable(motor, True)

    def _set_motor_enable(self, motor: str, enable: bool):
        """
        Enable or disable the motor driver.
        Assumes Active LOW enable (Enable=LOW, Disable=HIGH).
        """
        if self.platform != "PI" or GPIO is None:
            return

        pin = self.pins.get(f"en_{motor}")
        if pin is not None:
            # enable=True -> LOW, enable=False -> HIGH
            GPIO.output(int(pin), GPIO.LOW if enable else GPIO.HIGH)

    def set_pwm_output(self, name: str, duty: float):
        """
        Set a direct PWM output value.

        Args:
            name (str): The logical name of the PWM channel.
            duty (float): Duty cycle (0-100).
        """
        if not self._is_pwm_channel_active(name):
            return

        duty = max(0.0, min(100.0, float(duty)))
        self.pwm_outputs[name] = duty

        if self._pwm is not None and getattr(self._pwm, "available", False):
            channel = self.pwm_channels.get(name)
            self._pwm.set_duty(channel, duty)

    def move_motor_steps(self, motor, steps, speed=1000):
        """
        Manually step a motor.

        Args:
            motor (str): "main" or "feed".
            steps (int): Number of steps (positive or negative for direction).
            speed (int, optional): Steps per second. Defaults to 1000.
        """
        if motor not in ("main", "feed"):
            return

        dir_pin = self.pins.get(f"dir_{motor}")
        if self.platform == "PI" and GPIO is not None:
            if dir_pin is not None:
                direction = GPIO.HIGH if steps > 0 else GPIO.LOW
                GPIO.output(dir_pin, direction)
            # Ensure enabled before moving
            self._set_motor_enable(motor, True)

        with self._manual_move_lock:
            self.manual_steps_pending[motor] = steps
            self.manual_step_speed[motor] = speed
        self._stepper_events[motor].set()

    def stop_manual_move(self, motor):
        """
        Stop any pending manual motor moves.

        Args:
            motor (str): "main" or "feed".
        """
        if motor in self.manual_steps_pending:
            with self._manual_move_lock:
                self.manual_steps_pending[motor] = 0

    def set_relay(self, relay, state):
        """
        Set a relay state.

        Args:
            relay (str): "fan" or "pump".
            state (bool): True for On, False for Off.
        """
        if relay in self.relays:
            self.relays[relay] = bool(state)
            if self._is_pwm_channel_active(relay):
                self.set_pwm_output(relay, 100.0 if state else 0.0)

    def set_peltier_duty(self, duty):
        """
        Set the Peltier element duty cycle.

        Args:
            duty (float): 0.0 to 100.0.
        """
        clamped = max(0.0, min(100.0, float(duty)))
        self.peltier_duty = clamped
        if self._is_pwm_channel_active("peltier"):
            self.set_pwm_output("peltier", clamped)

    def get_temps(self):
        """
        Get the current temperatures.

        Returns:
            dict: Dictionary of temperatures {"t1", "t2", "t3", "motor"}.
        """
        with self._temp_lock:
            return dict(self.temps)

    def is_motor_fault(self):
        """
        Check if the motor driver is signaling a fault.

        Returns:
            bool: True if fault is active, False otherwise.
        """
        return bool(self.motor_fault_active)

    def get_button_state(self, btn_name):
        """
        Get the state of a button.

        Args:
            btn_name (str): Logical button name (e.g., "btn_start").

        Returns:
            bool: True if pressed, False otherwise.
        """
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
        """
        Set the state of an LED.

        Args:
            led_name (str): Logical LED name.
            state (bool): True for On, False for Off.
        """
        if self._is_pwm_channel_active(led_name):
            self.set_pwm_output(led_name, 100.0 if state else 0.0)
            return

        if self.platform != "PI" or GPIO is None:
            return

        pin = self.pins.get(led_name)
        if pin is not None:
            GPIO.output(int(pin), GPIO.HIGH if state else GPIO.LOW)

    def get_gpio_status(self):
        """
        Get the status of all GPIO pins.

        Returns:
            dict: Nested dictionary mapping pin numbers to status info.
        """
        status = {}
        reported_pins: set[int] = set()

        def _collect_status(pin_num: int, pin_name: Optional[str] = None):
            try:
                int_pin = int(pin_num)
            except (ValueError, TypeError) as exc:
                logging.warning(
                    f"Skipping status for invalid pin {pin_name or pin_num}: {exc}"
                )
                return

            mode = self.pin_modes.get(int_pin, "IN")
            pull_up_down = (
                self.pin_pull_up_down.get(int_pin, "up") if mode == "IN" else "off"
            )

            try:
                value = int(self.get_gpio_value(int_pin) or 0)
            except Exception as exc:  # pragma: no cover - defensive log
                logging.warning(f"Could not get status for pin {int_pin}: {exc}")
                value = 0

            status[int_pin] = {
                "name": pin_name,
                "mode": mode,
                "value": value,
                "pull_up_down": pull_up_down,
            }
            reported_pins.add(int_pin)

        # First report configured pins so they keep their assigned names.
        for pin_name, pin_num in self.pins.items():
            if pin_num is None:
                continue
            _collect_status(pin_num, pin_name)

        # Then fill the rest of the BCM header pins so the UI can control any
        # available GPIO, even if it lacks a friendly name in the config. Also
        # include pins that have been manipulated via the API while running.
        additional_pins = (
            set(ALL_GPIO_PINS_BCM) | set(self.pin_modes.keys()) | set(self._sim_gpio_values.keys())
        )
        for pin_num in sorted(additional_pins):
            if pin_num in reported_pins:
                continue
            _collect_status(pin_num)

        return status

    def set_gpio_mode(self, pin, mode, pull_up_down='up'):
        """
        Set the mode of a GPIO pin.

        Args:
            pin (int): BCM pin number.
            mode (str): "IN" or "OUT".
            pull_up_down (str, optional): "up", "down", or "off". Defaults to "up".
        """
        normalized_mode = mode.upper()
        if normalized_mode not in ("IN", "OUT"):
            return

        self.pin_modes[pin] = normalized_mode
        self.pin_pull_up_down[pin] = pull_up_down if normalized_mode == "IN" else None

        if self.platform != "PI" or GPIO is None:
            # Keep a simulated value around so status endpoints are populated
            if pin not in self._sim_gpio_values:
                self._sim_gpio_values[pin] = 0
            return

        if normalized_mode == "IN":
            pud = GPIO.PUD_UP
            if pull_up_down == 'down':
                pud = GPIO.PUD_DOWN
            elif pull_up_down == 'off':
                pud = GPIO.PUD_OFF
            GPIO.setup(pin, GPIO.IN, pull_up_down=pud)
        elif normalized_mode == "OUT":
            GPIO.setup(pin, GPIO.OUT)

    def get_gpio_value(self, pin):
        """
        Get the value of a GPIO pin.

        Args:
            pin (int): BCM pin number.

        Returns:
            int: 0 or 1.
        """
        if self.platform != "PI" or GPIO is None:
            return self._sim_gpio_values.get(pin, 0)

        return GPIO.input(pin)

    def set_gpio_value(self, pin, value):
        """
        Set the value of a GPIO pin.

        Args:
            pin (int): BCM pin number.
            value (bool): True for High, False for Low.
        """
        if self.platform != "PI" or GPIO is None:
            self._sim_gpio_values[pin] = 1 if value else 0
            return

        # Ensure pin is set to output mode before writing if not already?
        # The frontend calls SET_GPIO_MODE separately.
        # But we should ensure the pin is set up if it wasn't by _setup_gpio.
        try:
             GPIO.output(pin, GPIO.HIGH if value else GPIO.LOW)
        except RuntimeError:
             # Pin might not be set up as output. Try setting it up.
             GPIO.setup(pin, GPIO.OUT)
             GPIO.output(pin, GPIO.HIGH if value else GPIO.LOW)

    # --- Config hooks ----------------------------------------------------

    def set_temp_poll_interval(self, seconds: float):
        """Set the temperature polling interval."""
        self.temp_poll_interval = max(0.05, float(seconds))

    def set_temp_average_window(self, seconds: float):
        """Set the window size for moving average calculation."""
        self.temp_avg_window = max(0.1, float(seconds))

    def set_temp_use_average(self, use_average: bool):
        """Enable or disable temperature averaging."""
        self.temp_use_average = bool(use_average)

    def set_temp_decimals_default(self, decimals: int):
        """Set default number of decimal places for temperatures."""
        self.temp_decimals_default = max(0, int(decimals))

    def map_sensor(self, logical_name: str, adc_channel):
        """
        Map a logical sensor name to an ADC channel.

        Args:
            logical_name (str): e.g., "t1".
            adc_channel (int): 0-3.
        """
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
        """
        Update calibration parameters for a sensor channel.

        Args:
            adc_channel (int): The ADC channel index.
            r_fixed (float, optional): Series resistor value in Ohms.
            r_25 (float, optional): NTC resistance at 25°C in Ohms.
            beta (float, optional): NTC Beta value.
            v_ref (float, optional): Reference voltage.
            wiring (str, optional): "ntc_to_gnd" or "ntc_to_vref".
            cal_points (list, optional): List of calibration points.
            decimals (int, optional): Number of decimal places.
        """
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
        """
        Turn off all high-power outputs (heaters, motors).
        """
        self.heaters["z1"] = 0.0
        self.heaters["z2"] = 0.0
        self.motors["main"] = 0.0
        self.motors["feed"] = 0.0
        self.relays["fan"] = False
        self.relays["pump"] = False
        self.peltier_duty = 0.0
        for name in self.pwm_outputs:
            self.pwm_outputs[name] = 0.0
            self.set_pwm_output(name, 0.0)

        if self.platform == "PI" and GPIO is not None:
            def safe_out(name, value):
                pin = self.pins.get(name)
                if pin is not None:
                    GPIO.output(int(pin), value)

            safe_out("ssr_z1", GPIO.LOW)
            safe_out("ssr_z2", GPIO.LOW)
            if not self._is_pwm_channel_active("fan"):
                safe_out("ssr_fan", GPIO.LOW)
            if not self._is_pwm_channel_active("pump"):
                safe_out("ssr_pump", GPIO.LOW)
            if not self._is_pwm_channel_active("peltier"):
                safe_out("peltier", GPIO.LOW)
            # Motor enable pins are active LOW, so set HIGH to disable
            safe_out("en_main", GPIO.HIGH)
            safe_out("en_feed", GPIO.HIGH)
            # NOTE: We specifically DO NOT force led_status off here,
            # because we might want to blink it during an alarm state.

    def shutdown(self):
        """
        Cleanly shut down the hardware interface.
        Stops threads and cleans up GPIO.
        """
        self.running = False
        for thread in (getattr(self, "_hw_thread", None), getattr(self, "_temp_thread", None)):
            if thread is not None:
                thread.join(timeout=2.0)
        if getattr(self, "_ads", None) is not None:
            try:
                self._ads.close()
            except Exception as exc:
                hardware_logger.warning("Failed to close ADS driver during shutdown: %s", exc)
        if getattr(self, "_pwm", None) is not None:
            try:
                self._pwm.close()
            except Exception as exc:
                hardware_logger.warning("Failed to close PWM driver during shutdown: %s", exc)
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
