import math
import unittest

import backend.app as app_module
from backend.app import app


class TestControlValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app_module.startup()

    @classmethod
    def tearDownClass(cls):
        app_module.shutdown()

    def setUp(self):
        app.testing = True
        self.client = app.test_client()
        self.client.post("/api/control", json={"command": "CLEAR_ALARM", "value": {}})

    def test_rejects_invalid_heater_duty(self):
        resp = self.client.post(
            "/api/control",
            json={"command": "SET_HEATER", "value": {"zone": "z1", "duty": math.nan}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_excessive_motor_rpm(self):
        resp = self.client.post(
            "/api/control",
            json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": 999999}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_nan_motor_rpm(self):
        resp = self.client.post(
            "/api/control",
            json={"command": "SET_MOTOR", "value": {"motor": "main", "rpm": math.nan}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_negative_pid_values(self):
        resp = self.client.post(
            "/api/control",
            json={"command": "UPDATE_PID", "value": {"zone": "z1", "params": {"kp": -1}}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_non_finite_pid_values(self):
        resp = self.client.post(
            "/api/control",
            json={
                "command": "UPDATE_PID",
                "value": {"zone": "z1", "params": {"kp": math.inf, "ki": math.nan}},
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_invalid_pwm_duty(self):
        resp = self.client.post(
            "/api/control",
            json={"command": "SET_PWM_OUTPUT", "value": {"name": "fan", "duty": 200}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_nan_pwm_duty(self):
        resp = self.client.post(
            "/api/control",
            json={"command": "SET_PWM_OUTPUT", "value": {"name": "fan", "duty": math.nan}},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_invalid_extruder_sequence(self):
        resp = self.client.post(
            "/api/control",
            json={
                "command": "UPDATE_EXTRUDER_SEQ",
                "value": {"sequence": {"start_delay_feed": -5}},
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_nan_pid_value(self):
        resp = self.client.post(
            "/api/control",
            json={
                "command": "UPDATE_PID",
                "value": {"zone": "z1", "params": {"kp": math.nan}},
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_invalid_temp_settings(self):
        resp = self.client.post(
            "/api/control",
            json={
                "command": "SET_TEMP_SETTINGS",
                "value": {"params": {"poll_interval": math.nan}},
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])

    def test_rejects_invalid_logging_settings(self):
        resp = self.client.post(
            "/api/control",
            json={
                "command": "SET_LOGGING_SETTINGS",
                "value": {"params": {"interval": None}},
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
