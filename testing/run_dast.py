import time
import requests
import json
import threading
import subprocess
import os
import sys

# Configuration
BASE_URL = "http://127.0.0.1:5000"
API_STATUS = f"{BASE_URL}/api/status"
API_DATA = f"{BASE_URL}/api/data"
API_CONTROL = f"{BASE_URL}/api/control"
API_HISTORY = f"{BASE_URL}/api/history/sensors"
API_GPIO = f"{BASE_URL}/api/gpio"
API_LOG_START = f"{BASE_URL}/api/log/start"
API_LOG_STOP = f"{BASE_URL}/api/log/stop"
API_TUNE_START = f"{BASE_URL}/api/tune/start"
API_TUNE_STOP = f"{BASE_URL}/api/tune/stop"
API_TUNE_APPLY = f"{BASE_URL}/api/tune/apply"

# Test Payloads
FUZZ_PAYLOADS = [
    # Empty JSON
    {},
    # Malformed JSON (sent as raw string if possible, handled by request lib usually as valid json but invalid schema)
    # Incorrect types
    {"cmd": 123, "value": "string"},
    {"cmd": "SET_TEMP", "value": None},
    {"cmd": "SET_TEMP", "value": {"invalid": "structure"}},
    # Large payloads
    {"cmd": "A" * 10000, "value": "B" * 10000},
    # Injection strings
    {"cmd": "SET_TEMP'; DROP TABLE users; --", "value": 0},
    {"cmd": "<script>alert(1)</script>", "value": 0},
    {"cmd": "../../../etc/passwd", "value": 0},
    # Boundary values
    {"cmd": "SET_TEMP", "value": -1},
    {"cmd": "SET_TEMP", "value": 999999999999},
]

ENDPOINTS_GET = [
    API_STATUS,
    API_DATA,
    API_HISTORY,
    API_GPIO,
]

ENDPOINTS_POST = [
    (API_CONTROL, {"cmd": "TEST", "value": 1}),
    (API_LOG_START, {}),
    (API_LOG_STOP, {}),
    (API_TUNE_START, {"zone": "z1", "setpoint": 50}),
    (API_TUNE_STOP, {}),
    (API_TUNE_APPLY, {}),
]

def run_fuzzing():
    print("Starting DAST Fuzzing Scan...")
    issues = []

    # 1. Endpoint Availability & Method Check
    print("\n[+] Checking GET Endpoints...")
    for url in ENDPOINTS_GET:
        try:
            res = requests.get(url, timeout=2)
            print(f"    GET {url} -> {res.status_code}")
            if res.status_code >= 500:
                issues.append(f"Server Error (500) on GET {url}")
        except Exception as e:
            issues.append(f"Exception accessing {url}: {e}")

    print("\n[+] Checking POST Endpoints...")
    for url, data in ENDPOINTS_POST:
        try:
            res = requests.post(url, json=data, timeout=2)
            print(f"    POST {url} -> {res.status_code}")
            if res.status_code >= 500:
                issues.append(f"Server Error (500) on POST {url}")
        except Exception as e:
            issues.append(f"Exception accessing {url}: {e}")

    # 2. Fuzzing /api/control
    print("\n[+] Fuzzing /api/control...")
    for payload in FUZZ_PAYLOADS:
        try:
            res = requests.post(API_CONTROL, json=payload, timeout=2)
            if res.status_code >= 500:
                issues.append(f"CRITICAL: Server Error {res.status_code} with payload {payload}")
                print(f"    FAILED: {res.status_code} with {payload}")
            else:
                pass
        except Exception as e:
            issues.append(f"Connection error with payload {payload}: {e}")

    # 3. Fuzzing /api/tune/start
    print("\n[+] Fuzzing /api/tune/start...")
    for payload in FUZZ_PAYLOADS:
        try:
            res = requests.post(API_TUNE_START, json=payload, timeout=2)
            if res.status_code >= 500:
                issues.append(f"CRITICAL: Server Error {res.status_code} on tune/start with payload {payload}")
        except Exception as e:
             pass


    # 4. Fuzzing HTTP Methods
    print("\n[+] Checking Invalid Methods...")
    try:
        res = requests.put(API_STATUS, timeout=2)
        print(f"    PUT {API_STATUS} -> {res.status_code}")
        # 405 is expected
    except:
        pass

    # 5. Check for Information Disclosure (Server Header)
    print("\n[+] Checking Headers...")
    try:
        res = requests.get(API_STATUS)
        server = res.headers.get("Server", "")
        print(f"    Server Header: {server}")
        if "Werkzeug" in server or "Python" in server:
             issues.append(f"Information Disclosure: Server header reveals '{server}'")
    except:
        pass

    print("\n" + "="*30)
    print("SCAN COMPLETE")
    if issues:
        print(f"Found {len(issues)} issues:")
        for i in issues:
            print(f" - {i}")
    else:
        print("No critical issues found.")
    print("="*30)
    return issues

def start_backend():
    p = subprocess.Popen(
        ["python3", "app.py"],
        cwd="backend",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE
    )
    return p

def main():
    print("Starting backend for scan...")
    server_process = start_backend()

    # Wait for server to start
    time.sleep(5)

    if server_process.poll() is not None:
        print("Backend failed to start!")
        print(server_process.stderr.read().decode())
        sys.exit(1)

    try:
        issues = run_fuzzing()
    except Exception as e:
        print(f"Scan failed with error: {e}")
        issues = ["Scan failed"]
    finally:
        print("Stopping backend...")
        server_process.terminate()
        server_process.wait()

    if any("CRITICAL" in i for i in issues):
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
