import unittest
import time
from backend.pid import PID

class TestPID(unittest.TestCase):
    def setUp(self):
        # Initialize with known constants
        self.pid = PID(kp=1.0, ki=1.0, kd=1.0, setpoint=10.0, sample_time=0.1, output_limits=(0, 100))

    def test_initialization(self):
        self.assertEqual(self.pid.kp, 1.0)
        self.assertEqual(self.pid.ki, 1.0)
        self.assertEqual(self.pid.kd, 1.0)
        self.assertEqual(self.pid.setpoint, 10.0)
        self.assertEqual(self.pid.min_out, 0)
        self.assertEqual(self.pid.max_out, 100)

    def test_compute_too_soon(self):
        # Call compute immediately after init (should be too soon if sample_time > 0)
        # Note: PID.__init__ sets _last_time = time.time().
        # We need to ensure dt < sample_time.
        output = self.pid.compute(0)
        self.assertIsNone(output)

    def test_proportional_term(self):
        # Only Kp = 1, others 0
        pid = PID(kp=1.0, ki=0.0, kd=0.0, setpoint=10.0, sample_time=0.01)
        time.sleep(0.02) # Wait for sample time

        # Error = 10 - 0 = 10
        # Output = 1 * 10 = 10
        output = pid.compute(0)
        self.assertAlmostEqual(output, 10.0)

    def test_integral_term(self):
        # Only Ki = 1
        pid = PID(kp=0.0, ki=1.0, kd=0.0, setpoint=10.0, sample_time=0.01)
        time.sleep(0.02)

        # First computation
        # Error = 10
        # dt approx 0.02
        # Integral += 10 * 0.02 = 0.2
        # Output = 1 * 0.2 = 0.2
        output1 = pid.compute(0)
        self.assertTrue(output1 > 0)

        time.sleep(0.02)
        # Second computation
        # Error = 10
        # Integral += 10 * 0.02 = 0.4
        # Output = 0.4
        output2 = pid.compute(0)
        self.assertTrue(output2 > output1)

    def test_derivative_term(self):
        # Only Kd = 1
        pid = PID(kp=0.0, ki=0.0, kd=1.0, setpoint=10.0, sample_time=0.01)

        # First call, no derivative (last_input is None)
        time.sleep(0.02)
        pid.compute(0)

        # Second call
        # Input changes from 0 to 5
        # d_input = (5 - 0) / dt
        # dt approx 0.02 -> d_input = 250
        # Output = -1 * 250 = -250 -> clamped to min_out (0)
        time.sleep(0.02)
        output = pid.compute(5)
        self.assertEqual(output, 0) # Clamped

    def test_saturation_max(self):
        pid = PID(kp=100.0, ki=0.0, kd=0.0, setpoint=10.0, output_limits=(0, 100), sample_time=0.01)
        time.sleep(0.02)
        # Error = 10, Output = 1000 -> Clamped to 100
        output = pid.compute(0)
        self.assertEqual(output, 100)

    def test_saturation_min(self):
        pid = PID(kp=1.0, ki=0.0, kd=0.0, setpoint=0.0, output_limits=(0, 100), sample_time=0.01)
        time.sleep(0.02)
        # Input 10 -> Error -10 -> Output -10 -> Clamped to 0
        output = pid.compute(10)
        self.assertEqual(output, 0)

    def test_reset(self):
        pid = PID(kp=0.0, ki=1.0, kd=0.0, setpoint=10.0, sample_time=0.01)
        time.sleep(0.02)
        pid.compute(0)
        # Check integral is non-zero
        self.assertNotEqual(pid._integral, 0)

        pid.reset()
        self.assertEqual(pid._integral, 0)
        self.assertIsNone(pid._last_input)

    def test_anti_windup(self):
        # Set up a PID that will saturate
        pid = PID(kp=1.0, ki=1.0, kd=0.0, setpoint=100.0, output_limits=(0, 10), sample_time=0.01)

        time.sleep(0.02)
        # Error = 100. Kp term = 100. Saturated to 10.
        # Integral term would add 100*dt.
        # Anti-windup should prevent integral from growing blindly if we are already saturated and error is in same direction

        pid.compute(0)
        initial_integral = pid._integral

        time.sleep(0.02)
        pid.compute(0)
        final_integral = pid._integral

        # With anti-windup logic:
        # at_upper_limit = output >= max_out (10 >= 10) AND unsat_output >= max_out (100 >= 10) -> True
        # error > 0 (100 > 0) -> True
        # condition: if not (True and True) ... -> False
        # So integral should NOT update?
        # Let's check logic in pid.py:
        # if not (at_upper_limit and error > 0) and not (at_lower_limit and error < 0):
        #     self._integral = ...

        # So if at upper limit and error positive, we DO NOT update integral. Correct.
        self.assertEqual(initial_integral, final_integral)

if __name__ == '__main__':
    unittest.main()
