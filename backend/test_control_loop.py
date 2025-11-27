import time
import unittest
from unittest import mock

import backend.app as app_module
from backend.app import app, running_event, state, state_lock


class ControlLoopEdgeTests(unittest.TestCase):
    def setUp(self):
        app_module.shutdown()
        with state_lock:
            state["status"] = "READY"
            state["alarm_msg"] = ""
            state["motors"]["main"] = 0.0
            state["motors"]["feed"] = 0.0
            state["seq_start_time"] = 0.0
        app_module.running_event.set()
        app_module.startup()
        self.client = app.test_client()
        self.hal = app_module.hal
        self.assertIsNotNone(self.hal)

        self._orig_poll = app_module.sys_config["temp_settings"].get("poll_interval", 0.25)
        seq_cfg = app_module.sys_config.get("extruder_sequence", {})
        self._orig_start_delay = seq_cfg.get("start_delay_feed", 2.0)
        self._orig_stop_delay = seq_cfg.get("stop_delay_motor", 5.0)
        self._orig_check_temp = seq_cfg.get("check_temp_before_start", True)
        app_module.sys_config["extruder_sequence"]["check_temp_before_start"] = False
        seq_cfg["start_delay_feed"] = 0.1
        seq_cfg["stop_delay_motor"] = 0.1
        seq_cfg["check_temp_before_start"] = False

        app_module.safety.reset()
        app_module._all_outputs_off()
        app_module.last_btn_start_state = False
        app_module.last_btn_stop_state = False
        app_module._set_status("READY")

        self._wait_for_status("READY")

        self.hal._sim_btn_start = False
        self.hal._sim_btn_emergency = False
        self.hal._sim_btn_stop = False

    def tearDown(self):
        app_module.sys_config["temp_settings"]["poll_interval"] = self._orig_poll
        seq_cfg = app_module.sys_config.get("extruder_sequence", {})
        seq_cfg["start_delay_feed"] = self._orig_start_delay
        seq_cfg["stop_delay_motor"] = self._orig_stop_delay
        seq_cfg["check_temp_before_start"] = self._orig_check_temp
        app_module.shutdown()

    def _wait_for_status(self, expected: str, timeout: float = 2.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with state_lock:
                current = state["status"]
            if current == expected:
                return
            time.sleep(0.05)
        self.fail(f"State did not reach {expected}, last={current}")

    def _pulse_start_button(self):
        self.hal._sim_btn_start = True
        time.sleep(0.05)
        self.hal._sim_btn_start = False

    def _pulse_stop_button(self):
        self.hal._sim_btn_stop = True
        time.sleep(0.05)
        self.hal._sim_btn_stop = False

    @unittest.skip("Start button edge timing relies on background loop stability in simulation")
    def test_start_button_edge_processed_between_polls(self):
        app_module.sys_config["temp_settings"]["poll_interval"] = 1.0
        seq_cfg = app_module.sys_config.get("extruder_sequence", {})
        seq_cfg["start_delay_feed"] = 0.1

        with state_lock:
            state["status"] = "STOPPING"
            state["seq_start_time"] = time.time() - 5.0

        self._wait_for_status("READY")

        # Press and release the start button for a short pulse between polls
        self.hal._sim_btn_start = True
        time.sleep(0.05)
        self.hal._sim_btn_start = False

        deadline = time.time() + 2.0
        while time.time() < deadline:
            with state_lock:
                if state["status"] in ("STARTING", "RUNNING"):
                    break
            time.sleep(0.05)

        with state_lock:
            self.assertIn(state["status"], ("STARTING", "RUNNING"))

        deadline = time.time() + 2.0
        while time.time() < deadline:
            with state_lock:
                if state["status"] == "RUNNING":
                    break
            time.sleep(0.05)
        with state_lock:
            self.assertEqual(state["status"], "RUNNING")

    def test_alarm_latches_outputs_until_cleared(self):
        seq_cfg = app_module.sys_config.get("extruder_sequence", {})
        seq_cfg["start_delay_feed"] = 0.05
        seq_cfg["stop_delay_motor"] = 0.05

        self.hal.set_motor_rpm("main", 80.0)
        self.hal.set_motor_rpm("feed", 60.0)
        with state_lock:
            state["motors"]["main"] = 80.0
            state["motors"]["feed"] = 60.0
            state["status"] = "RUNNING"

        app_module._latch_alarm("UNIT_TEST")
        time.sleep(0.1)

        with state_lock:
            self.assertEqual(state["status"], "ALARM")
        self.assertFalse(app_module.running_event.is_set())
        self.assertEqual(self.hal.motors.get("main"), 0.0)
        self.assertEqual(self.hal.motors.get("feed"), 0.0)

        # Try to start while alarm is active; state and outputs should remain latched
        self.hal._sim_btn_start = True
        time.sleep(0.05)
        self.hal._sim_btn_start = False
        time.sleep(0.1)

        with state_lock:
            self.assertEqual(state["status"], "ALARM")
        self.assertEqual(self.hal.motors.get("main"), 0.0)
        self.assertEqual(self.hal.motors.get("feed"), 0.0)

        resp = self.client.post("/api/control", json={"command": "CLEAR_ALARM"})
        self.assertEqual(resp.status_code, 200)

        deadline = time.time() + 1.0
        while time.time() < deadline and not app_module.running_event.is_set():
            time.sleep(0.05)

        with state_lock:
            self.assertEqual(state["status"], "READY")
            self.assertEqual(state["alarm_msg"], "")
        deadline = time.time() + 1.0
        while time.time() < deadline and not app_module.running_event.is_set():
            time.sleep(0.05)
        self.assertTrue(app_module.running_event.is_set())
        self.assertEqual(self.hal.motors.get("main"), 0.0)
        self.assertEqual(self.hal.motors.get("feed"), 0.0)

    def test_none_temps_force_safe_outputs_and_alarm(self):
        app_module.sys_config["temp_settings"]["poll_interval"] = 0.05
        with state_lock:
            state["mode"] = "AUTO"
            state["status"] = "RUNNING"
            state["target_z1"] = 100.0
            state["target_z2"] = 100.0
            state["temps_timestamp"] = 0.0

        self.hal.set_heater_duty("z1", 50.0)
        self.hal.set_heater_duty("z2", 50.0)
        self.hal.set_motor_rpm("main", 80.0)
        self.hal.set_motor_rpm("feed", 60.0)

        with (
            mock.patch.object(self.hal, "get_temps", return_value={k: None for k in ("t1", "t2", "t3", "motor")}),
            mock.patch.object(self.hal, "get_sensor_timestamp", return_value=0.0),
            mock.patch.object(self.hal, "get_last_temp_timestamp", return_value=0.0),
        ):
            self._wait_for_status("ALARM", timeout=3.0)

        self.assertFalse(app_module.running_event.is_set())
        self.assertEqual(self.hal.heaters.get("z1"), 0.0)
        self.assertEqual(self.hal.heaters.get("z2"), 0.0)
        self.assertEqual(self.hal.motors.get("main"), 0.0)
        self.assertEqual(self.hal.motors.get("feed"), 0.0)

    def test_stale_temps_gate_pid_outputs(self):
        now = time.time()
        app_module.sys_config["temp_settings"]["poll_interval"] = 0.05
        with state_lock:
            state["mode"] = "AUTO"
            state["status"] = "RUNNING"
            state["target_z1"] = 120.0
            state["target_z2"] = 120.0
            state["temps_timestamp"] = 0.0

        with (
            mock.patch.object(self.hal, "get_temps", return_value={"t1": 25.0, "t2": 50.0, "t3": 50.0, "motor": 25.0}),
            mock.patch.object(self.hal, "get_sensor_timestamp", return_value=now - 10.0),
            mock.patch.object(self.hal, "get_last_temp_timestamp", return_value=now - 10.0),
        ):
            self._wait_for_status("ALARM", timeout=3.0)

        self.assertFalse(app_module.running_event.is_set())
        self.assertEqual(self.hal.heaters.get("z1"), 0.0)
        self.assertEqual(self.hal.heaters.get("z2"), 0.0)
        self.assertEqual(self.hal.motors.get("main"), 0.0)
        self.assertEqual(self.hal.motors.get("feed"), 0.0)
    def test_ready_state_remains_stable_without_commands(self):
        time.sleep(0.2)

        with state_lock:
            self.assertEqual(state["status"], "READY")
            self.assertEqual(state["seq_start_time"], 0.0)
            self.assertEqual(state["motors"]["main"], 0.0)
            self.assertEqual(state["motors"]["feed"], 0.0)
        self.assertTrue(app_module.running_event.is_set())

        time.sleep(0.2)
        with state_lock:
            self.assertEqual(state["status"], "READY")
        self.assertTrue(app_module.running_event.is_set())

    def test_explicit_stop_follows_running_state(self):
        self._pulse_start_button()
        self._wait_for_status("RUNNING")

        # Ensure RUNNING remains steady without additional input
        time.sleep(0.2)
        with state_lock:
            self.assertEqual(state["status"], "RUNNING")

        # Stop button press requests a stop
        self._pulse_stop_button()
        self._wait_for_status("READY")

        with state_lock:
            self.assertEqual(state["status"], "READY")
            self.assertEqual(state["motors"]["main"], 0.0)
            self.assertEqual(state["motors"]["feed"], 0.0)
        self.assertTrue(app_module.running_event.is_set())


if __name__ == "__main__":
    unittest.main()
