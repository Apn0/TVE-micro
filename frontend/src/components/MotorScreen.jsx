import React, { useEffect, useMemo, useState } from "react";
import { styles } from "../App";
import DipSwitchBlock from "./DipSwitchBlock";
import { DM556_TABLE, DEFAULT_DM556 } from "../constants/dm556";

const rpmDisplay = (rpm) => `${rpm?.toFixed(0) ?? 0} RPM`;

function MotorScreen({ data, sendCmd }) {
  const motors = data.state?.motors || {};
  const temps = data.state?.temps || {};
  const [mainRpm, setMainRpm] = useState(motors.main ?? 0);
  const [feedRpm, setFeedRpm] = useState(motors.feed ?? 0);
  const [dm, setDm] = useState({
    ...DEFAULT_DM556,
    ...(data.config?.dm556 || {}),
  });

  useEffect(() => {
    setMainRpm(motors.main ?? 0);
    setFeedRpm(motors.feed ?? 0);
  }, [motors.main, motors.feed]);

  const dmFromConfig = data.config?.dm556;

  useEffect(() => {
    if (!dmFromConfig) return;

    setDm((prev) => {
      const next = { ...DEFAULT_DM556, ...dmFromConfig };
      if (
        prev.current_peak === next.current_peak &&
        prev.microsteps === next.microsteps &&
        prev.idle_half === next.idle_half
      ) {
        return prev;
      }

      return next;
    });
  }, [dmFromConfig?.current_peak, dmFromConfig?.microsteps, dmFromConfig?.idle_half]);

  const sendMain = (rpm) => {
    const safeRpm = Math.max(0, rpm);
    setMainRpm(safeRpm);
    sendCmd("SET_MOTOR", { motor: "main", rpm: safeRpm });
  };

  const sendFeed = (rpm) => {
    const safeRpm = Math.max(0, rpm);
    setFeedRpm(safeRpm);
    sendCmd("SET_MOTOR", { motor: "feed", rpm: safeRpm });
  };

  const applyDm = () => {
    sendCmd("UPDATE_DM556", { params: dm });
  };

  const switchStates = useMemo(() => {
    return {
      swCurr: DM556_TABLE.current[dm.current_peak] || [false, false, false],
      swSteps: DM556_TABLE.steps[dm.microsteps] || [false, false, false, false],
    };
  }, [dm.current_peak, dm.microsteps]);

  return (
    <div>
      <div style={styles.panel}>
        <h2>NEMA23 / DM556 motor control</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Tune the main screw and feeder speeds and match the DM556 DIP switches.
          Values are validated for non-negative RPM targets.
        </p>

        <div style={styles.grid2}>
          <div>
            <div style={styles.label}>Main screw target RPM</div>
            <input
              type="range"
              min="0"
              max="120"
              step="1"
              value={mainRpm}
              onChange={(e) => sendMain(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={styles.metricBig}>{rpmDisplay(mainRpm)}</div>
            <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
              {[15, 30, 60, 90, 120].map((preset) => (
                <button
                  key={preset}
                  style={styles.buttonSecondary}
                  onClick={() => sendMain(preset)}
                >
                  {preset} RPM
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={styles.label}>Feeder target RPM</div>
            <input
              type="range"
              min="0"
              max="60"
              step="1"
              value={feedRpm}
              onChange={(e) => sendFeed(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={styles.metricBig}>{rpmDisplay(feedRpm)}</div>
            <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
              {[5, 10, 20, 40, 60].map((preset) => (
                <button
                  key={preset}
                  style={styles.buttonSecondary}
                  onClick={() => sendFeed(preset)}
                >
                  {preset} RPM
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <button style={styles.buttonSecondary} onClick={() => sendMain(0)}>
            Stop main
          </button>
          <button style={styles.buttonSecondary} onClick={() => sendFeed(0)}>
            Stop feeder
          </button>
        </div>

        <div style={{ marginTop: "15px", color: "#ccc", fontSize: "0.9em" }}>
          <div>Motor NTC: {temps.motor !== undefined ? `${temps.motor.toFixed(1)} °C` : "--.- °C"}</div>
          <div>Driver microsteps: {dm.microsteps} steps/rev</div>
          <div>Peak current: {dm.current_peak} A ({dm.idle_half ? "½ current when idle" : "full current idle"})</div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>DM556 DIP switch helper</h3>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Align the switch banks with the selected microstep and current values
          for the NEMA23. Use SW4 for idle current reduction.
        </p>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div>
            <div style={styles.label}>Target current (peak)</div>
            <select
              style={{ ...styles.input, width: "140px" }}
              value={dm.current_peak}
              onChange={(e) => setDm({ ...dm, current_peak: parseFloat(e.target.value) })}
            >
              {Object.keys(DM556_TABLE.current).map((k) => (
                <option key={k} value={k}>
                  {k} A
                </option>
              ))}
            </select>

            <div style={{ ...styles.label, marginTop: "12px" }}>Microsteps</div>
            <select
              style={{ ...styles.input, width: "140px" }}
              value={dm.microsteps}
              onChange={(e) => setDm({ ...dm, microsteps: parseInt(e.target.value, 10) })}
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
                  onChange={(e) => setDm({ ...dm, idle_half: e.target.checked })}
                  style={{ marginRight: "5px" }}
                />
                SW4: Half current when idle
              </label>
            </div>

            <button style={{ ...styles.button, marginTop: "15px" }} onClick={applyDm}>
              Apply DM556 config
            </button>
          </div>

          <div>
            <div style={styles.label}>Current (SW1–SW3)</div>
            <DipSwitchBlock switches={switchStates.swCurr} />
          </div>
          <div>
            <div style={styles.label}>Microsteps (SW5–SW8)</div>
            <DipSwitchBlock switches={switchStates.swSteps} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MotorScreen;
