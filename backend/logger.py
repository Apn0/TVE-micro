import csv
import time
import os
import math
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
            current_values = [float(row[i]) for i in self.monitored_indices]

            # Calculate mean and sd for each monitored column in the buffer
            for idx, val in zip(self.monitored_indices, current_values):
                history = [float(r[idx]) for r in self.buffer]
                n = len(history)
                mean = sum(history) / n
                variance = sum((x - mean) ** 2 for x in history) / n
                sd = math.sqrt(variance)

                if sd > 0:
                    if abs(val - mean) > 2 * sd:
                        # Deviation detected
                        return True
        except ValueError:
            # In case of parsing errors, ignore deviation check
            pass

        return False

    def flush(self):
        """Write buffer to disk."""
        if not self.recording or not self.file_handle:
            return

        if self.buffer:
            self.writer.writerows(self.buffer)
            self.file_handle.flush()
            # print(f"[LOG] Flushed {len(self.buffer)} records")
            self.buffer = []

        self.last_flush_time = time.time()

    def log(self, state, hal):
        if not self.recording: return
        
        # Get Heater Duty from HAL (0-100)
        d1 = hal.heaters["z1"]
        d2 = hal.heaters["z2"]
        
        row = [
            datetime.now().strftime("%H:%M:%S.%f")[:-3], # High precision time
            state["status"],
            f"{state['temps']['t1']:.2f}",
            f"{state['temps']['t2']:.2f}",
            f"{state['temps']['t3']:.2f}",
            f"{state['temps']['motor']:.1f}",
            f"{state['target_z1']:.1f}",
            f"{state['target_z2']:.1f}",
            f"{d1:.1f}",
            f"{d2:.1f}",
            state["motors"]["main"],
            state["motors"]["feed"]
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
