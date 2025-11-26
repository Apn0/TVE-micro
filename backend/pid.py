import time

class PID:
    def __init__(self, kp, ki, kd, setpoint=0, sample_time=0.1, output_limits=(0, 100)):
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.setpoint = setpoint
        self.sample_time = sample_time
        self.min_out, self.max_out = output_limits
        
        self._last_time = time.time()
        self._last_input = None
        self._integral = 0

    def reset(self):
        """Reset integrator and derivative history."""
        self._integral = 0
        self._last_input = None
        self._last_time = time.time()

    def compute(self, input_val):
        now = time.time()
        dt = now - self._last_time
        
        if dt < self.sample_time:
            return None # Too soon

        # Error calculation
        error = self.setpoint - input_val

        # Derivative term
        d_input = 0 if self._last_input is None else (input_val - self._last_input) / dt

        # Integral term proposal (apply after saturation logic)
        proposed_integral = self._integral + error * dt

        # Compute unsaturated output
        unsat_output = (self.kp * error) + (self.ki * proposed_integral) - (self.kd * d_input)

        # Saturate output
        output = max(min(unsat_output, self.max_out), self.min_out)

        # Anti-windup: only accept integral update if it helps drive output away from saturation
        at_upper_limit = output >= self.max_out and unsat_output >= self.max_out
        at_lower_limit = output <= self.min_out and unsat_output <= self.min_out
        if not (at_upper_limit and error > 0) and not (at_lower_limit and error < 0):
            self._integral = max(min(proposed_integral, self.max_out), self.min_out)

        # State updates
        self._last_input = input_val
        self._last_time = now
        
        return output
