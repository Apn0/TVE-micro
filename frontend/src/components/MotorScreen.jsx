import React, { useEffect, useMemo, useState, useRef } from "react";
import { styles } from "../styles";
import DipSwitchBlock from "./DipSwitchBlock";
import { DM556_TABLE, DEFAULT_DM556 } from "../constants/dm556";

const rpmDisplay = (rpm) => `${rpm?.toFixed(0) ?? 0} RPM`;

// Helper components moved outside to prevent re-mounting issues
const MainControlContent = ({ rpm, setRpm, sendCmd }) => (
    <div>
      <h4 style={{ color: "#dfe6ec", margin: "0 0 6px 0" }}>Target RPM</h4>
      <input
          type="range"
          min="0"
          max="120"
          step="1"
          value={rpm}
          onChange={(e) => setRpm(parseFloat(e.target.value))} // Update local state for smooth slider
          onMouseUp={(e) => sendCmd("SET_MOTOR", { motor: "main", rpm: parseFloat(e.target.value) })} // Send command on release
          onTouchEnd={(e) => sendCmd("SET_MOTOR", { motor: "main", rpm: parseFloat(e.target.value) })}
          style={{ width: "100%", marginBottom: "10px" }}
      />
      <div style={{ textAlign: "center", marginBottom: "10px", fontSize: "1.2em", fontWeight: "bold", color: "#fff" }}>
          {rpmDisplay(rpm)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
           {[15, 30, 60, 90].map((preset) => (
              <button
                key={preset}
                style={styles.buttonSecondary}
                onClick={() => {
                    setRpm(preset);
                    sendCmd("SET_MOTOR", { motor: "main", rpm: preset });
                }}
              >
                {preset}
              </button>
            ))}
      </div>
      <button
          style={{ ...styles.buttonSecondary, width: "100%", marginTop: "8px", background: "#e74c3c" }}
          onClick={() => {
              setRpm(0);
              sendCmd("SET_MOTOR", { motor: "main", rpm: 0 });
          }}
      >
          STOP
      </button>
    </div>
);

const FeedControlContent = ({ rpm, setRpm, sendCmd, mainRpm }) => (
    <div>
      <h4 style={{ color: "#dfe6ec", margin: "0 0 6px 0" }}>Target RPM</h4>
      <input
          type="range"
          min="0"
          max="60"
          step="1"
          value={rpm}
          onChange={(e) => setRpm(parseFloat(e.target.value))}
          onMouseUp={(e) => sendCmd("SET_MOTOR", { motor: "feed", rpm: parseFloat(e.target.value) })}
          onTouchEnd={(e) => sendCmd("SET_MOTOR", { motor: "feed", rpm: parseFloat(e.target.value) })}
          style={{ width: "100%", marginBottom: "10px" }}
      />
      <div style={{ textAlign: "center", marginBottom: "10px", fontSize: "1.2em", fontWeight: "bold", color: "#fff" }}>
          {rpmDisplay(rpm)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
           {[5, 10, 20, 40].map((preset) => (
              <button
                key={preset}
                style={styles.buttonSecondary}
                onClick={() => {
                    setRpm(preset);
                    sendCmd("SET_MOTOR", { motor: "feed", rpm: preset });
                }}
              >
                {preset}
              </button>
            ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
          <button style={styles.buttonSecondary} onClick={() => {
              setRpm(mainRpm);
              sendCmd("SET_MOTOR", { motor: "feed", rpm: mainRpm });
          }}>
              Match
          </button>
          <button style={{...styles.buttonSecondary, background: "#e74c3c"}} onClick={() => {
              setRpm(0);
              sendCmd("SET_MOTOR", { motor: "feed", rpm: 0 });
          }}>
              Stop
          </button>
      </div>
    </div>
);

const FillControlContent = ({ level, setLevel, sendCmd }) => (
    <div>
      <h4 style={{ color: "#dfe6ec", margin: "0 0 6px 0" }}>Target Fill Level</h4>
      <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={level}
          onChange={(e) => setLevel(parseFloat(e.target.value))}
          onMouseUp={(e) => sendCmd("SET_FILL_TARGET", { level: parseFloat(e.target.value) })}
          onTouchEnd={(e) => sendCmd("SET_FILL_TARGET", { level: parseFloat(e.target.value) })}
          style={{ width: "100%", marginBottom: "10px" }}
      />
      <div style={{ textAlign: "center", marginBottom: "10px", fontSize: "1.2em", fontWeight: "bold", color: "#fff" }}>
          {level?.toFixed(1) ?? 0} cm
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
           {[20, 40, 60, 80].map((preset) => (
              <button
                key={preset}
                style={styles.buttonSecondary}
                onClick={() => {
                    setLevel(preset);
                    sendCmd("SET_FILL_TARGET", { level: preset });
                }}
              >
                {preset}
              </button>
            ))}
      </div>
    </div>
);

/**
 * MotorScreen Component.
 *
 * Provides comprehensive control and monitoring for the main screw motor and feeder motor.
 * Uses a schematic-based layout for primary controls and detailed panels for configuration.
 *
 * Features:
 * - Schematic visualization of Extruder and Feeder.
 * - Overlay interactive cards for Main Motor and Feeder Motor control.
 * - Configuration interface for DM556 stepper driver settings.
 * - Manual jogging controls.
 */
function MotorScreen({ data, sendCmd, keypad }) {
  const motors = data.state?.motors || {};
  const temps = data.state?.temps || {};
  const fillLevel = data.state?.fill_level ?? 0;
  const targetFillLevel = data.state?.target_fill_level ?? 0;
  const motionConfig = data.config?.motion || data.config?.motors || {};

  // Local state for controls
  const [mainRpm, setMainRpm] = useState(motors.main ?? 0);
  const [feedRpm, setFeedRpm] = useState(motors.feed ?? 0);
  const [fillTarget, setFillTarget] = useState(targetFillLevel);

  // Local state for manual jog settings
  const [mainManualSteps, setMainManualSteps] = useState(100);
  const [feedManualSteps, setFeedManualSteps] = useState(100);
  const [mainManualRotations, setMainManualRotations] = useState(1);
  const [feedManualRotations, setFeedManualRotations] = useState(1);
  const [mainManualSpeed, setMainManualSpeed] = useState(1000);
  const [feedManualSpeed, setFeedManualSpeed] = useState(1000);

  // Driver settings
  const [dm, setDm] = useState({
    ...DEFAULT_DM556,
    ...(data.config?.dm556 || {}),
  });

  const [expandedCard, setExpandedCard] = useState(null);
  const overlayRef = useRef(null);

  // Sync state with props
  useEffect(() => {
    // Only update if not currently interacting (optional optimization, but here we just sync)
    // Actually, to prevent slider jumping while dragging due to external updates,
    // we might want to check focus or similar, but for now simple sync is standard.
    // However, if we drag, we update local state. If a poll happens, it might overwrite.
    // For now, we sync. The slider uses onMouseUp to commit.
    if (expandedCard === null) {
        setMainRpm(motors.main ?? 0);
        setFeedRpm(motors.feed ?? 0);
        setFillTarget(targetFillLevel);
    }
  }, [motors.main, motors.feed, targetFillLevel, expandedCard]);

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
  }, [dmFromConfig]);

  // Click outside listener for closing expanded cards
  useEffect(() => {
    if (!expandedCard) return undefined;

    const handleClick = (event) => {
      const insideOverlay = overlayRef.current && overlayRef.current.contains(event.target);
      if (!insideOverlay) {
        setExpandedCard(null);
        keypad?.closeKeypad?.();
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [expandedCard, keypad]);

  // Command helpers
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

  // Calculations
  const microstepOptions = useMemo(
    () => Object.keys(DM556_TABLE.steps).map(Number).sort((a, b) => a - b),
    []
  );
  const currentOptions = useMemo(
    () => Object.keys(DM556_TABLE.current).map(Number).sort((a, b) => a - b),
    []
  );

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
    return { rampUp, rampDown, accelPerSec, accelPerSec2 };
  }, [motionConfig]);

  const formatStepsPerSecond = (rpm) => {
    if (!Number.isFinite(rpm)) return "--";
    return ((rpm / 60) * dm.microsteps).toFixed(0);
  };

  const stepsPerSecond = useMemo(
    () => ({
      main: formatStepsPerSecond(motors.main ?? 0),
      feed: formatStepsPerSecond(motors.feed ?? 0),
    }),
    [motors.feed, motors.main, dm.microsteps]
  );

  const feedRatio = useMemo(() => {
    const m = motors.main ?? 0;
    const f = motors.feed ?? 0;
    if (!m) return "—";
    const ratio = (f / m) * 100;
    if (!Number.isFinite(ratio)) return "—";
    return `${ratio.toFixed(0)}%`;
  }, [motors.feed, motors.main]);

  const motorTemp = Number.isFinite(temps.motor) ? `${temps.motor.toFixed(1)} °C` : "--.- °C";

  // --- UI Helpers ---

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

  // ADDED toggleCardExpansion function here
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

  const renderSchematicCard = ({ key, label, value, color, position, onClick, expandedContent, setpoint, unit }) => {
    const isExpanded = expandedCard === key;

    // Base card style similar to HomeScreen
    const cardStyle = {
      ...styles.metricCard,
      minHeight: 80,
      width: 140,
      padding: 0,
      gap: 0,
      position: "absolute",
      justifyContent: "space-between",
      flexDirection: "column",
      overflow: "visible", // Allow expansion
      cursor: onClick ? "pointer" : "default",
      left: position.left,
      top: position.top,
      transform: "translate(-50%, -50%)",
      pointerEvents: "auto",
      zIndex: isExpanded ? 100 : 10,
      borderColor: isExpanded ? "#3498db" : "#000",
      boxShadow: isExpanded ? "0 0 0 2px #3498db, 0 10px 30px rgba(0,0,0,0.5)" : "none",
      transition: "all 0.2s ease"
    };

    return (
      <div
        key={key}
        style={cardStyle}
        onClick={(e) => {
            if (onClick) onClick(e);
        }}
      >
        {/* Title Section */}
        <div style={{
          padding: "6px 10px",
          borderBottom: "1px solid #000",
          background: "#fff",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{
            ...styles.metricLabel,
            textTransform: "none",
            fontSize: "0.8em",
            margin: 0,
            borderBottom: "none",
            padding: 0,
            textAlign: "left",
            background: "transparent"
          }}>{label}</div>
        </div>

        {/* Value Section */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ ...styles.metricValue, fontSize: "1.3em", color: color ?? "#000" }}>
            {value}
          </div>
        </div>

        {/* Footer Section (Setpoint) */}
        {setpoint !== undefined && (
             <div style={{
                 ...styles.metricFooter,
                 margin: 0,
                 padding: "6px 10px",
                 fontSize: "0.85em"
             }}>
                 <span style={{...styles.setpointBadge, fontSize: "1.0em"}}>{setpoint}</span>
                 {unit && <span style={{color: "#555"}}>{unit}</span>}
             </div>
        )}

        {/* Expanded Content Overlay */}
        {isExpanded && expandedContent && (
            <div
                ref={overlayRef}
                style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "280px",
                    background: "#0c0f15",
                    border: "1px solid #3498db",
                    borderRadius: "8px",
                    marginTop: "10px",
                    padding: "16px",
                    zIndex: 101,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
                    cursor: "default"
                }}
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
                {expandedContent}
            </div>
        )}
      </div>
    );
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
    <div style={styles.container}>
      <div style={styles.panel}>
        <h2>Motor Control</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa", marginTop: 4 }}>
          Tap on the Main Screw or Feeder cards to adjust speed settings.
        </p>

        <div style={{ marginTop: 20, position: "relative", minHeight: 400 }}>
             <svg width="100%" viewBox="0 0 600 300" style={{ display: "block" }}>
                {/* Feeder Hopper (Funnel) */}
                <path d="M 80 80 L 160 80 L 140 140 L 100 140 Z" fill="#7f8c8d" />
                <rect x="90" y="20" width="60" height="60" fill="#95a5a6" rx="4" />
                <text x="120" y="55" textAnchor="middle" fill="#2c3e50" fontSize="10" fontWeight="bold">FEEDER</text>

                {/* Connection to Barrel */}
                <rect x="110" y="140" width="20" height="40" fill="#7f8c8d" />

                {/* Barrel */}
                <rect x="110" y="180" width="450" height="40" fill="#555" rx="4" />

                {/* Main Motor / Gearbox */}
                <rect x="40" y="160" width="80" height="80" fill="#34495e" rx="4" />
                <text x="80" y="205" textAnchor="middle" fill="#ecf0f1" fontSize="10" fontWeight="bold">MAIN</text>

                {/* Screw Hint */}
                 <line x1="120" y1="200" x2="550" y2="200" stroke="#7f8c8d" strokeWidth="2" strokeDasharray="5,5" />
             </svg>

             {/* Cards */}
             {renderSchematicCard({
                 key: "feed",
                 label: "Feeder motor",
                 value: rpmDisplay(motors.feed ?? 0),
                 color: motors.feed > 0 ? "#2ecc71" : "#000",
                 position: { left: "20%", top: "15%" },
                 onClick: (e) => toggleCardExpansion("feed", e),
                 setpoint: (feedRpm ?? 0).toFixed(0),
                 unit: "rpm",
                 expandedContent: <FeedControlContent
                     rpm={feedRpm}
                     setRpm={setFeedRpm}
                     sendCmd={sendCmd}
                     mainRpm={motors.main ?? 0}
                 />
             })}

             {renderSchematicCard({
                 key: "fill",
                 label: "Fill level",
                 value: `${fillLevel.toFixed(1)} cm`,
                 color: "#3498db",
                 position: { left: "20%", top: "-15%" }, // Above feeder
                 onClick: (e) => toggleCardExpansion("fill", e),
                 setpoint: fillTarget.toFixed(1),
                 unit: "cm",
                 expandedContent: <FillControlContent
                     level={fillTarget}
                     setLevel={setFillTarget}
                     sendCmd={sendCmd}
                 />
             })}

             {renderSchematicCard({
                 key: "main",
                 label: "Main screw",
                 value: rpmDisplay(motors.main ?? 0),
                 color: motors.main > 0 ? "#2ecc71" : "#000",
                 position: { left: "15%", top: "75%" },
                 onClick: (e) => toggleCardExpansion("main", e),
                 setpoint: (mainRpm ?? 0).toFixed(0),
                 unit: "rpm",
                 expandedContent: <MainControlContent
                     rpm={mainRpm}
                     setRpm={setMainRpm}
                     sendCmd={sendCmd}
                 />
             })}

             {renderSchematicCard({
                 key: "ratio",
                 label: "Feed Ratio",
                 value: feedRatio,
                 color: "#000",
                 position: { left: "45%", top: "15%" },
             })}

             {renderSchematicCard({
                 key: "temp",
                 label: "Motor NTC",
                 value: motorTemp,
                 color: temps.motor > 60 ? "#e74c3c" : "#555",
                 position: { left: "45%", top: "75%" },
             })}
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
