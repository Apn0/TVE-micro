import unittest
from unittest import mock
import time
import backend.app as app_module
from backend.app import app, state, state_lock, relay_toggle_times

class TestColdExtrusion(unittest.TestCase):
    def setUp(self):
        # Reset app state
        app_module.shutdown()

        # Reset toggle times to avoid debounce issues
        relay_toggle_times.clear()

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

    def tearDown(self):
        app_module.shutdown()

    def test_set_motor_fails_when_cold(self):
        """Test that SET_MOTOR fails in AUTO mode if temps are low."""

        # Ensure we are in AUTO
        with state_lock:
            state["mode"] = "AUTO"

        # Mock temps to be low
        low_temps = {"t1": 25.0, "t2": 25.0, "t3": 25.0, "motor": 25.0}
        with mock.patch.object(self.hal, "get_temps", return_value=low_temps):
             with state_lock:
                 state["temps"] = low_temps
                 state["temps_timestamp"] = time.time()

             resp = self.client.post("/api/control", json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": 10.0}})

             self.assertEqual(resp.status_code, 400)
             self.assertIn("COLD_EXTRUSION", resp.json["msg"])
             self.assertEqual(self.hal.motors["main"], 0.0)

    def test_set_motor_works_when_hot(self):
        """Test that SET_MOTOR works in AUTO mode if temps are high."""

        # Manually clear debounce just in case
        relay_toggle_times.clear()

        # Mock temps to be high
        hot_temps = {"t1": 200.0, "t2": 200.0, "t3": 200.0, "motor": 40.0}

        with state_lock:
            state["temps"] = hot_temps
            state["temps_timestamp"] = time.time()

        resp = self.client.post("/api/control", json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": 10.0}})

        if resp.status_code != 200:
             print(f"Failed with: {resp.json}")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.hal.motors["main"], 10.0)

if __name__ == '__main__':
    unittest.main()
