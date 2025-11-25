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
  const [mainManualSteps, setMainManualSteps] = useState(100);
  const [feedManualSteps, setFeedManualSteps] = useState(100);
  const [mainManualRotations, setMainManualRotations] = useState(1);
  const [feedManualRotations, setFeedManualRotations] = useState(1);
  const [mainManualSpeed, setMainManualSpeed] = useState(1000);
  const [feedManualSpeed, setFeedManualSpeed] = useState(1000);
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

  const sendMoveSteps = (motor, steps, speed) => {
    sendCmd("MOVE_MOTOR_STEPS", { motor, steps, speed });
  };

  const sendMoveRotations = (motor, rotations, speed) => {
    const steps = rotations * dm.microsteps;
    sendCmd("MOVE_MOTOR_STEPS", { motor, steps, speed });
  };

  const stopManualMove = (motor) => {
    sendCmd("STOP_MANUAL_MOVE", { motor });
  }

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
        <h3>Calculated values</h3>
        <div style={{ ...styles.grid2, gap: "20px" }}>
          <div>
            <h4>Main Motor</h4>
            <div style={styles.label}>Steps/rotation</div>
            <div style={styles.metric}>{dm.microsteps}</div>
            <div style={styles.label}>Steps/second</div>
            <div style={styles.metric}>{((mainRpm / 60) * dm.microsteps).toFixed(0)}</div>
            <div style={styles.label}>Steps/minute</div>
            <div style={styles.metric}>{(mainRpm * dm.microsteps).toFixed(0)}</div>
          </div>
          <div>
            <h4>Feeder Motor</h4>
            <div style={styles.label}>Steps/rotation</div>
            <div style={styles.metric}>{dm.microsteps}</div>
            <div style={styles.label}>Steps/second</div>
            <div style={styles.metric}>{((feedRpm / 60) * dm.microsteps).toFixed(0)}</div>
            <div style={styles.label}>Steps/minute</div>
            <div style={styles.metric}>{(feedRpm * dm.microsteps).toFixed(0)}</div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Manual Controls</h3>
        <div style={{ ...styles.grid2, gap: "20px" }}>
          <div>
            <h4>Main Motor</h4>
            <div style={styles.label}>Move steps ({mainManualSteps})</div>
            <input type="range" min="1" max="1000" value={mainManualSteps} onChange={(e) => setMainManualSteps(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
            <div style={styles.label}>Move rotations ({mainManualRotations})</div>
            <input type="range" min="1" max="1000" value={mainManualRotations} onChange={(e) => setMainManualRotations(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
            <div style={styles.label}>Speed (steps/s)</div>
            <input type="number" value={mainManualSpeed} onChange={(e) => setMainManualSpeed(parseInt(e.target.value, 10))} style={styles.input} />
            <div style={{ marginTop: "10px" }}>
              <button style={styles.buttonSecondary} onMouseDown={() => sendMoveSteps('main', 999999, mainManualSpeed)} onMouseUp={() => stopManualMove('main')}>Jog CW</button>
              <button style={styles.buttonSecondary} onMouseDown={() => sendMoveSteps('main', -999999, mainManualSpeed)} onMouseUp={() => stopManualMove('main')}>Jog CCW</button>
              <button style={{...styles.button, marginLeft: "10px"}} onClick={() => sendMoveSteps('main', mainManualSteps, mainManualSpeed)}>Send Steps</button>
              <button style={{...styles.button, marginLeft: "10px"}} onClick={() => sendMoveRotations('main', mainManualRotations, mainManualSpeed)}>Send Rotations</button>
              <button style={styles.buttonDanger} onClick={() => stopManualMove('main')}>Stop</button>
            </div>
          </div>
          <div>
            <h4>Feeder Motor</h4>
            <div style={styles.label}>Move steps ({feedManualSteps})</div>
            <input type="range" min="1" max="1000" value={feedManualSteps} onChange={(e) => setFeedManualSteps(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
            <div style={styles.label}>Move rotations ({feedManualRotations})</div>
            <input type="range" min="1" max="1000" value={feedManualRotations} onChange={(e) => setFeedManualRotations(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
            <div style={styles.label}>Speed (steps/s)</div>
            <input type="number" value={feedManualSpeed} onChange={(e) => setFeedManualSpeed(parseInt(e.target.value, 10))} style={styles.input} />
            <div style={{ marginTop: "10px" }}>
              <button style={styles.buttonSecondary} onMouseDown={() => sendMoveSteps('feed', 999999, feedManualSpeed)} onMouseUp={() => stopManualMove('feed')}>Jog CW</button>
              <button style={styles.buttonSecondary} onMouseDown={() => sendMoveSteps('feed', -999999, feedManualSpeed)} onMouseUp={() => stopManualMove('feed')}>Jog CCW</button>
              <button style={{...styles.button, marginLeft: "10px"}} onClick={() => sendMoveSteps('feed', feedManualSteps, feedManualSpeed)}>Send Steps</button>
              <button style={{...styles.button, marginLeft: "10px"}} onClick={() => sendMoveRotations('feed', feedManualRotations, feedManualSpeed)}>Send Rotations</button>
              <button style={styles.buttonDanger} onClick={() => stopManualMove('feed')}>Stop</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MotorScreen;
