import unittest
from unittest.mock import MagicMock, patch

# Provide a more complete mock for SYSTEM_DEFAULTS to satisfy app.py validation logic
real_defaults = {
    "z1": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "z2": {"kp": 5.0, "ki": 0.1, "kd": 10.0},
    "dm556": {"microsteps": 3200, "current_peak": 3.2, "idle_half": True},
    "pins": {},
    "pwm": {"enabled": False, "channels": {}},
    "sensors": {},
    "adc": {"enabled": True},
    "temp_settings": {},
    "logging": {},
    "motion": {},
    "extruder_sequence": {"startup": [], "shutdown": [], "emergency": []}
}

mock_hardware = MagicMock()
mock_hardware.SYSTEM_DEFAULTS = real_defaults
mock_hardware.HardwareInterface = MagicMock()

with patch.dict('sys.modules', {'backend.hardware': mock_hardware, 'backend.logger': MagicMock()}):
    from backend import app

class TestAPIValidation(unittest.TestCase):
    def setUp(self):
        self.app = app.app.test_client()
        self.app.testing = True

    def test_validate_payload_helper(self):
        if not hasattr(app, '_validate_payload'):
            self.skipTest("_validate_payload not yet implemented")

        schema = {
            "rpm": {"type": float, "min": 0, "max": 5000, "required": True},
            "motor": {"type": str, "allowed": ["main", "feed"], "required": True},
            "optional": {"type": int, "min": 1}
        }

        valid_data = {"rpm": 100, "motor": "main"}
        cleaned, errors = app._validate_payload(valid_data, schema)
        self.assertEqual(errors, [])
        self.assertEqual(cleaned["rpm"], 100.0)

        invalid_data = {"rpm": 6000, "motor": "main"}
        cleaned, errors = app._validate_payload(invalid_data, schema)
        self.assertTrue(len(errors) > 0)
        self.assertIn("rpm must be <= 5000", errors[0])

if __name__ == '__main__':
    unittest.main()
