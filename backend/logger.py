import csv
import time
import os
import math
import json
from datetime import datetime

class DataLogger:
    def __init__(self):
        self.log_dir = "logs"
        if not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir)

        self.current_file = None
        self.writer = None
        self.file_handle = None
        self.recording = False

        self.headers = [
            "Timestamp", "Status",
            "T1_Feed", "T2_Mid", "T3_Nozzle", "T_Motor",
            "Target_Z1", "Target_Z2",
            "Pwr_Z1_%", "Pwr_Z2_%",
            "RPM_Main", "RPM_Feed"
        ]

        # Buffering settings
        self.flush_interval = 60.0
        self.last_flush_time = 0
        self.buffer = []

        # Safety/backpressure settings
        self.max_buffer_size = 1000
        self.flush_retry_attempts = 3
        self.flush_retry_delay = 0.5

        # Indices of columns to monitor for SD deviation (T1, T2, T3, T_Motor are indices 2, 3, 4, 5)
        self.monitored_indices = [2, 3, 4, 5]

        # Error handling hooks
        self.on_error = None
        self.warning_cooldown = 5.0
        self._last_event_times = {}

    def configure(self, config):
        """Update logging configuration from app config."""
        if "flush_interval" in config:
            self.flush_interval = float(config["flush_interval"])
        if "max_buffer_size" in config:
            self.max_buffer_size = int(config["max_buffer_size"])
        if "flush_retry_attempts" in config:
            self.flush_retry_attempts = int(config["flush_retry_attempts"])
        if "flush_retry_delay" in config:
            self.flush_retry_delay = float(config["flush_retry_delay"])

    def set_error_handler(self, handler):
        """Attach a callback that will receive structured error events."""
        self.on_error = handler

    def _emit_event(self, level, event, context=None, cooldown=False):
        now = time.time()
        if cooldown:
            last = self._last_event_times.get(event, 0)
            if now - last < self.warning_cooldown:
                return
            self._last_event_times[event] = now

        payload = {
            "level": level,
            "component": "logger",
            "event": event,
            "context": context or {},
            "timestamp": now,
        }

        if self.on_error:
            try:
                self.on_error(payload)
            except Exception:
                # Fallback to console if the handler raises
                print(json.dumps(payload))
        else:
            print(json.dumps(payload))

    def _validate_numeric_field(self, value, field_name):
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            self._emit_event(
                "WARN",
                "non_numeric_value",
                {"field": field_name, "value": value},
                cooldown=True,
            )
            return None

    def _parse_monitored_value(self, row, idx):
        label = self.headers[idx] if idx < len(self.headers) else f"col_{idx}"
        try:
            val = float(row[idx])
            if math.isnan(val):
                return None
            return val
        except (ValueError, TypeError):
            self._emit_event(
                "WARN",
                "deviation_value_non_numeric",
                {"field": label, "value": row[idx]},
                cooldown=True,
            )
            return None

    def _reopen_current_file(self):
        if not self.current_file:
            return False
        try:
            if self.file_handle:
                self.file_handle.close()
            self.file_handle = open(self.current_file, mode="a", newline="")
            self.writer = csv.writer(self.file_handle)
            return True
        except OSError as exc:
            self._emit_event(
                "ERROR",
                "file_reopen_failed",
                {"file": self.current_file, "error": str(exc)},
            )
            return False

    def _write_buffer_with_retries(self):
        rows_to_write = list(self.buffer)
        for attempt in range(1, self.flush_retry_attempts + 1):
            if not self.writer or not self.file_handle:
                if not self._reopen_current_file():
                    self._emit_event(
                        "ERROR",
                        "flush_skipped_no_handle",
                        {"attempt": attempt, "file": self.current_file},
                    )
                    time.sleep(self.flush_retry_delay * attempt)
                    continue
            try:
                self.writer.writerows(rows_to_write)
                self.file_handle.flush()
                os.fsync(self.file_handle.fileno())
                return True
            except OSError as exc:
                self._emit_event(
                    "ERROR",
                    "flush_failed",
                    {
                        "attempt": attempt,
                        "file": self.current_file,
                        "error": str(exc),
                        "buffer_size": len(self.buffer),
                    },
                )
                self._reopen_current_file()
                time.sleep(self.flush_retry_delay * attempt)
        return False

    def _apply_backpressure(self, make_room_for=0):
        """Prevent unbounded buffer growth by dropping oldest entries when necessary."""
        allowed = self.max_buffer_size - make_room_for
        if allowed < 0:
            allowed = 0

        if len(self.buffer) > allowed:
            drop_count = len(self.buffer) - allowed
            self.buffer = self.buffer[-allowed:] if allowed > 0 else []
            self._emit_event(
                "ERROR",
                "buffer_overflow",
                {"dropped_rows": drop_count, "max_buffer_size": self.max_buffer_size},
            )

    def start(self):
        if self.recording: return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.log_dir}/run_{timestamp}.csv"

        try:
            self.file_handle = open(filename, mode='w', newline='')
            self.writer = csv.writer(self.file_handle)
            self.writer.writerow(self.headers)
        except OSError as exc:
            self._emit_event(
                "ERROR",
                "start_failed",
                {"file": filename, "error": str(exc)},
            )
            self.recording = False
            return

        self.current_file = filename
        self.recording = True
        self.last_flush_time = time.time()
        self.buffer = []
        print(f"[LOG] Started recording to {filename}")

    def _check_deviation(self, row):
        """
        Check if the new row deviates significantly (> 2 SD) from the buffer mean
        for monitored columns.
        """
        if len(self.buffer) < 10:
            return False

        # Extract values for monitored columns
        try:
            current_values = [self._parse_monitored_value(row, i) for i in self.monitored_indices]

            # Calculate mean and sd for each monitored column in the buffer
            for idx, val in zip(self.monitored_indices, current_values):
                if val is None or math.isnan(val):
                    continue

                # Get history for this column, filtering out NANs
                history_raw = [self._parse_monitored_value(r, idx) for r in self.buffer]
                history = [h for h in history_raw if h is not None and not math.isnan(h)]

                if not history:
                    continue

                n = len(history)
                if n < 2:
                    continue

                mean = sum(history) / n
                variance = sum((x - mean) ** 2 for x in history) / n
                sd = math.sqrt(variance)

                if sd > 0:
                    if abs(val - mean) > 2 * sd:
                        # Deviation detected
                        return True
        except Exception:
            # In case of any unexpected errors, ignore deviation check to prevent logging crash
            pass

        return False

    def flush(self):
        """Write buffer to disk."""
        if not self.recording or not self.file_handle:
            return

        if not self.buffer:
            self.last_flush_time = time.time()
            return

        if self._write_buffer_with_retries():
            self.buffer = []
            self.last_flush_time = time.time()
        else:
            # If flush failed, avoid unbounded buffer growth
            self._apply_backpressure()

    def _format_val(self, val, fmt=".2f"):
        """Safely format a value, returning 'NAN' if None or invalid."""
        if val is None:
            return "NAN"
        try:
            # Check for float nan
            if isinstance(val, float) and math.isnan(val):
                return "NAN"
            return f"{val:{fmt}}"
        except (ValueError, TypeError):
            return "NAN"

    def log(self, state, hal):
        if not self.recording: return

        status = state.get("status", "UNKNOWN")
        temps = state.get("temps", {})
        motors = state.get("motors", {})

        # Helper to get temp safely
        def get_t(k): return temps.get(k)

        t1 = self._validate_numeric_field(get_t("t1"), "t1")
        t2 = self._validate_numeric_field(get_t("t2"), "t2")
        t3 = self._validate_numeric_field(get_t("t3"), "t3")
        tm = self._validate_numeric_field(get_t("motor"), "motor_temp")

        # Check for missing data to flag "Status" and emit warning
        missing_keys = []
        if t1 is None: missing_keys.append("t1")
        if t2 is None: missing_keys.append("t2")
        if t3 is None: missing_keys.append("t3")

        if missing_keys:
            # Emit structured error to console
            self._emit_event(
                "WARN",
                "data_missing",
                {"missing_keys": missing_keys},
                cooldown=True,
            )

            # Append flag to status in CSV
            status += "_PARTIAL"

        # Get Heater Duty from HAL (0-100) - safe get
        d1 = self._validate_numeric_field(hal.heaters.get("z1", 0.0), "duty_z1")
        d2 = self._validate_numeric_field(hal.heaters.get("z2", 0.0), "duty_z2")

        # Avoid unbounded growth: attempt flush and drop if still at capacity
        if len(self.buffer) >= self.max_buffer_size:
            self._emit_event(
                "WARN",
                "buffer_capacity_reached",
                {"size": len(self.buffer), "max": self.max_buffer_size},
                cooldown=True,
            )
            self.flush()

        if len(self.buffer) >= self.max_buffer_size:
            self._apply_backpressure(make_room_for=1)

        row = [
            datetime.now().strftime("%H:%M:%S.%f")[:-3],
            status,
            self._format_val(t1, ".2f"),
            self._format_val(t2, ".2f"),
            self._format_val(t3, ".2f"),
            self._format_val(tm, ".1f"),
            self._format_val(state.get("target_z1"), ".1f"),
            self._format_val(state.get("target_z2"), ".1f"),
            self._format_val(d1, ".1f"),
            self._format_val(d2, ".1f"),
            motors.get("main", 0.0), # Motors usually have defaults in state
            motors.get("feed", 0.0)
        ]

        # Check for deviation before adding to buffer
        deviation_trigger = self._check_deviation(row)

        self.buffer.append(row)

        now = time.time()
        if deviation_trigger:
            print("[LOG] Trigger: Deviation detected! Flushing buffer.")
            self.flush()
        elif (now - self.last_flush_time) >= self.flush_interval:
            self.flush()

    def stop(self):
        # Flush remaining data
        self.flush()

        if self.file_handle:
            self.file_handle.close()
        self.recording = False
        self.current_file = None
        print("[LOG] Stopped recording")
