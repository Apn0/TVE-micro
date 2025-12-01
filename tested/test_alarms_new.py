
import unittest
import json
import os
import time
from unittest.mock import MagicMock
from backend import app
from backend.alarm_utils import ALARM_FILE

class TestAlarmSystem(unittest.TestCase):
    def setUp(self):
        # Mock HAL
        app.hal = MagicMock()
        app.hal.get_button_state.return_value = False
        app.hal.pwm_channels = {}

        # Reset state
        app.state["active_alarms"] = []
        app.state["alarm_history"] = []
        app.state["status"] = "READY"
        app.alarm_clear_pending = False

        if os.path.exists(ALARM_FILE):
            os.remove(ALARM_FILE)

    def tearDown(self):
        if os.path.exists(ALARM_FILE):
            os.remove(ALARM_FILE)

    def test_latch_alarm(self):
        app._latch_alarm("TEMP_DATA_STALE")

        self.assertEqual(len(app.state["active_alarms"]), 1)
        self.assertEqual(app.state["active_alarms"][0]["type"], "TEMP_DATA_STALE")
        self.assertEqual(app.state["active_alarms"][0]["severity"], "WARNING")
        self.assertEqual(app.state["status"], "ALARM")

        # Check persistence file
        with open(ALARM_FILE, "r") as f:
            saved = json.load(f)
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0]["type"], "TEMP_DATA_STALE")

    def test_critical_alarm(self):
        app._latch_alarm("EMERGENCY_STOP_BTN")
        self.assertEqual(app.state["active_alarms"][0]["severity"], "CRITICAL")

    def test_acknowledge_alarm(self):
        app._latch_alarm("TEMP_DATA_STALE")
        alarm_id = app.state["active_alarms"][0]["id"]

        # Simulate API call with 'value' dict, not flat
        with app.app.test_request_context():
            client = app.app.test_client()
            # Note: app.py control() expects data.get("value", {})
            res = client.post("/api/control", json={"command": "ACKNOWLEDGE_ALARM", "value": {"alarm_id": alarm_id}})
            self.assertEqual(res.status_code, 200)

            self.assertTrue(app.state["active_alarms"][0]["acknowledged"])
            self.assertTrue(app.state["alarm_history"][0]["acknowledged"])

    def test_clear_alarm(self):
        app._latch_alarm("TEMP_DATA_STALE")
        client = app.app.test_client()

        # Acknowledge first
        alarm_id = app.state["active_alarms"][0]["id"]
        client.post("/api/control", json={"command": "ACKNOWLEDGE_ALARM", "value": {"alarm_id": alarm_id}})

        # Clear
        client.post("/api/control", json={"command": "CLEAR_ALARM", "value": {}})

        # In the real app, the control loop processes 'alarm_clear_pending'.
        # We need to simulate that or verify the flag is set.
        self.assertTrue(app.alarm_clear_pending)

        # Simulate loop action
        with app.state_lock:
             for alarm in app.state["active_alarms"]:
                alarm["cleared"] = True
             app.state["active_alarms"] = []
             app.state["status"] = "READY"

        self.assertEqual(len(app.state["active_alarms"]), 0)
        self.assertEqual(app.state["status"], "READY")

if __name__ == "__main__":
    unittest.main()
