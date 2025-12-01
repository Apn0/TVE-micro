import unittest
import json
import os
import tempfile
from unittest.mock import patch

# Import app. This will execute module-level code, so we need to ensure it passes.
# It will load existing config.json or defaults.
from backend import app

class TestConfigHardening(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.test_dir.name, "config.json")
        # Patch the CONFIG_FILE in the already imported app module
        self.patcher = patch('backend.app.CONFIG_FILE', self.config_path)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.test_dir.cleanup()

    def test_load_valid_config(self):
        valid_config = {
            "z1": {"kp": 10.0, "ki": 0.5, "kd": 2.0},
            "logging": {"interval": 1.0}
        }
        with open(self.config_path, 'w') as f:
            json.dump(valid_config, f)

        cfg = app.load_config()
        self.assertEqual(cfg['z1']['kp'], 10.0)
        self.assertEqual(cfg['logging']['interval'], 1.0)

    def test_load_malformed_json(self):
        with open(self.config_path, 'w') as f:
            f.write("{ invalid json")

        # Should catch JSON error and return defaults
        # We also expect it to print errors/log, but we care about the return value being safe
        cfg = app.load_config()

        # Verify we got defaults
        self.assertIn("z1", cfg)
        self.assertIn("kp", cfg["z1"])
        self.assertEqual(cfg["z1"]["kp"], 5.0) # Default from config.json/hardware.py

    def test_load_empty_config(self):
        with open(self.config_path, 'w') as f:
            f.write("{}")

        cfg = app.load_config()
        self.assertIn("z1", cfg)
        self.assertEqual(cfg["z1"]["kp"], 5.0)

    def test_partial_config(self):
        # Missing z2
        partial = {
            "z1": {"kp": 123.0}
        }
        with open(self.config_path, 'w') as f:
            json.dump(partial, f)

        cfg = app.load_config()
        self.assertEqual(cfg['z1']['kp'], 123.0)
        self.assertIn("z2", cfg) # Should fill in z2 default
        self.assertEqual(cfg["z2"]["kp"], 5.0)

    def test_invalid_types(self):
        # Providing a string where a number is expected
        bad_types = {
            "z1": {"kp": "not a number"},
            "logging": {"interval": -5} # Invalid interval
        }
        with open(self.config_path, 'w') as f:
            json.dump(bad_types, f)

        cfg = app.load_config()
        # Should fallback to defaults for invalid fields
        self.assertEqual(cfg['z1']['kp'], 5.0) # Default
        self.assertEqual(cfg['logging']['interval'], 0.25) # Default (assuming 0.25 is default)

if __name__ == '__main__':
    unittest.main()
