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
 * @param {Array} props.history - Rolling history of sensor data.
 */
function HomeScreen({ data, sendCmd, keypad, history = [] }) {
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

  const handleSetpointClick = (zoneKey, targetValue, event) => {
    event?.stopPropagation?.();
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const initial = Number.isFinite(targetValue) ? String(targetValue) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const validated = validateSetpoint(val);
        if (validated === null) {
          keypad?.closeKeypad?.();
          return;
        }

      const nextZ1 = zoneKey === "z1" ? validated : targetZ1;
      const nextZ2 = zoneKey === "z2" ? validated : targetZ2;

      if (zoneKey === "z1") setTargetZ1(validated);
      if (zoneKey === "z2") setTargetZ2(validated);
        sendCmd("SET_TARGET", { z1: nextZ1, z2: nextZ2 });

        keypad?.closeKeypad?.();
      });
    };

  const handleMotorSetpointClick = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const initial = Number.isFinite(mainRpm) ? String(mainRpm) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const rpm = parseFloat(val);
      if (!Number.isFinite(rpm) || rpm < 0) {
        keypad?.closeKeypad?.();
        return;
      }

      sendCmd("SET_MOTOR", { motor: "main", rpm });
      keypad?.closeKeypad?.();
    });
  };

  const schematicCardStyle = {
    ...styles.metricCard,
    minHeight: 80,
    height: 80,
    width: 140,
    padding: 10,
    gap: 6,
    position: "absolute",
    justifyContent: "center",
  };

  const renderSchematicCard = ({ key, label, value, color, position, actionLabel, onAction }) => (
    <div
      key={key}
      style={{
        ...schematicCardStyle,
        left: position.left,
        top: position.top,
        transform: "translate(-50%, -50%)",
        pointerEvents: "auto",
      }}
    >
      <div style={{ ...styles.metricLabel, textTransform: "none" }}>{label}</div>
      <div style={{ ...styles.metricValue, fontSize: "1.2em", color: color ?? "#ecf0f1" }}>
        {value}
      </div>
      {actionLabel && (
        <button
          style={{ ...styles.buttonSecondary, padding: "6px 10px", marginRight: 0, alignSelf: "flex-start" }}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(e);
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );

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

        <div style={{ marginTop: 14, position: "relative", minHeight: 240 }}>
          <svg width="100%" viewBox="0 0 600 140" style={{ display: "block" }}>
            {/* Motor */}
            <rect
              x="10"
              y="50"
              width="40"
              height="50"
              fill={motors.main > 0 ? "#27ae60" : "#2c3e50"}
              rx="4"
              className={motors.main > 0 ? "motor-active" : ""}
            />
            <text
              x="30"
              y="80"
              textAnchor="middle"
              fill="#ecf0f1"
              fontSize="10"
            >
              MOTOR
            </text>

            {/* Barrel + feed */}
            <rect x="50" y="60" width="500" height="30" fill="#7f8c8d" rx="5" />
            <line
              x1="60"
              y1="75"
              x2="540"
              y2="75"
              stroke={flowActive ? "#2ecc71" : "#4b4b4b"}
              strokeWidth="6"
              className={flowActive ? "flow-line" : ""}
              opacity={flowActive ? 0.9 : 0.5}
            />
            <polygon points="90,60 110,60 100,90" fill="#95a5a6" />
            <text
              x="100"
              y="50"
              textAnchor="middle"
              fill="#aaa"
              fontSize="10"
            >
              FEED
            </text>

            {/* Zone 1 */}
            <circle cx="130" cy="75" r="5" fill="#e67e22" />
            <text
              x="130"
              y="110"
              textAnchor="middle"
              fill="#e67e22"
              fontSize="12"
            >
              {t1 !== null ? (
                <>
                  T1: {t1.toFixed(1)}&deg;C
                </>
              ) : (
                <>T1: --.-&deg;C</>
              )}
            </text>
            <rect
              x="200"
              y="55"
              width="100"
              height="40"
              fill={relays.ssr_z1 ? "#e74c3c" : "#555"}
              opacity="0.5"
              rx="5"
              className={relays.ssr_z1 ? "heater-on" : ""}
            />
            <text
              x="250"
              y="50"
              textAnchor="middle"
              fill="#aaa"
              fontSize="10"
            >
              MICA Z1
            </text>

            {/* Zone 2 */}
            <circle cx="310" cy="75" r="5" fill="#e67e22" />
            <text
              x="310"
              y="110"
              textAnchor="middle"
              fill="#e67e22"
              fontSize="12"
            >
              {t2 !== null ? (
                <>
                  T2: {t2.toFixed(1)}&deg;C
                </>
              ) : (
                <>T2: --.-&deg;C</>
              )}
            </text>
            <rect
              x="320"
              y="55"
              width="100"
              height="40"
              fill={relays.ssr_z2 ? "#e74c3c" : "#555"}
              opacity="0.5"
              rx="5"
              className={relays.ssr_z2 ? "heater-on" : ""}
            />
            <text
              x="370"
              y="50"
              textAnchor="middle"
              fill="#aaa"
              fontSize="10"
            >
              MICA Z2
            </text>

            {/* Nozzle */}
            <circle cx="450" cy="75" r="5" fill="#e67e22" />
            <text
              x="450"
              y="110"
              textAnchor="middle"
              fill="#e67e22"
              fontSize="12"
            >
              {t3 !== null ? (
                <>
                  T3: {t3.toFixed(1)}&deg;C
                </>
              ) : (
                <>T3: --.-&deg;C</>
              )}
            </text>
            <polygon points="550,65 570,75 550,85" fill="#f1c40f" />
          </svg>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
            {renderSchematicCard({
              key: "motor",
              label: "Main motor",
              value: `${rpmDisplay(mainRpm)} RPM`,
              color: "#2ecc71",
              position: { left: "10%", top: "18%" },
              actionLabel: "Set RPM",
              onAction: handleMotorSetpointClick,
            })}

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
              position: { left: "28%", top: "18%" },
            })}

            {renderSchematicCard({
              key: "heater-z1",
              label: "Heater Z1",
              value: `${heaterZ1On ? "ON" : "OFF"} · ${
                targetZ1?.toFixed?.(0) ?? "--"
              }°C`,
              color: heaterZ1On ? "#e74c3c" : "#7f8c8d",
              position: { left: "44%", top: "18%" },
              actionLabel: "Set point",
              onAction: (e) => handleSetpointClick("z1", targetZ1, e),
            })}

            {renderSchematicCard({
              key: "heater-z2",
              label: "Heater Z2",
              value: `${heaterZ2On ? "ON" : "OFF"} · ${
                targetZ2?.toFixed?.(0) ?? "--"
              }°C`,
              color: heaterZ2On ? "#e74c3c" : "#7f8c8d",
              position: { left: "64%", top: "18%" },
              actionLabel: "Set point",
              onAction: (e) => handleSetpointClick("z2", targetZ2, e),
            })}

            {renderSchematicCard({
              key: "t1",
              label: "T1 barrel",
              value: t1 !== null && t1 !== undefined ? `${t1.toFixed(1)} °C` : "--.- °C",
              position: { left: "28%", top: "70%" },
            })}

            {renderSchematicCard({
              key: "t2",
              label: "T2 barrel",
              value: t2 !== null && t2 !== undefined ? `${t2.toFixed(1)} °C` : "--.- °C",
              position: { left: "55%", top: "70%" },
            })}

            {renderSchematicCard({
              key: "t3",
              label: "T3 barrel",
              value: t3 !== null && t3 !== undefined ? `${t3.toFixed(1)} °C` : "--.- °C",
              position: { left: "78%", top: "70%" },
            })}

            {renderSchematicCard({
              key: "tm",
              label: "Motor temp",
              value: tm !== null && tm !== undefined ? `${tm.toFixed(1)} °C` : "--.- °C",
              position: { left: "12%", top: "70%" },
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
