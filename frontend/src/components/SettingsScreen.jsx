// file: frontend/src/tabs/SettingsScreen.jsx
import React, { useState, useEffect } from "react";
import { styles } from "../App";
import DipSwitchBlock from "./DipSwitchBlock";
import { DM556_TABLE, DEFAULT_DM556 } from "../constants/dm556";
import SequencingConfig, { normalizeSequenceConfig } from "./SequencingConfig";

/**
 * SettingsScreen Component.
 *
 * Provides comprehensive configuration controls for the entire system.
 *
 * Features:
 * - Logging settings: Adjust polling rates, averaging windows, and disk flush intervals.
 * - Extruder Sequence: Configure startup/shutdown step ordering and delays.
 * - GPIO Pins: Re-map critical control pins (requires restart).
 * - Persist Config: Save current settings to disk.
 * - DM556 Driver: Configure motor driver DIP switches virtually.
 * - System Info: Read-only display of ADC/hardware status.
 * - Navigation to Wiring Calibration wizard.
 *
 * @param {object} props - Component props.
 * @param {object} props.data - Current system state and configuration.
 * @param {function} props.sendCmd - Function to send API commands.
 * @param {function} props.setView - Function to switch the current view/tab.
 */
function SettingsScreen({ data, sendCmd, setView }) {
  const [dm, setDm] = useState({
    ...DEFAULT_DM556,
    ...(data.config?.dm556 || {}),
  });

  const [tempSettings, setTempSettings] = useState({
    poll_interval: 0.25,
    avg_window: 2.0,
    ...data.config?.temp_settings,
  });
  const [tempDirty, setTempDirty] = useState(false);

  const [logSettings, setLogSettings] = useState({
    interval: 0.25,
    flush_interval: 60.0,
    ...data.config?.logging,
  });
  const [logDirty, setLogDirty] = useState(false);

  const [seq, setSeq] = useState(normalizeSequenceConfig(data.config?.extruder_sequence));
  const [showSequencing, setShowSequencing] = useState(false);

  const [pins, setPins] = useState({
    ...(data.config?.pins || {}),
  });

  const shallowEqual = (a, b) => {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => a[k] === b[k]);
  };

  useEffect(() => {
    if (data.config?.temp_settings && !tempDirty) {
      const incoming = { poll_interval: 0.25, avg_window: 2.0, ...data.config.temp_settings };
      setTempSettings((prev) => (shallowEqual(prev, incoming) ? prev : incoming));
    }
    if (data.config?.logging && !logDirty) {
      const incoming = { interval: 0.25, flush_interval: 60.0, ...data.config.logging };
      setLogSettings((prev) => (shallowEqual(prev, incoming) ? prev : incoming));
    }
    if (data.config?.extruder_sequence) {
      setSeq((prev) => {
        const incoming = normalizeSequenceConfig(data.config.extruder_sequence);
        return shallowEqual(prev, incoming) ? prev : incoming;
      });
    }
  }, [data.config, tempDirty, logDirty]);

  const getSwitchState = () => {
    const swCurr = DM556_TABLE.current[dm.current_peak] || [false, false, false];
    const swSteps = DM556_TABLE.steps[dm.microsteps] || [false, false, false, false];
    return { swCurr, swSteps };
  };

  const handleApplyDM = () => sendCmd("UPDATE_DM556", { params: dm });
  const handleApplyTemp = async () => {
    await sendCmd("SET_TEMP_SETTINGS", { params: tempSettings });
    setTempDirty(false);
  };
  const handleApplyLog = async () => {
    await sendCmd("SET_LOGGING_SETTINGS", { params: logSettings });
    setLogDirty(false);
  };
  const handleSaveConfig = () => sendCmd("SAVE_CONFIG");
  const handleSeqSave = async (newSeq) => {
    const normalized = normalizeSequenceConfig(newSeq);
    await sendCmd("UPDATE_EXTRUDER_SEQ", { sequence: normalized });
    setSeq(normalized);
    setShowSequencing(false);
  };
  const handlePinsApply = () => sendCmd("UPDATE_PINS", { pins });

  const { swCurr, swSteps } = getSwitchState();
  const adc = data.config?.adc || {};

  return (
    <div>

      <div style={{ ...styles.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <div style={{ color: "#ccc" }}>Configuration and maintenance tools</div>
        </div>
      </div>

      <div style={styles.panel}>
        <h2>Logging & Performance</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Polling & Averaging</h3>
            <div style={styles.label}>Hardware Poll Interval (s)</div>
            <input
              type="number"
              step="0.05"
              min="0.05"
              style={styles.input}
              value={tempSettings.poll_interval}
              onChange={(e) => {
                setTempDirty(true);
                setTempSettings({ ...tempSettings, poll_interval: parseFloat(e.target.value) });
              }}
            />
            <div style={styles.label}>Averaging Window (s)</div>
            <input
              type="number"
              step="0.5"
              min="0.0"
              style={styles.input}
              value={tempSettings.avg_window}
              onChange={(e) => {
                setTempDirty(true);
                setTempSettings({ ...tempSettings, avg_window: parseFloat(e.target.value) });
              }}
            />
            <button style={{ ...styles.button, marginTop: "10px" }} onClick={handleApplyTemp}>
              Apply Polling Config
            </button>
          </div>

          <div>
            <h3 style={{ marginTop: 0 }}>Data Logging</h3>
            <div style={styles.label}>Log Interval (s)</div>
            <input
              type="number"
              step="0.05"
              min="0.05"
              style={styles.input}
              value={logSettings.interval}
              onChange={(e) => {
                setLogDirty(true);
                setLogSettings({ ...logSettings, interval: parseFloat(e.target.value) });
              }}
            />
            <div style={styles.label}>Flush to Disk Interval (s)</div>
            <input
              type="number"
              step="1"
              min="1"
              style={styles.input}
              value={logSettings.flush_interval}
              onChange={(e) => {
                setLogDirty(true);
                setLogSettings({ ...logSettings, flush_interval: parseFloat(e.target.value) });
              }}
            />
            <div style={{ fontSize: "0.8em", color: "#aaa", marginTop: "5px" }}>
              {'Flushes early if temperature deviates > 2 SD.'}
            </div>

            <button style={{ ...styles.button, marginTop: "10px" }} onClick={handleApplyLog}>
              Apply Logging Config
            </button>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Extruder Sequence</h2>
            <div style={{ color: "#ccc", marginTop: "-5px", maxWidth: "720px" }}>
              Startup, power-down, and emergency cycles now sequence motors along with fan and pump
              outputs. Open the Sequencing Config to adjust ordering, delays, and whether temps must
              be checked before start.
            </div>
            <div style={{ marginTop: 10, color: "#aaa" }}>
              Temp check before start: {seq.check_temp_before_start ? "Enabled" : "Bypassed"}
            </div>
          </div>
          <button
            style={{ ...styles.buttonSecondary, display: "flex", alignItems: "center", gap: 8, fontSize: "0.95em" }}
            onClick={() => setShowSequencing(true)}
          >
            <span role="img" aria-label="configure">🔧</span>
            Sequencing Config
          </button>
        </div>
      </div>

      <div style={styles.panel}>
        <h2>IO Pins (GPIO BCM)</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {["btn_start", "btn_emergency", "led_status"].map((key) => (
            <div key={key} style={{ width: "140px" }}>
              <div style={styles.label}>{key}</div>
              <input
                type="number"
                style={{ ...styles.input, width: "100%" }}
                value={pins[key] ?? ""}
                onChange={(e) =>
                  setPins({ ...pins, [key]: parseInt(e.target.value, 10) })
                }
              />
            </div>
          ))}
        </div>

        <button style={{ ...styles.button, marginTop: "15px" }} onClick={handlePinsApply}>
          Update Pins (Requires Restart)
        </button>
      </div>

      <div style={{ ...styles.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>Persist current settings</h3>
          <div style={{ color: "#aaa", maxWidth: "520px" }}>
            Apply your changes above, then save to write the current configuration to backend/config.json so it survives a reboot.
          </div>
        </div>

        <button style={styles.button} onClick={handleSaveConfig}>
          Save Config to Disk
        </button>
      </div>

      <div style={styles.panel}>
        <h2>DM556 driver config</h2>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={styles.label}>Target current (peak)</div>
            <select
              style={{ ...styles.input, width: "120px" }}
              value={dm.current_peak}
              onChange={(e) =>
                setDm({ ...dm, current_peak: parseFloat(e.target.value) })
              }
            >
              {Object.keys(DM556_TABLE.current).map((k) => (
                <option key={k} value={k}>
                  {k} A
                </option>
              ))}
            </select>

            <div style={{ ...styles.label, marginTop: "10px" }}>Microsteps</div>
            <select
              style={{ ...styles.input, width: "120px" }}
              value={dm.microsteps}
              onChange={(e) =>
                setDm({ ...dm, microsteps: parseInt(e.target.value, 10) })
              }
            >
              {Object.keys(DM556_TABLE.steps).map((k) => (
                <option key={k} value={k}>
                  {k} steps/rev
                </option>
              ))}
            </select>

            <label style={{ marginTop: "10px", display: "block", fontSize: "0.9em" }}>
              <input
                type="checkbox"
                checked={dm.idle_half}
                onChange={(e) => setDm({ ...dm, idle_half: e.target.checked })}
                style={{ marginRight: "5px" }}
              />
              Half current when idle (SW4)
            </label>

            <button style={{ ...styles.button, marginTop: "15px" }} onClick={handleApplyDM}>
              Apply DM556 config
            </button>
          </div>

          <div>
            <div style={styles.label}>Visual DIP switches</div>
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "0.85em", color: "#ecf0f1", marginBottom: "4px" }}>
                Current (SW1–SW3)
              </div>
              <DipSwitchBlock switches={swCurr} />
            </div>

            <div>
              <div style={{ fontSize: "0.85em", color: "#ecf0f1", marginBottom: "4px" }}>
                Microsteps (SW5–SW8)
              </div>
              <DipSwitchBlock switches={swSteps} />
            </div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>System info</h3>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Read-only ADS1115 configuration. Sensor tuning lives in the SENSORS tab.
        </p>
        <div style={{ fontSize: "0.9em", color: "#ccc" }}>
          <div>ADS1115 enabled: {adc.enabled ? "yes" : "no"}</div>
          <div>Bus: {adc.bus ?? "-"}</div>
          <div>Address: {adc.address !== undefined ? `0x${adc.address.toString(16)}` : "-"}</div>
          <div>FSR: {adc.fsr ?? "-"} V</div>
        </div>
      </div>

      <div
        style={{
          ...styles.panel,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          bottom: 0,
          background: "#1e1e1e",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Wiring calibration</h3>
          <div style={{ color: "#ccc" }}>
            Run the wiring calibration check after hardware changes.
          </div>
        </div>
        <button
          style={{ ...styles.button, background: "#9b59b6" }}
          onClick={() => setView && setView("WIRING CALIBRATION")}
        >
          Wiring calibration check
        </button>
      </div>
      {showSequencing && (
        <SequencingConfig
          sequence={seq}
          onClose={() => setShowSequencing(false)}
          onSave={handleSeqSave}
        />
      )}
    </div>
  );
}

export default SettingsScreen;
