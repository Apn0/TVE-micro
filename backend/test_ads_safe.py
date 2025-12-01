import unittest
from unittest.mock import MagicMock
from backend.hardware import ADS1115Driver

class TestADSSafe(unittest.TestCase):
    def setUp(self):
        import sys
        self.mock_smbus = MagicMock()
        sys.modules['smbus'] = self.mock_smbus
        sys.modules['smbus2'] = self.mock_smbus

        self.driver = ADS1115Driver()
        self.driver.available = True
        self.driver.bus = MagicMock()

    def test_temp_none_on_voltage_none(self):
        self.driver.bus.write_i2c_block_data.side_effect = Exception("I2C Error")
        val = self.driver.read_voltage(0, retries=0)
        self.assertIsNone(val)

    def test_log_spam(self):
        from backend import hardware
        hardware.hardware_logger = MagicMock()

        self.driver.bus.write_i2c_block_data.side_effect = Exception("I2C Error")

        # 1st fail
        self.driver.read_voltage(0, retries=0)
        self.assertEqual(hardware.hardware_logger.warning.call_count, 1)

        # 2nd fail - should NOT log warning again
        self.driver.read_voltage(0, retries=0)
        self.assertEqual(hardware.hardware_logger.warning.call_count, 1)

if __name__ == '__main__':
    unittest.main()
