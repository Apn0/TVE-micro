
import unittest
from backend import app as app_module
from backend.app import app, hal

class TestGpioApi(unittest.TestCase):
    def setUp(self):
        app.testing = True
        self.client = app.test_client()
        app_module.startup()
        self.hal = app_module.hal

    def tearDown(self):
        app_module.shutdown()

    def test_gpio_get_status(self):
        response = self.client.get('/api/gpio')
        self.assertEqual(response.status_code, 200)
        json_data = response.get_json()
        self.assertTrue(json_data['success'])
        self.assertIn('status', json_data)

    def test_gpio_status_includes_all_header_pins(self):
        response = self.client.get('/api/gpio')
        self.assertEqual(response.status_code, 200)
        json_data = response.get_json()
        self.assertTrue(json_data['success'])

        pins = {int(pin) for pin in json_data['status'].keys()}
        for pin in (2, 3, 4, 17, 27):
            self.assertIn(pin, pins)

    def test_gpio_set_mode(self):
        # This test will only work on a Raspberry Pi
        if self.hal.platform != "PI":
            self.skipTest("GPIO tests require Raspberry Pi hardware")

        response = self.client.post('/api/gpio', json={
            'command': 'SET_GPIO_MODE',
            'value': {'pin': 17, 'mode': 'OUT'}
        })
        self.assertEqual(response.status_code, 200)
        json_data = response.get_json()
        self.assertTrue(json_data['success'])

        # Verify the change
        response = self.client.get('/api/gpio')
        json_data = response.get_json()
        self.assertEqual(json_data['status']['17']['mode'], 'OUT')

    def test_gpio_set_value(self):
        # This test will only work on a Raspberry Pi
        if self.hal.platform != "PI":
            self.skipTest("GPIO tests require Raspberry Pi hardware")

        # First, set the pin to output mode
        self.client.post('/api/gpio', json={
            'command': 'SET_GPIO_MODE',
            'value': {'pin': 17, 'mode': 'OUT'}
        })

        # Then, set the value
        response = self.client.post('/api/gpio', json={
            'command': 'SET_GPIO_VALUE',
            'value': {'pin': 17, 'value': 1}
        })
        self.assertEqual(response.status_code, 200)
        json_data = response.get_json()
        self.assertTrue(json_data['success'])

        # Verify the change
        response = self.client.get('/api/gpio')
        json_data = response.get_json()
        self.assertEqual(json_data['status']['17']['value'], 1)

if __name__ == '__main__':
    unittest.main()
