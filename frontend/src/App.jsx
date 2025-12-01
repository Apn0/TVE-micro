// file: frontend/src/App.jsx
import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

import useKeypad from "./hooks/useKeypad";
import KeypadOverlay from "./components/KeypadOverlay";
import { styles } from "./styles";

// Components
import Nav from "./components/Nav";
import HomeScreen from "./components/HomeScreen";
import MotorScreen from "./components/MotorScreen";
import HeaterScreen from "./components/HeaterScreen";
import HistoryScreen from "./components/HistoryScreen";
import TestScreen from "./components/TestScreen";
import SensorsScreen from "./components/SensorsScreen";
import SettingsScreen from "./components/SettingsScreen";
import GPIOControlScreen from "./components/GPIOControlScreen";
import WiringCalibrationScreen from "./components/WiringCalibrationScreen";
import AlarmsScreen from "./components/AlarmsScreen";

// 1. Create this hook function OUTSIDE of your App component (or inside, but above return)
function useHybridData(mode) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  // Poll Mode Effect
  useEffect(() => {
    if (mode !== 'POLLING') return;
    console.log("Switched to POLLING mode");

    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (!stop) setData(json);
      } catch (e) {
        if (!stop) setError("Poll error: " + e.message);
      } finally {
        if (!stop) setTimeout(poll, 1000);
      }
    };
    poll();
    return () => { stop = true; };
  }, [mode]);

  // Socket Mode Effect
  useEffect(() => {
    if (mode !== 'SOCKET') return;
    console.log("Switched to SOCKET mode");

    // 1. Fetch full state ONCE to initialize
    fetch("/api/status").then(r => r.json()).then(setData).catch(e => setError(e.message));

    // 2. Open Socket
    // We assume the socket server is on the same host/port as the API if proxied,
    // or if we are in dev mode, we might need to point to localhost:5000.
    // Given the Vite proxy setup, connecting to window.location.host should work if proxied correctly for WS,
    // OR we point directly to the Flask backend. The guide says "http://localhost:5000".
    // For robustness in dev vs prod, let's try to infer or just use the hardcoded one if instructed.
    // The guide says: `const socket = io("http://localhost:5000"); // Adjust URL if needed`
    // Since we are running on a Pi likely accessed via IP, localhost might fail if the browser is remote.
    // It should be `window.location.hostname + ":5000"` if we are accessing port 3000 but want port 5000,
    // OR if we are using the proxy, just path.
    // However, the guide explicitly said `io("http://localhost:5000")`. I will use a smarter default that works for remote access.
    // If we are on port 3000 (dev), we want port 5000 on the same hostname.
    // However, with Nginx proxying /socket.io, we can just use relative path (or empty io()).
    // io() will connect to the same host:port as the page.
    // If served via Nginx (port 80), it connects to port 80, and Nginx proxies /socket.io -> 5000.
    // If dev server (port 3000), we still need to point to 5000 directly unless we setup proxy in Vite too.
    // But for production (Nginx), `io()` is best.
    // To support both: if port is 3000, force 5000. If port is 80 (prod), use auto-detect.

    let socket;
    if (window.location.port === "3000") {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        socket = io(`${protocol}//${hostname}:5000`);
    } else {
        socket = io(); // Auto-detect (uses Nginx proxy)
    }

    socketRef.current = socket;

    socket.on("connect", () => {
      setError("");
      console.log("WS Connected");
    });

    socket.on("io_update", (packet) => {
      // packet = { category: "temps", key: "t1", val: 23.5 }
      setData((prev) => {
        if (!prev) return prev;
        // Deep copy state to ensure React triggers re-render
        // We need to be careful with deep copying.
        const next = { ...prev, state: { ...prev.state } };

        // Ensure category exists
        if (!next.state[packet.category]) {
            next.state[packet.category] = {};
        } else {
            next.state[packet.category] = { ...next.state[packet.category] };
        }

        // Update value
        next.state[packet.category][packet.key] = packet.val;
        return next;
      });
    });

    socket.on("disconnect", () => setError("WS Disconnected"));

    return () => socket.disconnect();
  }, [mode]);

  return { data, error };
}

/**
 * App Component.
 *
 * The root component of the frontend application.
 * Manages global state (polling, history, alarms, navigation) and routes to specific screens.
 * Handles API communication and global error/status display.
 */
