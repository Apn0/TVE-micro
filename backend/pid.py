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
        self._last_input = 0
        self._integral = 0

    def compute(self, input_val):
        now = time.time()
        dt = now - self._last_time
        
        if dt < self.sample_time:
            return None # Too soon

        # Error calculation
        error = self.setpoint - input_val
        
        # Integral term (with clamping)
        self._integral += error * dt
        self._integral = max(min(self._integral, self.max_out), self.min_out) # Anti-windup
        
        # Derivative term
        d_input = (input_val - self._last_input) / dt if dt > 0 else 0
        
        # Compute Output
        output = (self.kp * error) + (self.ki * self._integral) - (self.kd * d_input)
        output = max(min(output, self.max_out), self.min_out)
        
        # State updates
        self._last_input = input_val
        self._last_time = now
        
        return output
