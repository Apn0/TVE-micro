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

    def test_emit_change_numeric_type_noise(self):
        # Store initial numeric state as int and update with small float drift
        self.state["temps"]["t1"] = 20
        app_module.emit_change("temps", "t1", 20.0005, self.state)
        # Should dampen tiny drift even though types differ
        app_module.socketio.emit.assert_not_called()
        self.assertEqual(self.state["temps"]["t1"], 20.0005)

        # A larger numeric change should still emit
        app_module.emit_change("temps", "t1", 20.1, self.state)
        app_module.socketio.emit.assert_called_once()

if __name__ == '__main__':
    unittest.main()
