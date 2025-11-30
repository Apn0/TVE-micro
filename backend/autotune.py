# file: backend/autotune.py
import time
import math
import logging

logger = logging.getLogger("tve.backend.autotune")

class AutoTuner:
    """
    Implements a Relay Feedback Auto-Tuner for thermal PID loops.

    Uses a hysteresis relay to force a controlled oscillation (Limit Cycle)
    around the setpoint. From the amplitude (A) and period (Pu) of this
    oscillation, it calculates PID terms using the Tyreus-Luyben method
    (conservative) or Ziegler-Nichols (aggressive).
    """
    def __init__(self, output_min=0.0, output_max=100.0):
        self.output_min = output_min
        self.output_max = output_max
        self.reset()

    def reset(self):
        self.active = False
        self.zone_name = None
        self.setpoint = 0.0
        self.tune_power = 70.0  # Safe cap for tuning
        self.hysteresis = 0.5   # deg C
        self.cycles_required = 3

        # Runtime state
        self.state = "IDLE" # IDLE, HEATING, COOLING, DONE, FAILED
        self.cycle_count = 0
        self.peaks = []     # [(time, val, type='max'|'min')]
        self.start_time = 0
        self._local_extremum = None
        self.detected_params = {} # {Ku, Pu}

    def start(self, zone_name, setpoint, tune_power=70.0):
        """Start a new tuning session."""
        self.reset()
        self.active = True
        self.zone_name = zone_name
        self.setpoint = float(setpoint)
        self.tune_power = max(10.0, min(self.output_max, float(tune_power)))
        self.state = "HEATING"
        self.start_time = time.time()
        self._local_extremum = None # Will be initialized on first update
        logger.info(f"AutoTune STARTED for {zone_name} @ {setpoint}C (Pwr: {self.tune_power}%)")

    def stop(self):
        """Abort or finish tuning."""
        if self.active:
            logger.info(f"AutoTune STOPPED for {self.zone_name}")
        self.active = False
        self.state = "IDLE"

    def update(self, input_val):
        """
        Called every control loop tick.
        Returns: duty_cycle (float) or None (if not active).
        """
        if not self.active or input_val is None:
            return None

        now = time.time()

        # Timeout safety (e.g., 30 mins max)
        if now - self.start_time > 1800:
            logger.error("AutoTune TIMEOUT")
            self.state = "FAILED"
            self.active = False
            return 0.0

        # Initialize local extremum if this is the first tick
        if not hasattr(self, '_local_extremum') or self._local_extremum is None:
            self._local_extremum = input_val

        output = 0.0

        if self.state == "HEATING":
            # Track peak (max) for previous cycle (if we just came from cooling)
            if input_val > self._local_extremum:
                self._local_extremum = input_val

            # Check for Switch: Temp > Setpoint + Hysteresis
            if input_val > (self.setpoint + self.hysteresis):
                self.state = "COOLING"
                self._record_peak(now, self._local_extremum, 'max')
                self._local_extremum = input_val # Reset for min finding
                output = self.output_min # Apply Cooling IMMEDIATELY
            else:
                output = self.tune_power # Continue Heating

        elif self.state == "COOLING":
            # Track valley (min)
            if input_val < self._local_extremum:
                self._local_extremum = input_val

            # Check for Switch: Temp < Setpoint - Hysteresis
            if input_val < (self.setpoint - self.hysteresis):
                self.state = "HEATING"
                self._record_peak(now, self._local_extremum, 'min')
                self._local_extremum = input_val # Reset for max finding
                self.cycle_count += 0.5
                output = self.tune_power # Apply Heating IMMEDIATELY
            else:
                output = self.output_min # Continue Cooling

        # Check for completion
        if self.cycle_count >= self.cycles_required:
            success = self._calculate_result()
            self.state = "DONE" if success else "FAILED"
            self.active = False
            return 0.0 # Safety off

        return output

    def _record_peak(self, t, val, kind):
        """Store oscillation peaks for analysis."""
        # Only record after the first 1.5 cycles to avoid startup transient
        if self.cycle_count >= 1.0:
            self.peaks.append({"t": t, "val": val, "type": kind})
            logger.info(f"AutoTune Peak: {kind.upper()}={val:.2f} @ {t:.1f}")

    def _calculate_result(self):
        """
        Calculate Ku (Ultimate Gain) and Pu (Ultimate Period)
        from recorded peaks.
        """
        if len(self.peaks) < 4:
            logger.error("AutoTune: Not enough peaks to calculate.")
            return False

        # 1. Average Period (Pu)
        periods = []
        for i in range(2, len(self.peaks)):
            p_now = self.peaks[i]
            p_prev = self.peaks[i-2]
            if p_now['type'] == p_prev['type']:
                periods.append(p_now['t'] - p_prev['t'])

        if not periods:
            return False

        Pu = sum(periods) / len(periods)

        # 2. Average Amplitude (A)
        maxs = [p['val'] for p in self.peaks if p['type'] == 'max']
        mins = [p['val'] for p in self.peaks if p['type'] == 'min']
        avg_max = sum(maxs) / len(maxs)
        avg_min = sum(mins) / len(mins)
        amplitude = (avg_max - avg_min) / 2.0

        # 3. Ultimate Gain (Ku)
        d = self.tune_power
        if amplitude <= 0.001:
            amplitude = 0.001

        Ku = (4.0 * d) / (math.pi * amplitude)

        self.detected_params = {
            "Ku": Ku,
            "Pu": Pu,
            "amplitude": amplitude
        }
        logger.info(f"AutoTune Result: Ku={Ku:.3f}, Pu={Pu:.2f}s, Amp={amplitude:.2f}C")
        return True

    def get_pid_suggestions(self, method="tyreus-luyben"):
        """
        Return suggested PID parameters based on calculated Ku/Pu.
        Methods: 'ziegler-nichols', 'tyreus-luyben' (recommended for slow thermals)
        """
        if not self.detected_params:
            return None

        Ku = self.detected_params["Ku"]
        Pu = self.detected_params["Pu"]

        if method == "ziegler-nichols":
            # Classic ZN
            kp = 0.6 * Ku
            ti = 0.5 * Pu
            td = 0.125 * Pu
        else:
            # Tyreus-Luyben
            kp = Ku / 2.2
            ti = 2.2 * Pu
            td = Pu / 6.3

        ki = kp / ti if ti > 0 else 0
        kd = kp * td

        return {
            "kp": round(kp, 2),
            "ki": round(ki, 4),
            "kd": round(kd, 2),
            "method": method
        }
