// file: frontend/src/App.jsx
import React, { useState, useEffect } from "react";

import useKeypad from "./hooks/useKeypad";
import KeypadOverlay from "./components/KeypadOverlay";

// Styles stay here so all components share them
export const styles = {
  layout: { display: "flex", height: "100vh", background: "#121212", fontFamily: "Segoe UI, sans-serif", position: "relative" },
  sidebar: { width: "200px", background: "#1e1e1e", borderRight: "1px solid #333", display: "flex", flexDirection: "column" },
  content: { flex: 1, padding: "30px", overflowY: "auto" },
  navBtn: (active) => ({
    padding: "20px", background: active ? "#3498db" : "transparent",
    color: active ? "white" : "#aaa", border: "none", textAlign: "left",
    cursor: "pointer", fontSize: "1.1em", fontWeight: "bold",
    borderBottom: "1px solid #333",
  }),
  panel: { background: "#1e1e1e", borderRadius: "8px", padding: "20px", marginBottom: "20px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  metricBig: { fontSize: "2em", fontWeight: "bold", color: "#fff" },
  label: { color: "#aaa", fontSize: "0.75em", textTransform: "uppercase" },
  button: { padding: "10px 20px", background: "#3498db", border: "none", borderRadius: "4px", color: "white", cursor: "pointer", fontWeight: "bold", marginRight: "10px" },
  buttonDanger: { padding: "10px 20px", background: "#e74c3c", border: "none", borderRadius: "4px", color: "white", cursor: "pointer", fontWeight: "bold", marginRight: "10px" },
  buttonSecondary: { padding: "8px 14px", background: "#2c3e50", border: "none", borderRadius: "4px", color: "#ecf0f1", cursor: "pointer", fontWeight: "bold", marginRight: "8px", fontSize: "0.9em" },
  input: { background: "#000", border: "1px solid #555", color: "white", padding: "5px", width: "60px", textAlign: "center" },
  alarmOverlay: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(192,57,43,0.9)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  disconnectOverlay: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.8)", zIndex: 998, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  statusBar: { position: "absolute", bottom: 0, left: 0, right: 0, background: "#111", borderTop: "1px solid #333", padding: "6px 16px", fontSize: "0.8em", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#aaa" },
  row: { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #333" },
  manualBanner: { background: "#f39c12", color: "black", padding: "10px", fontWeight: "bold", marginBottom: "20px", borderRadius: "4px" },

  // DIP switch visualizer
  dipBlock: { background: "#c0392b", padding: "10px", borderRadius: 4, display: "inline-flex", gap: 5, border: "2px solid #fff" },
  dipLabel: { color: "white", fontSize: "0.7em", textAlign: "center", marginBottom: 2 },
  dipSwitch: { width: 20, height: 40, background: "#ecf0f1", position: "relative", borderRadius: 2 },
  dipKnob: (s) => ({
    width: 16, height: 16, background: "#2c3e50", position: "absolute",
    left: 2, top: s ? 22 : 2, transition: "top 0.2s", borderRadius: 2
  }),
};

// Components
import Nav from "./components/Nav";
import HomeScreen from "./components/HomeScreen";
import MotorScreen from "./components/MotorScreen";
import HeaterScreen from "./components/HeaterScreen";
import HistoryScreen from "./components/HistoryScreen";
import TestScreen from "./components/TestScreen";
import SensorsScreen from "./components/SensorsScreen";
import SettingsScreen from "./components/SettingsScreen";
import GpioScreen from "./components/GpioScreen";

function App() {
  const [view, setView] = useState("HOME");
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const keypad = useKeypad();

  // Status polling
  useEffect(() => {
    let stop = false;

    async function poll() {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();

        if (!stop) {
          setData(json);
          setError("");

          const entry = {
            t: Date.now(),
            temps: json.state?.temps || {},
            relays: json.state?.relays || {},
            motors: json.state?.motors || {},
          };
          setHistory((prev) => {
            const next = [...prev, entry];
            return next.length > 600 ? next.slice(next.length - 600) : next;
          });
        }
      } catch (e) {
        if (!stop) setError("Lost connection: " + e.message);
      } finally {
        if (!stop) setTimeout(poll, 1000);
      }
    }

    poll();
    return () => { stop = true; };
  }, []);

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
      setError("Cmd error: " + e.message);
      throw e;
    }
  };

  return (
    <div style={styles.layout}>
      <Nav current={view} setView={setView} />

      {data ? (
        <div style={styles.content}>
          {view === "HOME" && <HomeScreen data={data} sendCmd={sendCmd} />}
          {view === "MOTOR" && <MotorScreen data={data} sendCmd={sendCmd} />}
          {view === "HEATERS" && (
            <HeaterScreen data={data} sendCmd={sendCmd} history={history} />
          )}
          {view === "HISTORY" && <HistoryScreen history={history} />}
          {view === "I/O TEST" && <TestScreen data={data} sendCmd={sendCmd} />}
          {view === "SENSORS" && <SensorsScreen data={data} sendCmd={sendCmd} />}
          {view === "GPIO" && <GpioScreen data={data} sendCmd={sendCmd} />}
          {view === "SETTINGS" && <SettingsScreen data={data} sendCmd={sendCmd} />}
        </div>
      ) : (
        <div style={styles.disconnectOverlay}>
          <div style={{ color: "#f1c40f", fontSize: "1.5em" }}>Connecting…</div>
        </div>
      )}

      <div style={styles.statusBar}>
        <div>
          {error ? <span style={{ color: "#e74c3c" }}>{error}</span> :
          message ? <span style={{ color: "#2ecc71" }}>{message}</span> :
          "Backend: " + (data ? "connected" : "connecting…")}
        </div>
        <div>Mini Hackstruder HMI · v0.4</div>
      </div>
    <KeypadOverlay
      visible={keypad.visible}
      position={keypad.position}
      value={keypad.value}
      setValue={keypad.setValue}
      submit={keypad.submit}
      close={keypad.closeKeypad}
    />

    </div>
  );
}

export default App;
