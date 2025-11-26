import math


class SafetyMonitor:
    def __init__(self):
        self.LIMITS = {
            "temp_motor_max": 65.0,     # NEMA23 Overheat
            "temp_heaters_max": 280.0,  # MICA Melt limit
            "min_temp_for_motor": 170.0 # Cold Extrusion Protection
        }
        self.alarm_active = False
        self.alarm_reason = None

    def check(self, state, hal):
        """Returns (is_safe, reason)"""
        
        # 1. Hardware Motor Fault (DM556 Alarm Signal)
        if hal.is_motor_fault():
            return self._trigger_alarm("DM556 DRIVER FAULT (Check Blinks)")

        # 2. Motor Overheat
        motor_temp = self._safe_temp(state["temps"], "motor")

        if motor_temp is None:
            return self._trigger_alarm("MOTOR_SENSOR_FAILURE")

        if motor_temp > self.LIMITS["temp_motor_max"]:
            return self._trigger_alarm("MOTOR OVERHEAT")

        # 3. Runaway Heater
        t2 = self._safe_temp(state["temps"], "t2")
        t3 = self._safe_temp(state["temps"], "t3")

        if t2 is None or t3 is None:
            return self._trigger_alarm("HEATER_SENSOR_FAILURE")

        if t2 > self.LIMITS["temp_heaters_max"] or t3 > self.LIMITS["temp_heaters_max"]:
            return self._trigger_alarm("HEATER THERMAL RUNAWAY")

        return True, "OK"

    def guard_motor_temp(self, temps):
        """Ensure heaters are hot enough before allowing motor to run."""

        t2 = self._safe_temp(temps, "t2")
        t3 = self._safe_temp(temps, "t3")

        # Ensure both heater sensors are reporting before starting.
        if t2 is None or t3 is None:
            return self._trigger_alarm("HEATER_SENSOR_FAILURE")

        min_heater_temp = min(t2, t3)

        if min_heater_temp < self.LIMITS["min_temp_for_motor"]:
            return self._trigger_alarm("COLD_EXTRUSION_PROTECTION")

        return True, "OK"

    def _trigger_alarm(self, reason):
        self.alarm_active = True
        self.alarm_reason = reason
        return False, reason

    def _safe_temp(self, temps, key):
        """Return numeric temp value or None if missing/invalid."""

        value = temps.get(key)

        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None

        if math.isnan(value):
            return None

        return value

    def reset(self):
        self.alarm_active = False
        self.alarm_reason = None
