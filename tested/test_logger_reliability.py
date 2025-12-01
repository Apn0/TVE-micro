import unittest
import math
from unittest.mock import MagicMock, patch

# We want to test DataLogger in isolation
from backend.logger import DataLogger

class TestLoggerReliability(unittest.TestCase):
    def setUp(self):
        self.logger = DataLogger()
        self.logger.log_dir = "/tmp/test_logs"
        self.logger.writer = MagicMock()
        self.logger.file_handle = MagicMock()
        self.logger.recording = True
        self.logger.buffer = []
        self.logger.max_buffer_size = 10 # Small buffer for testing

    def test_nan_filtering(self):
        # backend/logger.py already has some logic, we want to verify and improve it
        # _validate_numeric_field and _format_val usage.

        # Passing None
        val = self.logger._validate_numeric_field(None, "test")
        self.assertIsNone(val)

        # Passing string
        val = self.logger._validate_numeric_field("abc", "test")
        self.assertIsNone(val)

        # Passing NaN float
        val = self.logger._validate_numeric_field(float('nan'), "test")
        # Depending on implementation, it might return None or raise
        # The existing implementation:
        # try: return float(value) except...
        # float('nan') is a float.
        # But _format_val handles NaN.

        # Let's check _format_val
        self.assertEqual(self.logger._format_val(None), "NAN")
        self.assertEqual(self.logger._format_val(float('nan')), "NAN")
        self.assertEqual(self.logger._format_val("abc"), "NAN")
        self.assertEqual(self.logger._format_val(1.2345), "1.23")

    def test_buffer_cap(self):
        # Simulate filling buffer
        for i in range(15):
            self.logger.buffer.append([i])

        # Call _apply_backpressure
        self.logger._apply_backpressure(make_room_for=1)

        # Should drop oldest to fit
        # allowed = 10 - 1 = 9
        self.assertLessEqual(len(self.logger.buffer), 9)

    def test_write_failure_enospc(self):
        # Mock writer to raise OSError ENOSPC
        self.logger.writer.writerows.side_effect = OSError(28, "No space left on device")

        self.logger.buffer = [[1], [2]]

        # Attempt flush
        # It should catch OSError and not crash
        try:
            self.logger._write_buffer_with_retries()
        except Exception as e:
            self.fail(f"Logger crashed on ENOSPC: {e}")

if __name__ == '__main__':
    unittest.main()
