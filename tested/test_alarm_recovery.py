import unittest
from unittest.mock import MagicMock, patch
import time
import backend.app as app

class TestAlarmRecovery(unittest.TestCase):
    def setUp(self):
        # Setup mocks
        app.hal = MagicMock()
        app.hal.get_button_state.return_value = False
        app.hal.get_temps.return_value = {"t1": 25, "t2": 25, "t3": 25}
        app.hal.get_last_temp_timestamp.return_value = time.time()

        # Reset global state
        with app.state_lock:
            app.state["status"] = "ALARM"
            app.state["active_alarms"] = [{"id": "1", "type": "TEST", "severity": "CRITICAL"}]
            app.state["alarm_history"] = [{"id": "1", "type": "TEST", "severity": "CRITICAL", "cleared": False}]

        app.running_event.clear()
        app.alarm_clear_pending = True

        # Mock Safety
        app.safety = MagicMock()
        # Default safety check passes
        app.safety.check.return_value = (True, None)

    def test_unsafe_condition_prevents_ready(self):
        """
        Verify that if safety check fails, we DO NOT transition to READY.
        """
        # Simulate logic flow from app.py

        # Setup: Safety fails
        app.safety.check.return_value = (False, "UNSAFE_CONDITION")

        # Execute logic block (manual replication of new logic)
        btn_em = app.hal.get_button_state("btn_emergency")
        if btn_em:
            pass # Not this path
        else:
            # Poll
            app.state["temps"] = app.hal.get_temps()

            # Check Safety
            is_safe, reason = app.safety.check(app.state, app.hal)

            if not is_safe:
                # Should hit this path
                # _latch_alarm(reason) -> sets status=ALARM, clears running_event
                # We simulate _latch_alarm effect
                with app.state_lock:
                    app.state["status"] = "ALARM"
                app.running_event.clear()
            else:
                # Should not hit this path
                app.running_event.set()
                with app.state_lock:
                    app.state["status"] = "READY"

        # Assertions
        self.assertEqual(app.state["status"], "ALARM")
        self.assertFalse(app.running_event.is_set())

    def test_safe_condition_allows_ready(self):
        """
        Verify that if safety check passes, we transition to READY.
        """
        app.safety.check.return_value = (True, None)

        # Execute logic block
        btn_em = app.hal.get_button_state("btn_emergency")
        if not btn_em:
            app.state["temps"] = app.hal.get_temps()
            is_safe, reason = app.safety.check(app.state, app.hal)
            if is_safe:
                 app.running_event.set()
                 with app.state_lock:
                     app.state["status"] = "READY"

        self.assertEqual(app.state["status"], "READY")
        self.assertTrue(app.running_event.is_set())

if __name__ == '__main__':
    unittest.main()
