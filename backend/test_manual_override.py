
import unittest
import time
from unittest.mock import patch, MagicMock
import backend.app as app_module
from backend.app import app, state

class TestManualOverride(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Startup app with simulated hardware
        app_module.startup()

    @classmethod
    def tearDownClass(cls):
        app_module.shutdown()

    def setUp(self):
        app.testing = True
        self.client = app.test_client()
        # Ensure we are in a clean state
        self.client.post("/api/control", json={"command": "CLEAR_ALARM", "value": {}})
        self.client.post("/api/control", json={"command": "SET_MODE", "value": {"mode": "MANUAL"}})

        # Ensure hal is started
        app_module._ensure_hal_started()

    def test_manual_mode_bypasses_cold_extrusion(self):
        """
        Test that in MANUAL mode, the motor can be started even if heaters are cold.
        This verifies the fix for allowing manual motor checks without heating.
        """
        # 1. Set mode to MANUAL (done in setUp)

        # 2. Mock temps to be valid but cold (25.0 C)
        current_time = time.time()

        with app_module.state_lock:
            app_module.state["temps"] = {"t1": 25.0, "t2": 25.0, "t3": 25.0, "motor": 25.0}
            app_module.state["temps_timestamp"] = current_time
            app_module.state["mode"] = "MANUAL"

        # 3. Attempt to start motor
        resp = self.client.post(
            "/api/control",
            json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": 10.0}},
        )

        # 4. Assert success
        self.assertEqual(resp.status_code, 200, "Should succeed in MANUAL mode despite low temps")
        data = resp.get_json()
        self.assertTrue(data["success"])

if __name__ == "__main__":
    unittest.main()
