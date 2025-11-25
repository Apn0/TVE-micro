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

        # Buffering settings
        self.flush_interval = 60.0
        self.last_flush_time = 0
        self.buffer = []

        # Indices of columns to monitor for SD deviation (T1, T2, T3, T_Motor are indices 2, 3, 4, 5)
        self.monitored_indices = [2, 3, 4, 5]

    def configure(self, config):
        """Update logging configuration from app config."""
        if "flush_interval" in config:
            self.flush_interval = float(config["flush_interval"])

    def start(self):
        if self.recording: return
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.log_dir}/run_{timestamp}.csv"
        
        self.file_handle = open(filename, mode='w', newline='')
        self.writer = csv.writer(self.file_handle)
        
        # UPDATED HEADER: Added Targets and Duty Cycles
        self.writer.writerow([
            "Timestamp", "Status", 
            "T1_Feed", "T2_Mid", "T3_Nozzle", "T_Motor", 
            "Target_Z1", "Target_Z2",
            "Pwr_Z1_%", "Pwr_Z2_%",
            "RPM_Main", "RPM_Feed"
        ])
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
            # Row values are strings, need to float
            # If value is "NAN", float() will work but we can't do math with it easily in this context
            # without filtering.

            # Helper to parse float or return None
            def parse(val):
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return None

            current_values = [parse(row[i]) for i in self.monitored_indices]

            # Calculate mean and sd for each monitored column in the buffer
            for idx, val in zip(self.monitored_indices, current_values):
                if val is None or math.isnan(val):
                    continue

                # Get history for this column, filtering out NANs
                history_raw = [parse(r[idx]) for r in self.buffer]
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

        if self.buffer:
            self.writer.writerows(self.buffer)
            self.file_handle.flush()
            self.buffer = []

        self.last_flush_time = time.time()

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

        t1 = get_t("t1")
        t2 = get_t("t2")
        t3 = get_t("t3")
        tm = get_t("motor")

        # Check for missing data to flag "Status" and emit warning
        missing_keys = []
        if t1 is None: missing_keys.append("t1")
        if t2 is None: missing_keys.append("t2")
        if t3 is None: missing_keys.append("t3")

        if missing_keys:
            # Emit structured error to console
            err_payload = {
                "level": "WARN",
                "component": "logger",
                "event": "data_missing",
                "missing_keys": missing_keys,
                "timestamp": time.time()
            }
            print(json.dumps(err_payload))

            # Append flag to status in CSV
            status += "_PARTIAL"

        # Get Heater Duty from HAL (0-100) - safe get
        d1 = hal.heaters.get("z1", 0.0)
        d2 = hal.heaters.get("z2", 0.0)
        
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
