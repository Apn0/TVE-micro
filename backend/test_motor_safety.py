import unittest
import time
from unittest.mock import MagicMock
from backend.hardware import HardwareInterface

class TestMotorSafety(unittest.TestCase):
    def setUp(self):
        # Mock GPIO to run on any platform
        self.hal = HardwareInterface({})
        self.hal.pins = {"en_main": 5, "en_feed": 6}
        self.hal.platform = "WIN" # Force sim

    def test_dwell_time_turn_on(self):
        """Test that switching motor ON is rate-limited if previously changed."""

        # Initial: OFF
        self.hal.set_motor_rpm("main", 0)
        time.sleep(0.6) # Wait for debounce

        # Turn ON
        self.hal.set_motor_rpm("main", 100)
        self.assertEqual(self.hal.motors["main"], 100.0)

        # Turn OFF (Safety override should allow this)
        self.hal.set_motor_rpm("main", 0)
        self.assertEqual(self.hal.motors["main"], 0.0)

        # Try to turn ON immediately (should be blocked by dwell time of the OFF command)
        self.hal.set_motor_rpm("main", 100)
        self.assertEqual(self.hal.motors["main"], 0.0, "Rapid re-enable should be blocked")

        # Wait
        time.sleep(0.6)

        # Now should work
        self.hal.set_motor_rpm("main", 100)
        self.assertEqual(self.hal.motors["main"], 100.0)

    def test_idempotent_on(self):
        """Test that repeated ON commands are allowed and don't trigger dwell check if state is same."""
        self.hal.set_motor_rpm("main", 100)
        time.sleep(0.6)

        # Send ON again. Should return early (idempotent) and NOT update last_change
        start_time = self.hal._motor_last_change["main"]
        time.sleep(0.1)

        self.hal.set_motor_rpm("main", 100)
        self.assertEqual(self.hal._motor_last_change["main"], start_time, "Timestamp shouldn't update on idempotent call")

        # Verify we can turn off immediately
        self.hal.set_motor_rpm("main", 0)
        self.assertEqual(self.hal.motors["main"], 0.0)

if __name__ == '__main__':
    unittest.main()
