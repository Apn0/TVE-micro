// file: frontend/src/tabs/SettingsScreen.jsx
import React, { useState, useEffect } from "react";
import { styles } from "../App";
import DipSwitchBlock from "./DipSwitchBlock";
import { DM556_TABLE, DEFAULT_DM556 } from "../constants/dm556";

function SettingsScreen({ data, sendCmd }) {
  const [dm, setDm] = useState({
    ...DEFAULT_DM556,
    ...(data.config?.dm556 || {}),
  });

  const [tempSettings, setTempSettings] = useState({
    poll_interval: 0.25,
    avg_window: 2.0,
    ...data.config?.temp_settings,
  });

  const [logSettings, setLogSettings] = useState({
    interval: 0.25,
    flush_interval: 60.0,
    ...data.config?.logging,
  });

  const [seq, setSeq] = useState({
    start_delay_feed: 2.0,
    stop_delay_motor: 5.0,
    check_temp_before_start: true,
    ...(data.config?.extruder_sequence || {}),
  });

  const [pins, setPins] = useState({
    ...(data.config?.pins || {}),
  });

  useEffect(() => {
    if (data.config?.temp_settings) {
      setTempSettings((prev) => ({ ...prev, ...data.config.temp_settings }));
    }
    if (data.config?.logging) {
      setLogSettings((prev) => ({ ...prev, ...data.config.logging }));
    }
  }, [data.config]);

  const getSwitchState = () => {
    const swCurr = DM556_TABLE.current[dm.current_peak] || [false, false, false];
    const swSteps = DM556_TABLE.steps[dm.microsteps] || [false, false, false, false];
    return { swCurr, swSteps };
  };

  const handleApplyDM = () => sendCmd("UPDATE_DM556", { params: dm });
  const handleApplyTemp = () => sendCmd("SET_TEMP_SETTINGS", { params: tempSettings });
  const handleApplyLog = () => sendCmd("SET_LOGGING_SETTINGS", { params: logSettings });
  const handleSeqApply = () => sendCmd("UPDATE_EXTRUDER_SEQ", { sequence: seq });
  const handlePinsApply = () => sendCmd("UPDATE_PINS", { pins });

  const { swCurr, swSteps } = getSwitchState();
  const adc = data.config?.adc || {};

  return (
    <div>

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
              onChange={(e) =>
                setTempSettings({ ...tempSettings, poll_interval: parseFloat(e.target.value) })
              }
            />
            <div style={styles.label}>Averaging Window (s)</div>
            <input
              type="number"
              step="0.5"
              min="0.0"
              style={styles.input}
              value={tempSettings.avg_window}
              onChange={(e) =>
                setTempSettings({ ...tempSettings, avg_window: parseFloat(e.target.value) })
              }
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
              onChange={(e) =>
                setLogSettings({ ...logSettings, interval: parseFloat(e.target.value) })
              }
            />
            <div style={styles.label}>Flush to Disk Interval (s)</div>
            <input
              type="number"
              step="1"
              min="1"
              style={styles.input}
              value={logSettings.flush_interval}
              onChange={(e) =>
                setLogSettings({ ...logSettings, flush_interval: parseFloat(e.target.value) })
              }
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
        <h2>Extruder Sequence</h2>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <div style={styles.label}>Start Delay Feed [s]</div>
            <input
              type="number"
              step="0.1"
              style={{ ...styles.input, width: "80px" }}
              value={seq.start_delay_feed}
              onChange={(e) =>
                setSeq({ ...seq, start_delay_feed: parseFloat(e.target.value) })
              }
            />
          </div>

          <div>
            <div style={styles.label}>Stop Delay Motor [s]</div>
            <input
              type="number"
              step="0.1"
              style={{ ...styles.input, width: "80px" }}
              value={seq.stop_delay_motor}
              onChange={(e) =>
                setSeq({ ...seq, stop_delay_motor: parseFloat(e.target.value) })
              }
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: "24px" }}>
            <label>
              <input
                type="checkbox"
                checked={seq.check_temp_before_start}
                onChange={(e) =>
                  setSeq({ ...seq, check_temp_before_start: e.target.checked })
                }
                style={{ marginRight: "8px", transform: "scale(1.2)" }}
              />
              Check Temps before Start
            </label>
          </div>

          <button style={styles.button} onClick={handleSeqApply}>
            Apply Sequence Config
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
    </div>
  );
}

export default SettingsScreen;
