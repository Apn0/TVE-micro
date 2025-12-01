"""Locust scenarios for TVE-micro backend APIs.

Use headless mode for CI/regression-style checks or the web UI for manual runs.
Set --host to the URL of the Flask/gunicorn service (e.g. http://pi-host:5000).
"""

import random
from locust import HttpUser, between, task

CONTROL_TARGETS = [(210.0, 220.0), (225.0, 230.0), (240.0, 245.0)]
HEATER_DUTIES = [25.0, 35.0, 45.0, 55.0]
MOTOR_RPMS = [0, 600, 1200, 1800]


class MonitoringUser(HttpUser):
    """Simulates dashboard polling for temperatures and status."""

    wait_time = between(0.2, 0.6)

    @task(5)
    def read_data(self):
        self.client.get("/api/data", name="GET /api/data")

    @task(1)
    def read_status(self):
        self.client.get("/api/status", name="GET /api/status")


class ControlUser(HttpUser):
    """Simulates operator adjustments to temperatures and motors."""

    wait_time = between(1.0, 2.0)

    @task(2)
    def set_targets(self):
        z1, z2 = random.choice(CONTROL_TARGETS)  # nosec B311
        self.client.post(
            "/api/control",
            json={"command": "SET_TARGET", "value": {"z1": z1, "z2": z2}},
            name="POST /api/control:set_target",
        )

    @task(2)
    def set_motors(self):
        rpm = random.choice(MOTOR_RPMS)  # nosec B311
        motor = random.choice(["main", "feed"])  # nosec B311
        self.client.post(
            "/api/control",
            json={"command": "SET_MOTOR", "value": {"motor": motor, "rpm": rpm}},
            name="POST /api/control:set_motor",
        )

    @task(1)
    def set_heater(self):
        zone = random.choice(["z1", "z2"])  # nosec B311
        duty = random.choice(HEATER_DUTIES)  # nosec B311
        self.client.post(
            "/api/control",
            json={"command": "SET_HEATER", "value": {"zone": zone, "duty": duty}},
            name="POST /api/control:set_heater",
        )

    @task(1)
    def set_mode(self):
        mode = random.choice(["AUTO", "MANUAL"])  # nosec B311
        self.client.post(
            "/api/control",
            json={"command": "SET_MODE", "value": {"mode": mode}},
            name="POST /api/control:set_mode",
        )


class LoggingUser(HttpUser):
    """Simulates enabling/disabling logging while polling data."""

    wait_time = between(5.0, 10.0)

    @task(2)
    def start_logging(self):
        self.client.post("/api/log/start", name="POST /api/log/start")
        self.client.get("/api/data", name="GET /api/data")

    @task(1)
    def stop_logging(self):
        self.client.post("/api/log/stop", name="POST /api/log/stop")
        self.client.get("/api/status", name="GET /api/status")


class GpioUser(HttpUser):
    """Exercises GPIO mode/value endpoints to catch regressions."""

    wait_time = between(2.0, 4.0)

    @task
    def toggle_gpio(self):
        pin = random.choice([17, 22, 27])  # nosec B311
        value = random.choice([0, 1])  # nosec B311
        self.client.post(
            "/api/gpio",
            json={"command": "SET_GPIO_VALUE", "value": {"pin": pin, "value": value}},
            name="POST /api/gpio:set_value",
        )
        self.client.get("/api/gpio", name="GET /api/gpio")


def on_start(environment):
    """Log the selected host for traceability in headless runs."""

    environment.events.request.fire(
        request_type="INFO",
        name="host",
        response_time=0,
        response_length=0,
        exception=None,
        context={"host": environment.host},
    )
