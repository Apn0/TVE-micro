// file: frontend/src/tabs/TestScreen.jsx
import React from "react";
import { styles } from "../App";

function TestScreen({ data, sendCmd }) {
  const relays = data.state?.relays || {};
  const motors = data.state?.motors || {};
  const status = data.state?.status || "READY";

  const ioBox = (label, active, onClick) => (
    <div
      style={{
        borderRadius: "6px",
        padding: "10px",
        background: active ? "#27ae60" : "#2c3e50",
        color: "white",
        textAlign: "center",
        cursor: "pointer",
        border: active ? "1px solid #2ecc71" : "1px solid #34495e",
      }}
      onClick={onClick}
    >
      <div style={{ fontWeight: "bold" }}>{label}</div>
      <div style={{ fontSize: "0.8em", marginTop: "4px" }}>
        {active ? "ON" : "OFF"}
      </div>
    </div>
  );

  return (
    <div>
      <div style={styles.panel}>
        <h2>I/O Test</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Quick test for outputs. Use carefully; no interlocks here except what
          you implement in the backend.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          {ioBox("Fan", relays.fan, () =>
            sendCmd("SET_RELAY", { relay: "fan", state: !relays.fan })
          )}
          {ioBox("Pump", relays.pump, () =>
            sendCmd("SET_RELAY", { relay: "pump", state: !relays.pump })
          )}
          {ioBox("STOP", false, () => sendCmd("EMERGENCY_STOP"))}
        </div>

        <div style={{ marginTop: "20px" }}>
          <div>Status: {status}</div>
          <div>Main RPM: {motors.main?.toFixed(1) ?? "0.0"}</div>
          <div>Feeder RPM: {motors.feed?.toFixed(1) ?? "0.0"}</div>
        </div>
      </div>
    </div>
  );
}

export default TestScreen;
