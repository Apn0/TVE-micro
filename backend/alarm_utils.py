
import json
import time
import uuid
from pathlib import Path

ALARM_FILE = Path(__file__).resolve().parent / "alarms.json"


def load_alarms_from_disk():
    if not ALARM_FILE.exists():
        return []

    try:
        with ALARM_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_alarms_to_disk(history):
    try:
        ALARM_FILE.parent.mkdir(parents=True, exist_ok=True)
        to_save = history[-1000:]
        tmp_path = ALARM_FILE.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(to_save, f, indent=2)
        tmp_path.replace(ALARM_FILE)
    except OSError as exc:
        print(f"Failed to save alarms: {exc}")


def create_alarm_object(reason, severity="WARNING"):
    return {
        "id": str(uuid.uuid4()),
        "type": reason,
        "severity": severity,
        "message": reason,  # Can be enriched later
        "timestamp": time.time(),
        "acknowledged": False,
        "cleared": False,
    }
