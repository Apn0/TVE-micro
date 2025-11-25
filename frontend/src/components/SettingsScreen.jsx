// file: frontend/src/tabs/SettingsScreen.jsx
import React, { useState } from "react";
import { styles } from "../App";
import DipSwitchBlock from "./DipSwitchBlock";
import { DM556_TABLE, DEFAULT_DM556 } from "../constants/dm556";

function SettingsScreen({ data, sendCmd }) {
  const [dm, setDm] = useState({
    ...DEFAULT_DM556,
    ...(data.config?.dm556 || {}),
  });

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

  const handleApply = () => {
    sendCmd("UPDATE_DM556", { params: dm });
  };

  const { swCurr, swSteps } = getSwitchState();
  const adc = data.config?.adc || {};

  // Local state for Extruder Sequence
  const [seq, setSeq] = useState({
      start_delay_feed: 2.0,
      stop_delay_motor: 5.0,
      check_temp_before_start: true,
      ...(data.config?.extruder_sequence || {})
  });

  const handleSeqApply = () => {
      sendCmd("UPDATE_EXTRUDER_SEQ", { sequence: seq });
  };

  // Local state for Pins (partial)
  const [pins, setPins] = useState({
      ...(data.config?.pins || {})
  });

  const handlePinsApply = () => {
      sendCmd("UPDATE_PINS", { pins: pins });
  };

  return (
    <div>
      <div style={styles.panel}>
        <h2>Extruder Sequence</h2>
        <div style={{display: "flex", gap: "20px", flexWrap: "wrap"}}>
            <div>
                <div style={styles.label}>Start Delay (Feed Motor) [s]</div>
                <input
                    type="number"
                    step="0.1"
                    style={{...styles.input, width: "80px"}}
                    value={seq.start_delay_feed}
                    onChange={(e) => setSeq({...seq, start_delay_feed: parseFloat(e.target.value)})}
                />
            </div>
            <div>
                <div style={styles.label}>Stop Delay (Main Motor) [s]</div>
                <input
                    type="number"
                    step="0.1"
                    style={{...styles.input, width: "80px"}}
                    value={seq.stop_delay_motor}
                    onChange={(e) => setSeq({...seq, stop_delay_motor: parseFloat(e.target.value)})}
                />
            </div>
            <div style={{display: "flex", alignItems: "center", marginTop: "24px"}}>
                <label style={{cursor: "pointer", userSelect: "none"}}>
                    <input
                        type="checkbox"
                        checked={seq.check_temp_before_start}
                        onChange={(e) => setSeq({...seq, check_temp_before_start: e.target.checked})}
                        style={{marginRight: "8px", transform: "scale(1.2)"}}
                    />
                    Check Temps before Start
                </label>
            </div>
            <div style={{width: "100%", marginTop: "10px"}}>
                 <button style={styles.button} onClick={handleSeqApply}>Apply Sequence Config</button>
            </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h2>IO Pins (GPIO BCM)</h2>
        <div style={{display: "flex", flexWrap: "wrap", gap: "10px"}}>
            {["btn_start", "btn_emergency", "led_status"].map(key => (
                <div key={key} style={{width: "140px"}}>
                     <div style={styles.label}>{key}</div>
                     <input
                        type="number"
                        style={{...styles.input, width: "100%"}}
                        value={pins[key] ?? ""}
                        onChange={(e) => setPins({...pins, [key]: parseInt(e.target.value, 10)})}
                     />
                </div>
            ))}
        </div>
        <button style={{...styles.button, marginTop: "15px"}} onClick={handlePinsApply}>
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
              onClick={handleApply}
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
