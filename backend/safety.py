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
        if state["temps"]["motor"] > self.LIMITS["temp_motor_max"]:
            return self._trigger_alarm("MOTOR OVERHEAT")

        # 3. Runaway Heater
        if state["temps"]["t2"] > self.LIMITS["temp_heaters_max"] or \
           state["temps"]["t3"] > self.LIMITS["temp_heaters_max"]:
            return self._trigger_alarm("HEATER THERMAL RUNAWAY")

        return True, "OK"

    def _trigger_alarm(self, reason):
        self.alarm_active = True
        self.alarm_reason = reason
        return False, reason

    def reset(self):
        self.alarm_active = False
        self.alarm_reason = None
