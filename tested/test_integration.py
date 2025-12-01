
import unittest
import time
import backend.app as app_module
from backend.app import app, state, state_lock

class TestApp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Initialize HAL once
        app_module.startup()

    @classmethod
    def tearDownClass(cls):
        app_module.shutdown()

    def setUp(self):
        app.testing = True
        self.client = app.test_client()
        # Reset state for each test
        with state_lock:
             state["status"] = "READY"
             state["alarm_msg"] = ""
             state["motors"]["main"] = 0.0
             state["motors"]["feed"] = 0.0

        # Access the global hal from app_module
        self.hal = app_module.hal

        # Mock HAL button methods/attributes for simulation
        if self.hal:
            self.hal._sim_btn_start = False
            self.hal._sim_btn_emergency = False

    def test_start_sequence(self):
        # 1. Start from READY
        if not self.hal:
             self.fail("HAL not initialized")

        # Initially READY
        with state_lock:
             state["status"] = "READY"

        self.hal._sim_btn_start = True
        time.sleep(0.5)
        pass

    def test_config_sequence(self):
        resp = self.client.post('/api/control', json={
            "command": "UPDATE_EXTRUDER_SEQ",
            "value": {
                "sequence": {
                    "startup": [
                        {"device": "feed_motor", "action": "on", "delay": 10.0, "enabled": True}
                    ]
                }
            }
        })
        self.assertEqual(resp.status_code, 200)
        startup = app_module.sys_config["extruder_sequence"].get("startup", [])
        delay = next((s.get("delay") for s in startup if s.get("device") == "feed_motor"), None)
        self.assertEqual(delay, 10.0)

if __name__ == '__main__':
    unittest.main()
