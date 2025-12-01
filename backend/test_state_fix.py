import unittest
import time
from unittest.mock import MagicMock, patch

# Mock hardware fully with correct nested keys
mock_hardware = MagicMock()
mock_hardware.SYSTEM_DEFAULTS = {
    "z1": {"kp": 5, "ki": 0.1, "kd": 10},
    "z2": {"kp": 5, "ki": 0.1, "kd": 10},
    "dm556": {"microsteps": 3200, "current_peak": 3.2, "idle_half": True},
    "pins": {},
    "pwm": {"enabled": False, "channels": {}},
    "sensors": {
        "0": {"enabled": True, "logical": "t1", "wiring": "direct"},
        "1": {"enabled": True, "logical": "t2", "wiring": "direct"}
    },
    "adc": {"enabled": True},
    "temp_settings": {"poll_interval": 0.1, "freshness_timeout": 5.0},
    "logging": {"interval": 1.0, "flush_interval": 60.0},
    "motion": {},
    "extruder_sequence": {"startup": [], "shutdown": [], "emergency": []}
}
mock_hardware.HardwareInterface = MagicMock()

with patch.dict('sys.modules', {'backend.hardware': mock_hardware, 'backend.logger': MagicMock()}):
    from backend import app

class TestStateFix(unittest.TestCase):
    def setUp(self):
        # Reset state for each test
        app.state["status"] = "READY"
        app.state["active_alarms"] = []
        app.hal = MagicMock()
        # Ensure buttons are unpressed
        app.hal.get_button_state.return_value = False
        # Ensure temps are fresh enough to avoid stale data alarm
        app.hal.get_temps.return_value = {"t1": 25, "t2": 25, "t3": 25}
        app.hal.get_last_temp_timestamp.return_value = time.time()
        # Mock get_sensor_timestamp to return valid float
        app.hal.get_sensor_timestamp.return_value = time.time()

        app.running_event.set()

        # Stop background threads if any
        app._control_stop.set()
        if app._control_thread:
            app._control_thread.join(0.1)

    def test_state_fix_invalid_state(self):
        # Set an invalid state
        app.state["status"] = "INVALID_STATE_XYZ"

        # Mock safety to always pass to avoid alarm triggers
        app.safety.check = MagicMock(return_value=(True, None))
        app.safety.guard_motor_temp = MagicMock(return_value=(True, None))

        # Mock time.sleep to break the infinite loop after one iteration
        with patch('backend.app.time.sleep', side_effect=InterruptedError("Stop loop")):
            try:
                app._control_stop.clear()
                app.control_loop()
            except InterruptedError:
                pass

        # After one iteration, the status should be reset to READY
        self.assertEqual(app.state["status"], "READY")

if __name__ == '__main__':
    unittest.main()
