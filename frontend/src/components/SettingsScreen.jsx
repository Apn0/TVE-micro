// file: frontend/src/tabs/SettingsScreen.jsx
import React, { useState, useEffect } from "react";
import { styles } from "../App";
import DipSwitchBlock from "./DipSwitchBlock";

// DM556 table copied from original App.jsx
const DM556_TABLE = {
  current: {
    1.4: [true, true, true],
    2.1: [false, true, true],
    2.7: [true, false, true],
    3.2: [false, false, true],
    3.8: [true, true, false],
    4.3: [false, true, false],
    4.9: [true, false, false],
    5.6: [false, false, false],
  },
  steps: {
    400: [false, true, true, true],
    800: [true, false, true, true],
    1600: [false, false, true, true],
    3200: [true, true, false, true],
    6400: [false, true, false, true],
    12800: [true, false, false, true],
    25600: [false, false, false, true],
    1000: [true, true, true, false],
    2000: [false, true, true, false],
    4000: [true, false, true, false],
    5000: [false, false, true, false],
    8000: [true, true, false, false],
    10000: [false, true, false, false],
    20000: [true, false, false, false],
    25000: [false, false, false, false],
  },
};

function SettingsScreen({ data, sendCmd }) {
  const [dm, setDm] = useState(
    data.config?.dm556 || {
      microsteps: 1600,
      current_peak: 3.2,
      idle_half: true,
    }
  );

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

  // Sync state with incoming data if valid
  useEffect(() => {
    if (data.config?.temp_settings) {
      setTempSettings((prev) => ({ ...prev, ...data.config.temp_settings }));
    }
    if (data.config?.logging) {
      setLogSettings((prev) => ({ ...prev, ...data.config.logging }));
    }
  }, [data.config]);


  const getSwitchState = () => {
    let swCurr = [false, false, false];
    let swSteps = [false, false, false, false];

    if (DM556_TABLE.current[dm.current_peak]) {
      swCurr = DM556_TABLE.current[dm.current_peak];
    }
    if (DM556_TABLE.steps[dm.microsteps]) {
      swSteps = DM556_TABLE.steps[dm.microsteps];
    }
    return { swCurr, swSteps };
  };

  const handleApplyDM = () => {
    sendCmd("UPDATE_DM556", { params: dm });
  };

  const handleApplyTemp = () => {
    sendCmd("SET_TEMP_SETTINGS", { params: tempSettings });
  };

  const handleApplyLog = () => {
    sendCmd("SET_LOGGING_SETTINGS", { params: logSettings });
  };

  const { swCurr, swSteps } = getSwitchState();
  const adc = data.config?.adc || {};

  return (
    <div>
      <div style={styles.panel}>
        <h2>Logging & Performance</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

            {/* Column 1: Temp & Polling */}
            <div>
                <h3 style={{marginTop:0}}>Polling & Averaging</h3>
                <div style={styles.label}>Hardware Poll Interval (s)</div>
                <input
                    type="number" step="0.05" min="0.05"
                    style={styles.input}
                    value={tempSettings.poll_interval}
                    onChange={(e) => setTempSettings({...tempSettings, poll_interval: parseFloat(e.target.value)})}
                />

                <div style={styles.label}>Averaging Window (s)</div>
                <input
                    type="number" step="0.5" min="0.0"
                    style={styles.input}
                    value={tempSettings.avg_window}
                    onChange={(e) => setTempSettings({...tempSettings, avg_window: parseFloat(e.target.value)})}
                />

                <button style={{...styles.button, marginTop: "10px"}} onClick={handleApplyTemp}>
                    Apply Polling Config
                </button>
            </div>

            {/* Column 2: Logging */}
            <div>
                <h3 style={{marginTop:0}}>Data Logging</h3>
                <div style={styles.label}>Log Interval (s)</div>
                <input
                    type="number" step="0.05" min="0.05"
                    style={styles.input}
                    value={logSettings.interval}
                    onChange={(e) => setLogSettings({...logSettings, interval: parseFloat(e.target.value)})}
                />

                <div style={styles.label}>Flush to Disk Interval (s)</div>
                <input
                    type="number" step="1" min="1"
                    style={styles.input}
                    value={logSettings.flush_interval}
                    onChange={(e) => setLogSettings({...logSettings, flush_interval: parseFloat(e.target.value)})}
                />
                <div style={{fontSize: "0.8em", color: "#aaa", marginTop: "5px"}}>
                    Accumulates logs in RAM. Flushes immediately if temperature deviates > 2 SD.
                </div>

                <button style={{...styles.button, marginTop: "10px"}} onClick={handleApplyLog}>
                    Apply Logging Config
                </button>
            </div>
        </div>
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

            <div style={{ ...styles.label, marginTop: "10px" }}>
              Microsteps
            </div>
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

            <div style={{ marginTop: "10px", fontSize: "0.9em" }}>
              <label>
                <input
                  type="checkbox"
                  checked={dm.idle_half}
                  onChange={(e) =>
                    setDm({ ...dm, idle_half: e.target.checked })
                  }
                  style={{ marginRight: "5px" }}
                />
                Half current when idle (SW4)
              </label>
            </div>

            <button
              style={{ ...styles.button, marginTop: "15px" }}
              onClick={handleApplyDM}
            >
              Apply DM556 config
            </button>
          </div>

          <div>
            <div style={styles.label}>Visual DIP switches</div>
            <div style={{ marginBottom: "10px" }}>
              <div
                style={{
                  fontSize: "0.85em",
                  color: "#ecf0f1",
                  marginBottom: "4px",
                }}
              >
                Current (SW1â€“SW3)
              </div>
              <DipSwitchBlock switches={swCurr} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.85em",
                  color: "#ecf0f1",
                  marginBottom: "4px",
                }}
              >
                Microsteps (SW5â€“SW8)
              </div>
              <DipSwitchBlock switches={swSteps} />
            </div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>System info</h3>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Read-only ADS1115 configuration. Detailed sensor tuning lives in the
          SENSORS tab.
        </p>
        <div style={{ fontSize: "0.9em", color: "#ccc" }}>
          <div>ADS1115 enabled: {adc.enabled ? "yes" : "no"}</div>
          <div>Bus: {adc.bus ?? "-"}</div>
          <div>
            Address:{" "}
            {adc.address !== undefined ? `0x${adc.address.toString(16)}` : "-"}
          </div>
          <div>FSR: {adc.fsr ?? "-"} V</div>
        </div>
      </div>
    </div>
  );
}

export default SettingsScreen;
