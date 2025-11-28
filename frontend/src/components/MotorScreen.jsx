import React, { useEffect, useMemo, useState, useRef } from "react";
import { styles } from "../App";
import DipSwitchBlock from "./DipSwitchBlock";
import { DM556_TABLE, DEFAULT_DM556 } from "../constants/dm556";

const rpmDisplay = (rpm) => `${rpm?.toFixed(0) ?? 0} RPM`;

/**
 * MotorScreen Component.
 *
 * Provides comprehensive control and monitoring for the main screw motor and feeder motor.
 *
 * Features:
 * - Live monitoring of RPM and calculated steps/second.
 * - Slider and preset controls for setting motor speeds.
 * - Configuration interface for DM556 stepper driver settings (Microsteps, Peak Current).
 * - Visual DIP switch representation based on driver settings.
 * - Manual jogging controls (CW/CCW, specific steps/rotations).
 * - Display of acceleration and ramp settings.
 *
 * @param {object} props - Component props.
 * @param {object} props.data - Current system state and configuration.
 * @param {function} props.sendCmd - Function to send API commands.
 * @param {object} props.keypad - The keypad hook object.
 */
function MotorScreen({ data, sendCmd, keypad }) {
  const motors = data.state?.motors || {};
  const temps = data.state?.temps || {};
  const motionConfig = data.config?.motion || data.config?.motors || {};
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

  const [expandedCard, setExpandedCard] = useState(null);
  const overlayRef = useRef(null);

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

  useEffect(() => {
    if (!expandedCard) return undefined;

    const handleClick = (event) => {
      // Check if click was inside overlay box (overlayRef)
      const insideOverlay = overlayRef.current && overlayRef.current.contains(event.target);

      if (!insideOverlay) {
        setExpandedCard(null);
        keypad?.closeKeypad?.();
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [expandedCard, keypad]);

  const microstepOptions = useMemo(
    () => Object.keys(DM556_TABLE.steps).map(Number).sort((a, b) => a - b),
    []
  );
  const currentOptions = useMemo(
    () => Object.keys(DM556_TABLE.current).map(Number).sort((a, b) => a - b),
    []
  );

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
  };

  const switchStates = useMemo(() => {
    return {
      swCurr: DM556_TABLE.current[dm.current_peak] || [false, false, false],
      swSteps: DM556_TABLE.steps[dm.microsteps] || [false, false, false, false],
    };
  }, [dm.current_peak, dm.microsteps]);

  const motionMetrics = useMemo(() => {
    const rampUp = motionConfig.ramp_up ?? motionConfig.ramp_up_s ?? 0;
    const rampDown = motionConfig.ramp_down ?? motionConfig.ramp_down_s ?? 0;
    const accelPerSec = motionConfig.max_accel ?? motionConfig.max_accel_per_s ?? 0;
    const accelPerSec2 = motionConfig.max_jerk ?? motionConfig.max_accel_per_s2 ?? 0;

    return {
      rampUp,
      rampDown,
      accelPerSec,
      accelPerSec2,
    };
  }, [
    motionConfig.max_accel,
    motionConfig.max_accel_per_s,
    motionConfig.max_accel_per_s2,
    motionConfig.max_jerk,
    motionConfig.ramp_down,
    motionConfig.ramp_down_s,
    motionConfig.ramp_up,
    motionConfig.ramp_up_s,
  ]);

  const formatStepsPerSecond = (rpm) => {
    if (!Number.isFinite(rpm)) return "--";
    return ((rpm / 60) * dm.microsteps).toFixed(0);
  };

  const stepsPerSecond = useMemo(
    () => ({
      main: formatStepsPerSecond(mainRpm),
      feed: formatStepsPerSecond(feedRpm),
    }),
    [feedRpm, mainRpm, dm.microsteps]
  );

  const feedRatio = useMemo(() => {
    if (!mainRpm) return "—";
    const ratio = (feedRpm / mainRpm) * 100;
    if (!Number.isFinite(ratio)) return "—";
    return `${ratio.toFixed(0)}% of main`;
  }, [feedRpm, mainRpm]);

  const motorTemp =
    temps.motor !== undefined ? `${temps.motor.toFixed(1)} °C` : "--.- °C";

  const sectionGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "16px",
  };

  const cardTitle = { color: "#dfe6ec", margin: "0 0 6px 0" };

  const fieldBox = {
    background: "#111",
    borderRadius: "8px",
    padding: "12px",
    border: "1px solid #1f2a36",
  };

  const toggleCardExpansion = (key, event) => {
    event.stopPropagation();
    keypad?.closeKeypad?.();
    setExpandedCard((prev) => (prev === key ? null : key));
  };

  const handleMotionValueClick = (key, currentValue, event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = Number.isFinite(currentValue) ? String(currentValue) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const num = parseFloat(val);
      if (!Number.isNaN(num) && num >= 0) {
        // Construct params object based on what changed
        // We need to send all current values plus the new one, or relies on backend partial updates?
        // App.py _validate_motion handles partial updates by merging with defaults?
        // Actually app.py: UPDATE_MOTION_CONFIG does {**current, **params}.
        // So we can send partial update.

        // Map UI keys to config keys
        const configKeyMap = {
            "rampUp": "ramp_up",
            "rampDown": "ramp_down",
            "accelPerSec": "max_accel",
            "accelPerSec2": "max_jerk"
        };

        const paramKey = configKeyMap[key];
        if (paramKey) {
            sendCmd("UPDATE_MOTION_CONFIG", { params: { [paramKey]: num } });
        }
      }
      setExpandedCard(null);
      keypad?.closeKeypad?.();
    });
  };

  const renderMotionCard = (key, label, value, unit, hint) => {
    const isExpanded = expandedCard === key;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
                style={{
                    ...styles.metricCard,
                    cursor: "pointer",
                    boxShadow: isExpanded ? "0 0 0 1px #3498db" : "0 8px 16px rgba(0,0,0,0.25)",
                    transition: "box-shadow 0.2s ease",
                    borderColor: isExpanded ? "#3498db" : "#1f2a36",
                    minHeight: "120px"
                }}
                onClick={(e) => toggleCardExpansion(key, e)}
                data-testid={`motion-card-${key}`}
            >
                <div style={styles.metricLabel}>{label}</div>
                <div style={styles.metricBig}>{value !== null ? value.toFixed(2) : "0.00"} {unit}</div>
                <div style={styles.cardHint}>{hint}</div>
            </div>

            {isExpanded && (
                 <div
                    ref={(node) => {
                        if (isExpanded) overlayRef.current = node;
                    }}
                    style={{
                        ...fieldBox,
                        background: "#0c0f15",
                        border: "1px solid #3498db",
                        cursor: "pointer",
                    }}
                    onClick={(e) => handleMotionValueClick(key, value, e)}
                    data-testid={`motion-input-${key}`}
                 >
                    <div style={{ ...styles.label, marginBottom: 6 }}>Set {label} ({unit})</div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            color: "#ecf0f1",
                        }}
                    >
                        <span style={{ fontSize: "1.4em", fontWeight: "bold" }}>
                            {value !== null ? value.toFixed(2) : ""}
                        </span>
                        <span style={{ fontSize: "0.85em", color: "#8c9fb1" }}>
                            Tap to edit
                        </span>
                    </div>
                 </div>
            )}
        </div>
    );
  };

  return (
    <div>
      <div style={styles.panel}>
        <h2>Motor overview</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa", marginTop: 4 }}>
          Live view of commanded speeds, thermal headroom and driver setup.
          Use the controls below to retune targets or jog each motor safely.
        </p>
        <div style={{ ...styles.metricGrid, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Main screw</div>
            <div style={styles.metricBig}>{rpmDisplay(mainRpm)}</div>
            <div style={styles.cardHint}>Steps/s: {stepsPerSecond.main}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Feeder</div>
            <div style={styles.metricBig}>{rpmDisplay(feedRpm)}</div>
            <div style={styles.cardHint}>Steps/s: {stepsPerSecond.feed}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Motor NTC</div>
            <div style={styles.metricBig}>{motorTemp}</div>
            <div style={styles.cardHint}>Monitor for thermal drift</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Feed ratio</div>
            <div style={styles.metricBig}>{feedRatio}</div>
            <div style={styles.cardHint}>Feeder speed relative to main screw</div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Speed targets</h3>
        <div style={{ ...styles.grid2, gap: "24px" }}>
          <div>
            <h4 style={cardTitle}>Main screw</h4>
            <div style={styles.label}>Target RPM</div>
            <input
              type="range"
              min="0"
              max="120"
              step="1"
              value={mainRpm}
              onChange={(e) => sendMain(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ ...styles.metricBig, marginTop: 6 }}>{rpmDisplay(mainRpm)}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[15, 30, 60, 90, 120].map((preset) => (
                <button
                  key={preset}
                  style={styles.buttonSecondary}
                  onClick={() => sendMain(preset)}
                >
                  {preset} RPM
                </button>
              ))}
              <button style={styles.buttonSecondary} onClick={() => sendMain(0)}>
                Stop main
              </button>
            </div>
          </div>
          <div>
            <h4 style={cardTitle}>Feeder</h4>
            <div style={styles.label}>Target RPM</div>
            <input
              type="range"
              min="0"
              max="60"
              step="1"
              value={feedRpm}
              onChange={(e) => sendFeed(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ ...styles.metricBig, marginTop: 6 }}>{rpmDisplay(feedRpm)}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[5, 10, 20, 40, 60].map((preset) => (
                <button
                  key={preset}
                  style={styles.buttonSecondary}
                  onClick={() => sendFeed(preset)}
                >
                  {preset} RPM
                </button>
              ))}
              <button style={styles.buttonSecondary} onClick={() => sendFeed(mainRpm)}>
                Match main
              </button>
              <button style={styles.buttonSecondary} onClick={() => sendFeed(0)}>
                Stop feeder
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Driver & DIP switches</h3>
        <p style={{ color: "#aab8c5", fontSize: "0.9em", marginTop: 0 }}>
          Update DM556 microstep and peak current settings to mirror the
          physical driver. Save changes to push the configuration to the
          controller and keep the visual DIP positions in sync.
        </p>
        <div style={sectionGrid}>
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={styles.label}>Microsteps per revolution</div>
              <select
                value={dm.microsteps}
                onChange={(e) => setDm((prev) => ({ ...prev, microsteps: Number(e.target.value) }))}
                style={{ width: "100%", padding: "10px", background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
              >
                {microstepOptions.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms} steps/rev
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={styles.label}>Peak current</div>
              <select
                value={dm.current_peak}
                onChange={(e) => setDm((prev) => ({ ...prev, current_peak: Number(e.target.value) }))}
                style={{ width: "100%", padding: "10px", background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
              >
                {currentOptions.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr} A peak
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#dfe6ec" }}>
              <input
                type="checkbox"
                checked={dm.idle_half}
                onChange={(e) => setDm((prev) => ({ ...prev, idle_half: e.target.checked }))}
              />
              Idle at half current
            </label>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={styles.button} onClick={applyDm}>
                Save driver setup
              </button>
              <span style={{ alignSelf: "center", color: "#8c9fb1", fontSize: "0.9em" }}>
                {dm.idle_half ? "½ current when idle" : "Full current when idle"}
              </span>
            </div>
          </div>
          <div>
            <div style={{ ...styles.cardHint, marginBottom: 10 }}>Microstep DIP</div>
            <DipSwitchBlock switches={switchStates.swSteps} />
            <div style={{ ...styles.cardHint, margin: "12px 0 10px" }}>Current DIP</div>
            <DipSwitchBlock switches={switchStates.swCurr} />
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Ramp & acceleration</h3>
        <p style={{ color: "#aaa", fontSize: "0.9em", marginTop: 0 }}>
          These values describe how quickly the motors speed up or slow down. If
          the backend exposes motion limits they are shown below; otherwise the
          fields will read "Not provided".
        </p>
        <div style={{ ...styles.cardGrid, marginTop: 12 }}>
            {renderMotionCard("rampUp", "Ramp up", motionMetrics.rampUp, "s", "Seconds needed to accelerate")}
            {renderMotionCard("rampDown", "Ramp down", motionMetrics.rampDown, "s", "Seconds needed to decelerate")}
            {renderMotionCard("accelPerSec", "Max accel", motionMetrics.accelPerSec, "RPM/s", "RPM per second")}
            {renderMotionCard("accelPerSec2", "Max accel rate", motionMetrics.accelPerSec2, "RPM/s²", "RPM per second²")}

          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Speed (steps/s) - Main</div>
            <div style={styles.metricBig}>{stepsPerSecond.main}</div>
            <div style={styles.cardHint}>Based on current RPM and microsteps</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Speed (steps/s) - Feeder</div>
            <div style={styles.metricBig}>{stepsPerSecond.feed}</div>
            <div style={styles.cardHint}>Based on current RPM and microsteps</div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Manual controls</h3>
        <div style={sectionGrid}>
          <div>
            <h4 style={cardTitle}>Main motor jog</h4>
            <div style={styles.label}>Move steps ({mainManualSteps})</div>
            <input
              type="range"
              min="1"
              max="1000"
              value={mainManualSteps}
              onChange={(e) => setMainManualSteps(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div style={{ ...styles.label, marginTop: 12 }}>Move rotations ({mainManualRotations})</div>
            <input
              type="range"
              min="1"
              max="1000"
              value={mainManualRotations}
              onChange={(e) => setMainManualRotations(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div style={{ ...styles.label, marginTop: 12 }}>Speed (steps/s)</div>
            <input
              type="number"
              value={mainManualSpeed}
              onChange={(e) => setMainManualSpeed(parseInt(e.target.value, 10) || 0)}
              style={styles.input}
            />
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={styles.buttonSecondary}
                onMouseDown={() => sendMoveSteps("main", 999999, mainManualSpeed)}
                onMouseUp={() => stopManualMove("main")}
              >
                Jog CW
              </button>
              <button
                style={styles.buttonSecondary}
                onMouseDown={() => sendMoveSteps("main", -999999, mainManualSpeed)}
                onMouseUp={() => stopManualMove("main")}
              >
                Jog CCW
              </button>
              <button
                style={{ ...styles.button, marginLeft: "10px" }}
                onClick={() => sendMoveSteps("main", mainManualSteps, mainManualSpeed)}
              >
                Send steps
              </button>
              <button
                style={{ ...styles.button, marginLeft: "10px" }}
                onClick={() => sendMoveRotations("main", mainManualRotations, mainManualSpeed)}
              >
                Send rotations
              </button>
              <button style={styles.buttonDanger} onClick={() => stopManualMove("main")}>
                Stop
              </button>
            </div>
          </div>
          <div>
            <h4 style={cardTitle}>Feeder jog</h4>
            <div style={styles.label}>Move steps ({feedManualSteps})</div>
            <input
              type="range"
              min="1"
              max="1000"
              value={feedManualSteps}
              onChange={(e) => setFeedManualSteps(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div style={{ ...styles.label, marginTop: 12 }}>Move rotations ({feedManualRotations})</div>
            <input
              type="range"
              min="1"
              max="1000"
              value={feedManualRotations}
              onChange={(e) => setFeedManualRotations(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div style={{ ...styles.label, marginTop: 12 }}>Speed (steps/s)</div>
            <input
              type="number"
              value={feedManualSpeed}
              onChange={(e) => setFeedManualSpeed(parseInt(e.target.value, 10) || 0)}
              style={styles.input}
            />
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={styles.buttonSecondary}
                onMouseDown={() => sendMoveSteps("feed", 999999, feedManualSpeed)}
                onMouseUp={() => stopManualMove("feed")}
              >
                Jog CW
              </button>
              <button
                style={styles.buttonSecondary}
                onMouseDown={() => sendMoveSteps("feed", -999999, feedManualSpeed)}
                onMouseUp={() => stopManualMove("feed")}
              >
                Jog CCW
              </button>
              <button
                style={{ ...styles.button, marginLeft: "10px" }}
                onClick={() => sendMoveSteps("feed", feedManualSteps, feedManualSpeed)}
              >
                Send steps
              </button>
              <button
                style={{ ...styles.button, marginLeft: "10px" }}
                onClick={() => sendMoveRotations("feed", feedManualRotations, feedManualSpeed)}
              >
                Send rotations
              </button>
              <button style={styles.buttonDanger} onClick={() => stopManualMove("feed")}>
                Stop
              </button>
            </div>
          </div>
        </div>
        <p style={{ marginTop: 16, color: "#8c9fb1", fontSize: "0.9em" }}>
          Hold the jog buttons to move continuously; release to stop. Use steps
          for small trims and rotations for calibrated moves based on the
          configured microsteps.
        </p>
      </div>
    </div>
  );
}

export default MotorScreen;
