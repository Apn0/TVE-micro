
import json
import time
import uuid
from pathlib import Path

ALARM_FILE = Path(__file__).resolve().parent / "alarms.json"


def load_alarms_from_disk():
    """
    Loads the alarm history from the persistent disk file.

    Returns:
        list: A list of alarm dictionaries loaded from the file. Returns an empty list
              if the file does not exist or is corrupted.
    """
    if not ALARM_FILE.exists():
        return []

    try:
        with ALARM_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_alarms_to_disk(history):
    """
    Saves the provided alarm history list to the persistent disk file.

    This function maintains a rolling window of the last 1000 alarms to prevent unlimited growth.
    It writes to a temporary file first and then atomically renames it to ensure data integrity.

    Args:
        history (list): A list of alarm dictionaries to save.
    """
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
    """
    Creates a new alarm object with a unique ID and current timestamp.

    Args:
        reason (str): The cause or description of the alarm.
        severity (str, optional): The severity level of the alarm (e.g., "WARNING", "CRITICAL").
                                  Defaults to "WARNING".

    Returns:
        dict: A dictionary representing the alarm containing:
            - id (str): Unique UUID string.
            - type (str): The alarm type/reason.
            - severity (str): The severity level.
            - message (str): The alarm message (initially same as reason).
            - timestamp (float): Unix timestamp of creation.
            - acknowledged (bool): Initialized to False.
            - cleared (bool): Initialized to False.
    """
    return {
        "id": str(uuid.uuid4()),
        "type": reason,
        "severity": severity,
        "message": reason,  # Can be enriched later
        "timestamp": time.time(),
        "acknowledged": False,
        "cleared": False,
    }
