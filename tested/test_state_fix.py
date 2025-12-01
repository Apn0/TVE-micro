import unittest
from unittest.mock import MagicMock
import backend.app as app_module

class TestStateFix(unittest.TestCase):
    def setUp(self):
        # Mock socketio
        app_module.socketio = MagicMock()
        # Ensure state structure matches app.py expectations: dict of dicts
        self.state = {
            "temps": {"t1": 20.0},
            "status": {} # status category
        }

    def test_emit_change_dampening(self):
        # 1. Initial change (None -> 20.0) - Should emit
        self.state["temps"]["t1"] = None
        app_module.emit_change("temps", "t1", 20.0, self.state)
        app_module.socketio.emit.assert_called_once()

        # Check arguments. socketio.emit('event', {payload})
        args, kwargs = app_module.socketio.emit.call_args
        self.assertEqual(args[0], 'io_update')
        payload = args[1]
        self.assertEqual(payload['val'], 20.0)

        app_module.socketio.emit.reset_mock()

        # 2. Small change (< 0.001) - Should NOT emit
        app_module.emit_change("temps", "t1", 20.0005, self.state)
        app_module.socketio.emit.assert_not_called()
        # State should still update!
        self.assertEqual(self.state["temps"]["t1"], 20.0005)

        # 3. Large change (> 0.001) - Should emit
        app_module.emit_change("temps", "t1", 20.1, self.state)
        app_module.socketio.emit.assert_called_once()

    def test_emit_change_non_float(self):
        # Setup: "status" category must exist (handled in setUp)
        # We are testing key="current_status" inside category="status"
        # (or category="system", key="status" depending on usage, but emit_change is generic)

        # Initial set
        app_module.emit_change("status", "current", "READY", self.state)
        app_module.socketio.emit.reset_mock()

        # Same value - No emit
        app_module.emit_change("status", "current", "READY", self.state)
        app_module.socketio.emit.assert_not_called()

        # New value - Emit
        app_module.emit_change("status", "current", "RUNNING", self.state)
        app_module.socketio.emit.assert_called_once()
        
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
