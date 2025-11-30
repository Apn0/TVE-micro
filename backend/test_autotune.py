# file: backend/test_autotune.py
import unittest
from unittest.mock import MagicMock
from backend.autotune import AutoTuner

class TestAutoTuner(unittest.TestCase):
    def setUp(self):
        self.tuner = AutoTuner()

    def test_initial_state(self):
        self.assertEqual(self.tuner.state, "IDLE")
        self.assertFalse(self.tuner.active)

    def test_start_sequence(self):
        self.tuner.start("z1", 100.0)
        self.assertTrue(self.tuner.active)
        self.assertEqual(self.tuner.state, "HEATING")
        self.assertEqual(self.tuner.setpoint, 100.0)
        self.assertEqual(self.tuner.zone_name, "z1")

    def test_heating_phase_output(self):
        self.tuner.start("z1", 100.0, tune_power=70.0)
        output = self.tuner.update(90.0)
        self.assertEqual(output, 70.0)
        self.assertEqual(self.tuner.state, "HEATING")

    def test_switch_to_cooling(self):
        self.tuner.start("z1", 100.0)
        self.tuner.hysteresis = 0.5

        # Still heating
        self.tuner.update(100.0)
        self.assertEqual(self.tuner.state, "HEATING")

        # Cross threshold
        output = self.tuner.update(100.6)
        self.assertEqual(self.tuner.state, "COOLING")
        # In cooling, output should be min (0.0)
        self.assertEqual(output, 0.0)

    def test_switch_to_heating(self):
        self.tuner.start("z1", 100.0)
        self.tuner.state = "COOLING"
        self.tuner._local_extremum = 105.0 # Mock peak

        # Still cooling
        self.tuner.update(100.0)
        self.assertEqual(self.tuner.state, "COOLING")

        # Cross lower threshold
        output = self.tuner.update(99.4)
        self.assertEqual(self.tuner.state, "HEATING")
        self.assertEqual(output, 70.0)

    def test_cycle_counting(self):
        self.tuner.start("z1", 100.0)
        self.tuner.hysteresis = 0.5

        # 1. Heat up -> Cool
        self.tuner.update(100.6) # Switch to COOLING
        self.assertEqual(self.tuner.cycle_count, 0)

        # 2. Cool down -> Heat (Cycle +0.5)
        self.tuner.update(99.4) # Switch to HEATING
        self.assertEqual(self.tuner.cycle_count, 0.5)

        # 3. Heat up -> Cool
        self.tuner.update(100.6)
        self.assertEqual(self.tuner.cycle_count, 0.5)

        # 4. Cool down -> Heat (Cycle +0.5 -> 1.0)
        self.tuner.update(99.4)
        self.assertEqual(self.tuner.cycle_count, 1.0)

    def test_calculation(self):
        # Inject fake peaks to simulate a perfect oscillation
        # Amp = 10 (Max 110, Min 90), Period = 10s
        self.tuner.start("z1", 100.0, tune_power=50.0)
        self.tuner.active = True
        self.tuner.peaks = [
            {"t": 10, "val": 110, "type": "max"},
            {"t": 15, "val": 90, "type": "min"},
            {"t": 20, "val": 110, "type": "max"},
            {"t": 25, "val": 90, "type": "min"},
            {"t": 30, "val": 110, "type": "max"},
        ]

        success = self.tuner._calculate_result()
        self.assertTrue(success)

        # Period = 10s
        self.assertAlmostEqual(self.tuner.detected_params["Pu"], 10.0)

        # Amplitude = (110 - 90)/2 = 10
        self.assertAlmostEqual(self.tuner.detected_params["amplitude"], 10.0)

        # Ku = 4*d / pi*a = 4*50 / 31.4159 = 200 / 31.4159 ~= 6.366
        self.assertAlmostEqual(self.tuner.detected_params["Ku"], 6.366, places=2)

if __name__ == '__main__':
    unittest.main()
