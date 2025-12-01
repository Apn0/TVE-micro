import unittest
from unittest import mock
import time
import backend.app as app_module
from backend.app import app, state, state_lock

class TestColdExtrusion(unittest.TestCase):
    def setUp(self):
        # Reset app state
        app_module.shutdown()
        with state_lock:
            state["status"] = "READY"
            state["mode"] = "AUTO"
            state["active_alarms"] = []
            state["motors"]["main"] = 0.0
            state["temps"] = {"t1": 25, "t2": 25, "t3": 25, "motor": 25}
            state["temps_timestamp"] = time.time()

        app_module.running_event.set()
        app_module.startup()
        self.client = app.test_client()
        self.hal = app_module.hal

        # Configure safety rules via mocking if needed, but defaults should block cold extrusion
        # Defaults: MIN_TEMP usually > 170 for extrusion?
        # Let's check backend/safety.py or config defaults.
        # safety.py uses config.

    def tearDown(self):
        app_module.shutdown()

    def test_set_motor_fails_when_cold(self):
        """Test that SET_MOTOR fails in AUTO mode if temps are low."""

        # Ensure we are in AUTO
        with state_lock:
            state["mode"] = "AUTO"

        # Mock temps to be low (below likely threshold of ~170)
        low_temps = {"t1": 25.0, "t2": 25.0, "t3": 25.0, "motor": 25.0}
        with mock.patch.object(self.hal, "get_temps", return_value=low_temps):
             # Also need to update state["temps"] because control loop might update it,
             # but SET_MOTOR handler looks at state["temps"] via safety.guard_motor_temp(temps)
             # Wait, app.py SET_MOTOR handler:
             # with state_lock: temps = dict(state["temps"])
             # ... if request_time - temps_timestamp > 0 ... guard_motor_temp(temps)

             with state_lock:
                 state["temps"] = low_temps
                 state["temps_timestamp"] = time.time()

             resp = self.client.post("/api/control", json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": 10.0}})

             self.assertEqual(resp.status_code, 400)
             self.assertIn("COLD_EXTRUSION", resp.json["msg"])
             self.assertEqual(self.hal.motors["main"], 0.0)

    def test_set_motor_works_when_hot(self):
        """Test that SET_MOTOR works in AUTO mode if temps are high."""

        # Mock temps to be high
        hot_temps = {"t1": 200.0, "t2": 200.0, "t3": 200.0, "motor": 40.0}

        with state_lock:
            state["temps"] = hot_temps
            state["temps_timestamp"] = time.time()

        # We need to ensure safety.py allows it.
        # Assuming defaults allow > 175 or similar.

        resp = self.client.post("/api/control", json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": 10.0}})

        if resp.status_code != 200:
             print(f"Failed with: {resp.json}")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.hal.motors["main"], 10.0)

if __name__ == '__main__':
    unittest.main()
