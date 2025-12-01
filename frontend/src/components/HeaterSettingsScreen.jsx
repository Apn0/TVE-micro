import React, { useState, useEffect } from "react";
import { styles } from "../styles";

/**
 * HeaterSettingsScreen
 *
 * Provides in-depth configuration for heater zones and global temperature settings.
 *
 * Features:
 * - Back button to return to HeaterScreen.
 * - PID Parameter editing (Kp, Ki, Kd) for Zone 1 and Zone 2.
 * - Manual Duty Cycle control (when in Manual Mode).
 * - Global Temperature Settings (Poll Interval, Averaging).
 *
 * Design Pattern: Engineering UI (docs/ENGINEERING_UI_DESIGN.md)
 */
function HeaterSettingsScreen({ data, sendCmd, onBack, keypad }) {
  const config = data.config || {};
  const state = data.state || {};
  const isManual = state.mode === "MANUAL";

  const handleEdit = (label, currentValue, onSave, numeric = true) => (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = numeric ? (Number.isFinite(currentValue) ? String(currentValue) : "") : String(currentValue);

    keypad.openKeypad(initial, rect, (val) => {
      if (numeric) {
        const num = parseFloat(val);
        if (!Number.isNaN(num)) {
          onSave(num);
        }
      } else {
        onSave(val);
      }
      keypad.closeKeypad();
    });
  };

  const updatePID = (zone, param, value) => {
    // We send only the changed parameter; backend merges it.
    sendCmd("UPDATE_PID", { zone, params: { [param]: value } });
  };

  const updateDuty = (zone, value) => {
    let num = parseFloat(value);
    if (num < 0) num = 0;
    if (num > 100) num = 100;
    sendCmd("SET_HEATER", { zone, duty: num });
  };

  const updateGlobal = (param, value) => {
    sendCmd("SET_TEMP_SETTINGS", { params: { [param]: value } });
  };

  const renderZoneSettings = (zoneKey, title, subtitle) => {
    const pid = config[zoneKey] || { kp: 0, ki: 0, kd: 0 };
    const duty = state[`heater_duty_${zoneKey}`] ?? 0;

    return (
      <div style={styles.panel} key={zoneKey}>
        <h2 style={{ margin: "0 0 5px 0" }}>{title}</h2>
        <div style={{ color: "#aaa", fontSize: "0.9em", marginBottom: "20px" }}>{subtitle}</div>

        <div style={styles.grid2}>
          {/* Manual Duty Cycle */}
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Manual Duty Cycle</div>
            <div
                style={{ ...styles.metricValue, color: isManual ? "#e67e22" : "#555", cursor: isManual ? "pointer" : "default" }}
                onClick={isManual ? handleEdit("Duty Cycle", duty, (val) => updateDuty(zoneKey, val)) : undefined}
            >
              {duty.toFixed(1)} %
            </div>
            <div style={styles.cardHint}>
              {isManual ? "Tap to change output %" : "Read-only in Auto Mode"}
            </div>
          </div>

          {/* PID Parameters */}
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>PID Constants</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "10px" }}>

              {/* Kp */}
              <div
                style={{ background: "#000", padding: "8px", borderRadius: "4px", cursor: "pointer", textAlign: "center" }}
                onClick={handleEdit("Kp", pid.kp, (val) => updatePID(zoneKey, "kp", val))}
              >
                <div style={{ fontSize: "0.8em", color: "#aaa" }}>Kp</div>
                <div style={{ fontSize: "1.2em", fontWeight: "bold", color: "#fff" }}>{pid.kp}</div>
              </div>

              {/* Ki */}
              <div
                style={{ background: "#000", padding: "8px", borderRadius: "4px", cursor: "pointer", textAlign: "center" }}
                onClick={handleEdit("Ki", pid.ki, (val) => updatePID(zoneKey, "ki", val))}
              >
                 <div style={{ fontSize: "0.8em", color: "#aaa" }}>Ki</div>
                 <div style={{ fontSize: "1.2em", fontWeight: "bold", color: "#fff" }}>{pid.ki}</div>
              </div>

              {/* Kd */}
              <div
                style={{ background: "#000", padding: "8px", borderRadius: "4px", cursor: "pointer", textAlign: "center" }}
                onClick={handleEdit("Kd", pid.kd, (val) => updatePID(zoneKey, "kd", val))}
              >
                 <div style={{ fontSize: "0.8em", color: "#aaa" }}>Kd</div>
                 <div style={{ fontSize: "1.2em", fontWeight: "bold", color: "#fff" }}>{pid.kd}</div>
              </div>

            </div>
            <div style={{ ...styles.cardHint, marginTop: "5px" }}>Tap values to edit</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={{ ...styles.panel, display: "flex", alignItems: "center", gap: "20px" }}>
        <button onClick={onBack} style={{ ...styles.buttonSecondary, fontSize: "1.2em", padding: "10px 20px" }}>
          ← Back
        </button>
        <div>
          <h2 style={{ margin: 0 }}>Heater Settings</h2>
          <div style={{ color: "#aaa", fontSize: "0.9em" }}>In-depth configuration</div>
        </div>
      </div>

      {renderZoneSettings("z1", "Zone 1 (Feed/Transition)", "PID tuning and manual override for the feed section.")}
      {renderZoneSettings("z2", "Zone 2 (Metering/Die)", "PID tuning and manual override for the compression section.")}

      <div style={styles.panel}>
        <h2 style={{ margin: "0 0 5px 0" }}>Global Temperature Settings</h2>
        <div style={{ color: "#aaa", fontSize: "0.9em", marginBottom: "20px" }}>Sensor behavior and system-wide limits.</div>
        <div style={styles.grid2}>
             <div style={styles.metricCard}>
                <div style={styles.metricLabel}>Poll Interval</div>
                <div
                    style={{ ...styles.metricValue, cursor: "pointer" }}
                    onClick={handleEdit("Poll Interval", config.temp_settings?.poll_interval, (val) => updateGlobal("poll_interval", val))}
                >
                    {config.temp_settings?.poll_interval} s
                </div>
                <div style={styles.cardHint}>Sensor update frequency</div>
             </div>

             <div style={styles.metricCard}>
                <div style={styles.metricLabel}>Avg. Window</div>
                 <div
                    style={{ ...styles.metricValue, cursor: "pointer" }}
                    onClick={handleEdit("Avg Window", config.temp_settings?.avg_window, (val) => updateGlobal("avg_window", val))}
                >
                    {config.temp_settings?.avg_window} s
                </div>
                <div style={styles.cardHint}>Smoothing window size</div>
             </div>
        </div>
      </div>
    </div>
  );
}

export default HeaterSettingsScreen;