function App() {
  const [view, setView] = useState("HOME");
  // NEW: State for the toggle
  const [commMode, setCommMode] = useState("SOCKET");

  // NEW: Use the hook instead of the old useEffect
  const { data, error: pollError } = useHybridData(commMode);

  const [message, setMessage] = useState("");
  // We can merge pollError into a general error display or keep them separate.
  // The original app had a single `error` state.
  // Let's use `pollError` if `error` is empty, or manage it locally.
  const [cmdError, setCmdError] = useState("");
  const error = cmdError || pollError;

  const [history, setHistory] = useState([]);
  const HISTORY_RETENTION_MS = 1000 * 60 * 60 * 24 * 7; // keep a rolling 7-day window
  const keypad = useKeypad();

  // Initial historic data fetch
  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/history/sensors");
        if (res.ok) {
           const json = await res.json();
           if (Array.isArray(json)) {
             setHistory(json);
           }
        }
      } catch (e) {
        console.error("Failed to load sensor history", e);
      }
    }
    fetchHistory();
  }, []);

  // Ref to hold the latest data without triggering re-renders of the timer
  const latestDataRef = useRef(data);

  // Sync ref with data
  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  // History Timer - Runs once on mount, never resets
  useEffect(() => {
    const timer = setInterval(() => {
      const currentData = latestDataRef.current; // Read from ref

      if (!currentData) return;

      const entry = {
        t: Date.now(),
        temps: currentData.state?.temps || {},
        relays: currentData.state?.relays || {},
        motors: currentData.state?.motors || {},
        fans: currentData.state?.fans || currentData.state?.cooling || {},
        pwm: currentData.state?.pwm || {},
        manual_duty_z1: currentData.state?.manual_duty_z1,
        manual_duty_z2: currentData.state?.manual_duty_z2,
        target_z1: currentData.state?.target_z1,
        target_z2: currentData.state?.target_z2,
        status: currentData.state?.status,
        mode: currentData.state?.mode,
      };

      setHistory((prev) => {
        const cutoff = entry.t - HISTORY_RETENTION_MS;
        const trimmed = prev.filter((h) => h.t >= cutoff);
        return [...trimmed, entry];
      });
    }, 1000); // Sample rate: 1 second

    return () => clearInterval(timer);
  }, []); // Empty dependency array ensures timer is stable

  const sendCmd = async (command, value = {}) => {
    setMessage("");
    try {
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value }),
      });
      const json = await res.json();
      if (!json.success && json.ok !== true) throw new Error(json.msg || "Failed");

      setMessage(command + " OK");
      return json;
    } catch (e) {
      setCmdError("Cmd error: " + e.message);
      throw e;
    }
  };

  const activeAlarms = data?.state?.active_alarms || [];
  const alarmHistory = data?.state?.alarm_history || [];

  // Critical alarm overlay logic
  const criticalAlarm = activeAlarms.find(
    (a) => a.severity === "CRITICAL" && !a.acknowledged
  );
  const showCriticalOverlay = !!criticalAlarm && view !== "ALARMS";

  return (
    <div style={styles.layout}>
      <Nav current={view} setView={setView} hasActiveAlarms={activeAlarms.length > 0} />

      {data ? (
        <div style={styles.content}>
        {view === "HOME" && (
            <HomeScreen
              data={data}
              sendCmd={sendCmd}
              keypad={keypad}
              setView={setView}
              history={history}
            />
          )}

          {view === "ALARMS" && (
            <AlarmsScreen
              activeAlarms={activeAlarms}
              alarmHistory={alarmHistory}
              sendCmd={sendCmd}
            />
          )}
          {view === "MOTOR" && (
            <MotorScreen data={data} sendCmd={sendCmd} keypad={keypad} />
          )}
          {view === "HEATERS" && (
            <HeaterScreen
              data={data}
              sendCmd={sendCmd}
              history={history}
              keypad={keypad}
            />
          )}
          {view === "HISTORY" && <HistoryScreen history={history} config={data?.config} />}
          {view === "I/O TEST" && <TestScreen data={data} sendCmd={sendCmd} />}
          {view === "SENSORS" && <SensorsScreen data={data} sendCmd={sendCmd} />}
          {view === "GPIO" && <GPIOControlScreen />}
          {view === "WIRING CALIBRATION" && <WiringCalibrationScreen />}
          {view === "SETTINGS" && <SettingsScreen data={data} sendCmd={sendCmd} />}
        </div>
      ) : (
        <div style={styles.disconnectOverlay}>
          <div style={{ color: "#f1c40f", fontSize: "1.5em" }}>Connecting…</div>
        </div>
      )}

      {showCriticalOverlay && (
         <div style={styles.alarmOverlay}>
            <div style={{ color: "white", fontSize: "2em", fontWeight: "bold", textAlign: "center" }}>
              CRITICAL ALARM
            </div>
            <div style={{ color: "#ecf0f1", marginTop: "10px", fontSize: "1.2em" }}>
              {criticalAlarm.type}
            </div>
            <div style={{ color: "#ccc", marginTop: "5px" }}>
              {criticalAlarm.message}
            </div>
            <button
              style={{
                ...styles.button,
                marginTop: "30px",
                background: "#f1c40f",
                color: "#000",
                fontSize: "1.2em",
                padding: "15px 30px"
              }}
              onClick={() => sendCmd("ACKNOWLEDGE_ALARM", { alarm_id: criticalAlarm.id })}
            >
              ACKNOWLEDGE
            </button>
         </div>
      )}

      <div style={styles.statusBar}>
        <div>
          {error ? <span style={{ color: "#e74c3c" }}>{error}</span> :
          message ? <span style={{ color: "#2ecc71" }}>{message}</span> :
          "Backend: " + (data ? "connected" : "connecting…")}
        </div>

        {/* Toggle Button */}
        <div style={{ zIndex: 2000 }}>
            <button
                onClick={() => setCommMode(prev => prev === 'POLLING' ? 'SOCKET' : 'POLLING')}
                style={{
                padding: "2px 8px",
                background: commMode === 'SOCKET' ? "#27ae60" : "#7f8c8d",
                color: "white",
                border: "1px solid #444",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.8em",
                borderRadius: "4px",
                marginLeft: "10px"
                }}
            >
                {commMode === 'SOCKET' ? '⚡ REAL-TIME' : '🐢 POLLING 1s'}
            </button>
        </div>

        <div>Mini Hackstruder HMI · v0.4</div>
      </div>
        <KeypadOverlay
          visible={keypad.visible}
          position={keypad.position}
          value={keypad.value}
          onKey={keypad.handleKeyPress}
          highlight={keypad.isFirstPress}
          close={keypad.closeKeypad}
        />

    </div>
  );
}

export default App;
