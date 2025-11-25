// file: frontend/src/tabs/HeaterScreen.jsx
import React, { useState, useEffect } from "react";
import { styles } from "../App";

function HeaterScreen({ data, sendCmd }) {
  const temps = data.state?.temps || {};
  const relays = data.state?.relays || {};
  const [targetZ1, setTargetZ1] = useState(data.state?.target_z1 ?? 0);
  const [targetZ2, setTargetZ2] = useState(data.state?.target_z2 ?? 0);

  useEffect(() => {
    setTargetZ1(data.state?.target_z1 ?? 0);
    setTargetZ2(data.state?.target_z2 ?? 0);
  }, [data.state?.target_z1, data.state?.target_z2]);

  const applyTargets = () => {
    sendCmd("SET_TARGET", { z1: targetZ1, z2: targetZ2 });
  };

  const renderZone = (label, temp, target, onChange, relayOn) => {
    let color = "#7f8c8d";
    if (temp !== null && temp !== undefined) {
      if (temp > target + 15) color = "#e74c3c";
      else if (temp < target - 15) color = "#f39c12";
      else color = "#2ecc71";
    }

    return (
      <div style={{ background: "#111", borderRadius: "6px", padding: "12px" }}>
        <div style={styles.label}>{label}</div>
        <div
          style={{
            fontSize: "1.6em",
            fontWeight: "bold",
            color,
          }}
        >
          {temp !== null && temp !== undefined ? `${temp.toFixed(1)} °C` : "--.- °C"}
        </div>
        <div style={{ marginTop: "10px" }}>
          <div style={styles.label}>Target (°C)</div>
          <input
            type="number"
            value={target}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{ ...styles.input, width: "80px" }}
          />
        </div>
        <div style={{ marginTop: "8px", fontSize: "0.8em" }}>
          SSR:{" "}
          <span style={{ color: relayOn ? "#2ecc71" : "#7f8c8d" }}>
            {relayOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={styles.panel}>
        <h2>Mica heater zones</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Set temperature targets for each zone. PID loop will eventually drive
          SSR duty; for now we just pass targets to the backend.
        </p>
        <div style={styles.grid2}>
          {renderZone(
            "Zone 1",
            temps.t1 ?? null,
            targetZ1,
            setTargetZ1,
            relays.ssr_z1
          )}
          {renderZone(
            "Zone 2",
            temps.t2 ?? null,
            targetZ2,
            setTargetZ2,
            relays.ssr_z2
          )}
        </div>
        <button
          style={{ ...styles.button, marginTop: "20px" }}
          onClick={applyTargets}
        >
          Apply targets
        </button>
      </div>
    </div>
  );
}

export default HeaterScreen;
