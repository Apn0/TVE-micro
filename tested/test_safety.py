import unittest
from unittest.mock import MagicMock
from backend.safety import SafetyMonitor
import math

class TestSafetyMonitor(unittest.TestCase):
    def setUp(self):
        self.safety = SafetyMonitor()
        self.hal_mock = MagicMock()
        self.hal_mock.is_motor_fault.return_value = False

        self.state = {
            "temps": {
                "t1": 25.0,
                "t2": 200.0,
                "t3": 200.0,
                "motor": 40.0
            }
        }

    def test_happy_path(self):
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertTrue(is_safe)
        self.assertEqual(reason, "OK")
        self.assertFalse(self.safety.alarm_active)

    def test_motor_driver_fault(self):
        self.hal_mock.is_motor_fault.return_value = True
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertIn("DM556 DRIVER FAULT", reason)
        self.assertTrue(self.safety.alarm_active)

    def test_motor_sensor_missing(self):
        self.state["temps"]["motor"] = None
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertEqual(reason, "MOTOR_TEMP_SENSOR_FAILURE")

    def test_motor_overheat(self):
        self.state["temps"]["motor"] = 70.0 # Above 65.0 limit
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertEqual(reason, "MOTOR OVERHEAT")

    def test_heater_sensor_missing(self):
        self.state["temps"]["t2"] = None
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertEqual(reason, "HEATER_SENSOR_FAILURE")

        self.state["temps"]["t2"] = 200.0
        self.state["temps"]["t3"] = float('nan')
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertEqual(reason, "HEATER_SENSOR_FAILURE")

    def test_heater_thermal_runaway(self):
        self.state["temps"]["t2"] = 300.0 # Above 280.0 limit
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertEqual(reason, "HEATER THERMAL RUNAWAY")

    def test_guard_motor_temp_happy(self):
        # Heaters > 170
        is_safe, reason = self.safety.guard_motor_temp(self.state["temps"])
        self.assertTrue(is_safe)
        self.assertEqual(reason, "OK")

    def test_guard_motor_temp_cold(self):
        self.state["temps"]["t2"] = 100.0
        is_safe, reason = self.safety.guard_motor_temp(self.state["temps"])
        self.assertFalse(is_safe)
        self.assertEqual(reason, "COLD_EXTRUSION_PROTECTION")

    def test_guard_motor_temp_missing_sensor(self):
        self.state["temps"]["t3"] = None
        is_safe, reason = self.safety.guard_motor_temp(self.state["temps"])
        self.assertFalse(is_safe)
        self.assertEqual(reason, "HEATER_SENSOR_FAILURE")

    def test_reset(self):
        self.safety.alarm_active = True
        self.safety.alarm_reason = "Test"
        self.safety.reset()
        self.assertFalse(self.safety.alarm_active)
        self.assertIsNone(self.safety.alarm_reason)

    def test_safe_temp_helper(self):
        # Direct test of private helper if needed, or rely on public methods
        # Testing odd inputs via public methods
        self.state["temps"]["motor"] = "invalid"
        is_safe, reason = self.safety.check(self.state, self.hal_mock)
        self.assertFalse(is_safe)
        self.assertEqual(reason, "MOTOR_SENSOR_FAILURE")

if __name__ == '__main__':
    unittest.main()
