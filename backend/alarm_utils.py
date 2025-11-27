
import json
import os
import time
import uuid

ALARM_FILE = "alarms.json"

def load_alarms_from_disk():
    if not os.path.exists(ALARM_FILE):
        return []
    try:
        with open(ALARM_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_alarms_to_disk(history):
    try:
        # Limit history to last 1000 entries to prevent infinite growth
        to_save = history[-1000:]
        with open(ALARM_FILE, "w") as f:
            json.dump(to_save, f, indent=2)
    except Exception as e:
        print(f"Failed to save alarms: {e}")

def create_alarm_object(reason, severity="WARNING"):
    return {
        "id": str(uuid.uuid4()),
        "type": reason,
        "severity": severity,
        "message": reason, # Can be enriched later
        "timestamp": time.time(),
        "acknowledged": False,
        "cleared": False
    }
