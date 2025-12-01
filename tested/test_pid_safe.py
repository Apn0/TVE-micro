import unittest
import time
import math
from backend.pid import PID

class TestPIDSafe(unittest.TestCase):
    def setUp(self):
        self.pid = PID(kp=1.0, ki=1.0, kd=0.0, setpoint=10.0, sample_time=0.01)

    def test_ignore_none(self):
        time.sleep(0.02)
        out1 = self.pid.compute(0)
        self.assertIsNotNone(out1)

        time.sleep(0.02)
        out2 = self.pid.compute(None)

        self.assertIsNone(out2)
        self.assertTrue(math.isfinite(self.pid._integral))

    def test_ignore_nan(self):
        time.sleep(0.02)
        self.pid.compute(0)
        initial_integral = self.pid._integral

        time.sleep(0.02)
        out = self.pid.compute(float('nan'))

        self.assertIsNone(out)
        self.assertEqual(self.pid._integral, initial_integral)

    def test_ignore_inf(self):
        time.sleep(0.02)
        self.pid.compute(0)

        time.sleep(0.02)
        out = self.pid.compute(float('inf'))
        self.assertIsNone(out)

    def test_smooth_recovery(self):
        time.sleep(0.02)
        out1 = self.pid.compute(0)

        time.sleep(0.05)
        self.pid.compute(None)

        time.sleep(0.02)
        out2 = self.pid.compute(0)

        self.assertIsNotNone(out2)
        self.assertTrue(math.isfinite(out2))

if __name__ == '__main__':
    unittest.main()
