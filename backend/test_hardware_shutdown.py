
import unittest
import sys
from unittest.mock import MagicMock, patch

class TestHardwareShutdown(unittest.TestCase):
    def setUp(self):
        # Setup mocks
        self.mock_gpio = MagicMock()
        self.mock_gpio.BCM = "BCM"
        self.mock_gpio.OUT = "OUT"
        self.mock_gpio.IN = "IN"
        self.mock_gpio.HIGH = 1
        self.mock_gpio.LOW = 0
        self.mock_gpio.PUD_UP = "PUD_UP"
        self.mock_gpio.PUD_DOWN = "PUD_DOWN"
        self.mock_gpio.PUD_OFF = "PUD_OFF"
        self.mock_output = MagicMock()
        self.mock_gpio.output = self.mock_output

        # We need to ensure that when we reload backend.hardware, it thinks it's on a Pi.
        # This requires RPi.GPIO to be importable.
        self.modules_patcher = patch.dict(sys.modules, {
            'RPi': MagicMock(),
            'RPi.GPIO': self.mock_gpio
        })
        self.modules_patcher.start()

        # Also ensure RPi.GPIO is set on the RPi mock
        sys.modules['RPi'].GPIO = self.mock_gpio

        # Force reload of backend.hardware to pick up the mock
        if 'backend.hardware' in sys.modules:
            del sys.modules['backend.hardware']

        from backend import hardware
        self.hardware_module = hardware
        self.HardwareInterface = hardware.HardwareInterface

        # If the import failed inside hardware.py (which catches ImportError),
        # GPIO will be None. We can manually fix this for the test context
        # because we are controlling the environment.
        if self.hardware_module.GPIO is None:
            self.hardware_module.GPIO = self.mock_gpio
            self.hardware_module.PLATFORM = "PI"

    def tearDown(self):
        self.modules_patcher.stop()

    def test_force_all_off_disables_motors(self):
        """
        Test that _force_all_off sets motor enable pins to HIGH (disabled)
        instead of LOW (enabled), as the drivers are Active LOW.
        """

        # Verify that the hardware module is using our mock
        self.assertIsNotNone(self.hardware_module.GPIO, "backend.hardware.GPIO is None, mocking failed")

        # Configure pins
        pins = {
            "en_main": 17,
            "en_feed": 18,
            "step_main": 5,
            "dir_main": 6,
            "step_feed": 13,
            "dir_feed": 19,
        }

        # Initialize HAL and force platform to PI
        hal = self.HardwareInterface(pins)
        hal.platform = "PI"

        # Reset mock calls from initialization
        self.mock_output.reset_mock()

        # Execute the function under test
        hal._force_all_off()

        # Verify calls
        calls = self.mock_output.call_args_list

        # Verify en_main
        en_main_calls = [c for c in calls if c[0][0] == pins["en_main"]]
        self.assertTrue(len(en_main_calls) > 0, "en_main should be touched during shutdown")
        last_val_main = en_main_calls[-1][0][1]
        self.assertEqual(last_val_main, self.mock_gpio.HIGH,
                         f"en_main should be set to HIGH (disabled), but was set to {last_val_main}")

        # Verify en_feed
        en_feed_calls = [c for c in calls if c[0][0] == pins["en_feed"]]
        self.assertTrue(len(en_feed_calls) > 0, "en_feed should be touched during shutdown")
        last_val_feed = en_feed_calls[-1][0][1]
        self.assertEqual(last_val_feed, self.mock_gpio.HIGH,
                         f"en_feed should be set to HIGH (disabled), but was set to {last_val_feed}")

if __name__ == '__main__':
    unittest.main()
