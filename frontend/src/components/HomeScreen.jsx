// file: frontend/src/tabs/HomeScreen.jsx
import React, { useEffect, useState, useMemo } from "react";
import { styles } from "../App";
import { validateSetpoint } from "../utils/validation";

/**
 * HomeScreen Component.
 *
 * Provides a high-level overview of the extruder system, including:
 * - A graphical schematic visualization of temperatures and motor states.
 * - Quick controls for setting target temperatures and motor RPMs.
 * - System status summary (Mode, Run Status, Device States).
 * - Quick actions for mode toggling and Emergency Stop.
 *
 * @param {object} props - Component props.
 * @param {object} props.data - The current system state data (temperatures, motors, etc.).
 * @param {function} props.sendCmd - Function to send commands to the backend API.
 * @param {object} props.keypad - The keypad hook object for handling numeric input.
 * @param {function} props.setView - Function to switch between main views.
 * @param {Array} props.history - Rolling history of sensor data.
 */
function HomeScreen({ data, sendCmd, keypad, setView, history = [] }) {
  const status = data.state?.status || "UNKNOWN";
  const mode = data.state?.mode || "AUTO";
  const temps = data.state?.temps || {};
  const motors = data.state?.motors || {};
  const relays = data.state?.relays || {};
  const hasAlarm = status === "ALARM";
  const [targetZ1, setTargetZ1] = useState(null);
  const [targetZ2, setTargetZ2] = useState(null);

  useEffect(() => {
    setTargetZ1(validateSetpoint(data.state?.target_z1));
    setTargetZ2(validateSetpoint(data.state?.target_z2));
  }, [data.state?.target_z1, data.state?.target_z2]);

  const t1 = temps.t1 ?? null;
  const t2 = temps.t2 ?? null;
  const t3 = temps.t3 ?? null;
  const tm = temps.motor ?? null;

  const mainRpm = motors.main ?? 0;
  const feedRpm = motors.feed ?? 0;

  const fanSpeed =
    motors.main_fan ??
    data.state?.fans?.main ??
    data.state?.fans?.main_rpm ??
    data.state?.cooling?.fan_rpm ??
    null;
  const fanActive = Boolean(relays.fan || (fanSpeed ?? 0) > 0);

  const heaterZ1On = Boolean(
    relays.ssr_z1 ??
    relays.z1 ??
    relays.heater_z1 ??
    (data.state?.manual_duty_z1 ?? 0) > 0
  );
  const heaterZ2On = Boolean(
    relays.ssr_z2 ??
    relays.z2 ??
    relays.heater_z2 ??
    (data.state?.manual_duty_z2 ?? 0) > 0
  );

  // Calculated averages
  const z1 = (Number.isFinite(t1) && Number.isFinite(t2)) ? (t1 + t2) / 2 : null;
  const z2 = (Number.isFinite(t2) && Number.isFinite(t3)) ? (t2 + t3) / 2 : null;

  const tempBox = (label, value) => {
    const isValid = value !== null && value !== undefined;
    let color = "#7f8c8d";
    if (isValid) {
      if (value > 250) color = "#e74c3c";
      else if (value > 200) color = "#f39c12";
      else color = "#2ecc71";
    }
    return (
      <div style={{ background: "#111", borderRadius: "6px", padding: "10px" }}>
        <div style={{ color: "#aaa", fontSize: "0.9em" }}>{label}</div>
        <div style={{ fontSize: "1.4em", fontWeight: "bold", color }}>
          {isValid ? (
            <>
              {value.toFixed(1)}&nbsp;&deg;C
            </>
          ) : (
            <>--.-&nbsp;&deg;C</>
          )}
        </div>
      </div>
    );
  };

  const flowActive = motors.feed > 0 || motors.main > 0;

  const rpmDisplay = (value) => {
    if (value === null || value === undefined) return "--";
    if (Math.abs(value) < 0.05) return "0";
    return value.toFixed(0);
  };

  const pill = (text, color) => (
    <span style={{ ...styles.pill, borderColor: color, color }}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
        }}
      />
      {text}
    </span>
  );

  const schematicCardStyle = {
    ...styles.metricCard,
    minHeight: 80,
    width: 140,
    padding: 0,
    gap: 0,
    position: "absolute",
    justifyContent: "flex-start",
    flexDirection: "column",
    overflow: "hidden",
    cursor: "pointer",
  };

  const renderSchematicCard = ({ key, label, value, color, position, tab, setpoint }) => {
    const hasSetpoint = setpoint !== undefined && setpoint !== null;

    return (
      <div
        key={key}
        style={{
          ...schematicCardStyle,
          left: position.left,
          top: position.top,
          transform: "translate(-50%, -50%)",
          pointerEvents: "auto",
        }}
        onClick={(e) => {
          e.stopPropagation(); // prevent closing overlay if any
          if (setView && tab) setView(tab);
        }}
      >
        {/* Title Section */}
        <div style={{
          padding: "6px 10px",
          borderBottom: "1px solid #333",
          background: "rgba(255, 255, 255, 0.05)"
        }}>
          <div style={{ ...styles.metricLabel, textTransform: "none", fontSize: "0.8em" }}>{label}</div>
        </div>

        {/* Value Section */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px",
          borderBottom: hasSetpoint ? "1px solid #333" : "none"
        }}>
          <div style={{ ...styles.metricValue, fontSize: "1.3em", color: color ?? "#ecf0f1" }}>
            {value}
          </div>
        </div>

        {/* Setpoint Section (Conditional) */}
        {hasSetpoint && (
          <div style={{
            padding: "6px 10px",
            background: "rgba(0, 0, 0, 0.2)",
            textAlign: "center"
          }}>
            <div style={{ color: "#7f8c8d", fontSize: "1.0em", fontWeight: "bold" }}>
              {setpoint}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={hasAlarm ? "alarm-glow" : ""}>
      {mode === "MANUAL" && (
        <div style={styles.manualBanner}>
          MANUAL MODE - Interlocks/boundaries not enforced. Use carefully.
        </div>
      )}

      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Extruder overview</h2>
            <p style={{ fontSize: "0.9em", color: "#aaa", marginTop: "6px" }}>
              Live snapshot of motion, cooling, and heating states.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {pill(
              status,
              status === "READY"
                ? "#2ecc71"
                : status === "RUNNING"
                ? "#27ae60"
                : status === "ALARM"
                ? "#e74c3c"
                : "#f1c40f"
            )}
            {pill(mode === "AUTO" ? "AUTO" : "MANUAL", mode === "AUTO" ? "#9b59b6" : "#f39c12")}
          </div>
        </div>

        <div style={{ marginTop: 14, position: "relative", minHeight: 400 }}>
          <svg width="100%" viewBox="0 0 600 240" style={{ display: "block" }}>
            {/* Motor */}
            <rect
              x="10"
              y="100"
              width="40"
              height="50"
              fill={motors.main > 0 ? "#27ae60" : "#2c3e50"}
              rx="4"
              className={motors.main > 0 ? "motor-active" : ""}
            />
            <text
              x="30"
              y="130"
              textAnchor="middle"
              fill="#ecf0f1"
              fontSize="10"
            >
              MOTOR
            </text>

            {/* Barrel + feed */}
            <rect x="50" y="110" width="500" height="30" fill="#7f8c8d" rx="5" />
            <line
              x1="60"
              y1="125"
              x2="540"
              y2="125"
              stroke={flowActive ? "#2ecc71" : "#4b4b4b"}
              strokeWidth="6"
              className={flowActive ? "flow-line" : ""}
              opacity={flowActive ? 0.9 : 0.5}
            />
            <polygon points="90,110 110,110 100,140" fill="#95a5a6" />
            <text
              x="100"
              y="100"
              textAnchor="middle"
              fill="#aaa"
              fontSize="10"
            >
              FEED
            </text>

            {/* Zone 1 Sensor (T1/T2 Avg) */}
            <circle cx="250" cy="75" r="5" fill="#e67e22" />
            
            {/* Zone 1 Heater */}
            <rect
              x="200"
              y="105"
              width="100"
              height="40"
              fill={relays.ssr_z1 ? "#e74c3c" : "#555"}
              opacity="0.5"
              rx="5"
              className={relays.ssr_z1 ? "heater-on" : ""}
            />

            {/* Zone 2 Sensor (T2/T3 Avg) */}
            <circle cx="370" cy="75" r="5" fill="#e67e22" />
            
            {/* Zone 2 Heater */}
            <rect
              x="320"
              y="105"
              width="100"
              height="40"
              fill={relays.ssr_z2 ? "#e74c3c" : "#555"}
              opacity="0.5"
              rx="5"
              className={relays.ssr_z2 ? "heater-on" : ""}
            />

            {/* Nozzle */}
            <circle cx="450" cy="75" r="5" fill="#e67e22" />
            <polygon points="550,65 570,75 550,85" fill="#f1c40f" />
          </svg>

          {/* Overlay Cards */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>

            {/* Main Motor: Top Left */}
            {renderSchematicCard({
              key: "motor",
              label: "Main motor",
              value: `${rpmDisplay(mainRpm)} RPM`,
              color: "#2ecc71",
              position: { left: "12%", top: "25%" },
              tab: "MOTOR",
              setpoint: `${rpmDisplay(mainRpm)} RPM`, // Using current as setpoint proxy since target not separated in API yet
            })}

              {/* Cooling Fan: Top Left-ish */}
            {renderSchematicCard({
              key: "fan",
              label: "Cooling fan",
              value:
                fanSpeed !== null
                  ? `${rpmDisplay(fanSpeed)} RPM`
                  : fanActive
                  ? "ON"
                  : "OFF",
              color: fanActive ? "#2ecc71" : "#7f8c8d",
              position: { left: "30%", top: "25%" },
              tab: "MOTOR",
            })}

            {/* Heater Z1: Top Right */}
            {renderSchematicCard({
              key: "heater-z1",
              label: "Heater Z1",
              value: t2 !== null && t2 !== undefined ? `${t2.toFixed(1)} °C` : "--.- °C",
              color: heaterZ1On ? "#e74c3c" : "#7f8c8d",
              position: { left: "55%", top: "25%" },
              tab: "HEATERS",
              setpoint: targetZ1?.toFixed?.(0) ? `${targetZ1.toFixed(0)} °C` : "-- °C",
            })}

            {/* Heater Z2: Top Right */}
            {renderSchematicCard({
              key: "heater-z2",
              label: "Heater Z2",
              value: t3 !== null && t3 !== undefined ? `${t3.toFixed(1)} °C` : "--.- °C",
              color: heaterZ2On ? "#e74c3c" : "#7f8c8d",
              position: { left: "80%", top: "25%" },
              tab: "HEATERS",
              setpoint: targetZ2?.toFixed?.(0) ? `${targetZ2.toFixed(0)} °C` : "-- °C",
            })}


            {/* T1: Bottom Center */}
            {renderSchematicCard({
              key: "t1",
              label: "T1 barrel",
              value: t1 !== null && t1 !== undefined ? `${t1.toFixed(1)} °C` : "--.- °C",
              position: { left: "35%", top: "65%" },
              tab: "HEATERS",
            })}

            {/* T2: Bottom Right */}
            {renderSchematicCard({
              key: "t2",
              label: "T2 barrel",
              value: t2 !== null && t2 !== undefined ? `${t2.toFixed(1)} °C` : "--.- °C",
              position: { left: "55%", top: "65%" },
              tab: "HEATERS",
            })}

              {/* T3: Bottom Right */}
            {renderSchematicCard({
              key: "t3",
              label: "T3 barrel",
              value: t3 !== null && t3 !== undefined ? `${t3.toFixed(1)} °C` : "--.- °C",
              position: { left: "75%", top: "65%" },
              tab: "HEATERS",
            })}

            {/* Motor Temp: Bottom Left */}
            {renderSchematicCard({
              key: "tm",
              label: "Motor temp",
              value: tm !== null && tm !== undefined ? `${tm.toFixed(1)} °C` : "--.- °C",
              position: { left: "15%", top: "65%" },
              tab: "MOTOR",
            })}

            {/* NEW PLACEHOLDERS */}

            {/* Load %: Near Motor (Middle Left) */}
            {renderSchematicCard({
              key: "motor-load",
              label: "Motor Load",
              value: "-- %",
              position: { left: "12%", top: "45%" },
              tab: "MOTOR",
            })}

            {/* Amps: Near Motor (Middle Left) */}
            {renderSchematicCard({
              key: "motor-amps",
              label: "Motor Current",
              value: "-- A",
              position: { left: "12%", top: "85%" },
              tab: "MOTOR",
            })}

              {/* Valve: Top Left? */}
            {renderSchematicCard({
              key: "valve",
              label: "Valve Pos",
              value: "-- %",
              position: { left: "30%", top: "85%" },
              tab: "SENSORS",
            })}
          </div>
        </div>

        {/* status table below-right */}
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
            <div style={{ width: "260px" }}>
              <div style={styles.row}>
                <span>Status</span>
                <span
                  style={{
                  fontWeight: "bold",
                  color:
                    status === "READY"
                      ? "#2ecc71"
                      : status === "RUNNING"
                      ? "#27ae60"
                      : status === "ALARM"
                      ? "#e74c3c"
                      : "#f1c40f", // STARTING, STOPPING, etc.
                }}
                >
                  {status}
                </span>
              </div>
              <div style={styles.row}>
                <span>Mode</span>
                <span>{mode}</span>
              </div>
              <div style={styles.row}>
                <span>Main RPM</span>
                <span>{rpmDisplay(mainRpm)}</span>
              </div>
              <div style={styles.row}>
                <span>Feeder RPM</span>
                <span>{rpmDisplay(feedRpm)}</span>
              </div>
              <div style={styles.row}>
                <span>Fan speed</span>
                <span>
                  {fanSpeed !== null ? `${rpmDisplay(fanSpeed)} RPM` : fanActive ? "ON" : "OFF"}
                </span>
              </div>
              <div style={styles.row}>
                <span>Heater Z1</span>
                <span>{heaterZ1On ? "ON" : "OFF"}</span>
              </div>
              <div style={styles.row}>
                <span>Heater Z2</span>
                <span>{heaterZ2On ? "ON" : "OFF"}</span>
              </div>
              <div style={styles.row}>
                <span>Motor temp</span>
                <span>
                {tm !== null ? (
                  <>
                    {tm.toFixed(1)}&nbsp;&deg;C
                  </>
                ) : (
                  <>--.-&nbsp;&deg;C</>
                )}
              </span>
              </div>
            </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Temperature summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
          {tempBox("Motor", tm)}
          {tempBox("T1", t1)}
          {tempBox("T2", t2)}
          {tempBox("T3", t3)}

          <div style={{ background: "#111", borderRadius: "6px", padding: "10px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ color: "#aaa", fontSize: "0.9em", marginBottom: 5 }}>Motor plot</div>
            <MotorSparkline history={history} />
          </div>
          {tempBox("Z1", z1)}
          {tempBox("Z2", z2)}
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Quick actions</h3>
        {hasAlarm && (
          <div style={{marginBottom: '10px'}}>
            <div style={{color: '#e74c3c', fontWeight: 'bold', marginBottom: '5px'}}>
              ALARM ACTIVE - Check Alarms Tab
            </div>
          </div>
        )}
        <button
          style={styles.button}
          onClick={() =>
            sendCmd("SET_MODE", { mode: mode === "AUTO" ? "MANUAL" : "AUTO" })
          }
        >
          Toggle to {mode === "AUTO" ? "MANUAL" : "AUTO"}
        </button>
        <button
          style={styles.buttonDanger}
          onClick={() => sendCmd("EMERGENCY_STOP")}
        >
          EMERGENCY STOP
        </button>
      </div>

    </div>
  );
}

const MotorSparkline = ({ history }) => {
  const points = useMemo(() => {
    if (!history || history.length === 0) return "";
    // Last 60 points
    const slice = history.slice(-60);
    const values = slice.map((h) => h.temps?.motor).filter((v) => v !== null && v !== undefined);
    if (values.length < 2) return "";

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    // Add padding
    const paddedMin = min - range * 0.1;
    const paddedMax = max + range * 0.1;
    const paddedRange = paddedMax - paddedMin;

    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - ((v - paddedMin) / paddedRange) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, [history]);

  if (!points) {
    return (
      <div style={{ height: 30, color: "#333", fontSize: "0.8em", display: "flex", alignItems: "center" }}>
        No Data
      </div>
    );
  }

  return (
    <svg width="100%" height="30" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <polyline
        points={points}
        fill="none"
        stroke="#2ecc71"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default HomeScreen;