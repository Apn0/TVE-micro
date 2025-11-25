import csv
import time
import os
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
        print(f"[LOG] Started recording to {filename}")

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
        self.writer.writerow(row)
        self.file_handle.flush()

    def stop(self):
        if self.file_handle:
            self.file_handle.close()
        self.recording = False
        self.current_file = None
        print("[LOG] Stopped recording")
