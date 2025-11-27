// file: frontend/src/tabs/HomeScreen.jsx
import React, { useEffect, useRef, useState } from "react";
import { styles } from "../App";
import { validateSetpoint } from "../utils/validation";

function HomeScreen({ data, sendCmd, keypad }) {
  const status = data.state?.status || "UNKNOWN";
  const mode = data.state?.mode || "AUTO";
  const temps = data.state?.temps || {};
  const motors = data.state?.motors || {};
  const relays = data.state?.relays || {};
  const hasAlarm = status === "ALARM";
  const [expandedHeater, setExpandedHeater] = useState(null);
  const setpointRef = useRef(null);
  const [targetZ1, setTargetZ1] = useState(null);
  const [targetZ2, setTargetZ2] = useState(null);

  useEffect(() => {
    setTargetZ1(validateSetpoint(data.state?.target_z1));
    setTargetZ2(validateSetpoint(data.state?.target_z2));
  }, [data.state?.target_z1, data.state?.target_z2]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (setpointRef.current && !setpointRef.current.contains(event.target)) {
        setExpandedHeater(null);
      }
    };

    if (expandedHeater) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [expandedHeater]);

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

  const anyHeaterOn = heaterZ1On || heaterZ2On;

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

  const toggleHeaterCard = (zoneKey) => {
    keypad?.closeKeypad?.();
    setExpandedHeater((prev) => (prev === zoneKey ? null : zoneKey));
  };

  const handleSetpointClick = (zoneKey, targetValue, event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = Number.isFinite(targetValue) ? String(targetValue) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const validated = validateSetpoint(val);
      if (validated === null) {
        setExpandedHeater(null);
        keypad?.closeKeypad?.();
        return;
      }

      const nextZ1 = zoneKey === "z1" ? validated : targetZ1;
      const nextZ2 = zoneKey === "z2" ? validated : targetZ2;

      if (zoneKey === "z1") setTargetZ1(validated);
      if (zoneKey === "z2") setTargetZ2(validated);
      sendCmd("SET_TARGET", { z1: nextZ1, z2: nextZ2 });

      setExpandedHeater(null);
      keypad?.closeKeypad?.();
    });
  };

  const renderSetpointDropdown = (zoneKey, targetValue) => {
    const isNumber = Number.isFinite(targetValue);
    return (
      <div
        ref={(node) => {
          if (expandedHeater === zoneKey) setpointRef.current = node;
        }}
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 8,
          background: "#0c0f15",
          border: "1px solid #3498db",
          cursor: "pointer",
        }}
        onClick={(e) => handleSetpointClick(zoneKey, targetValue, e)}
        data-testid={`setpoint-dropdown-${zoneKey}`}
      >
        <div style={{ ...styles.metricLabel, marginBottom: 6 }}>Set point</div>
        <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>
          {isNumber ? `${targetValue.toFixed(0)} °C` : "-- °C"}
        </div>
        <div style={{ color: "#8c9fb1", marginTop: 4, fontSize: "0.9em" }}>
          Tap to edit setpoint
        </div>
      </div>
    );
  };

  const renderZone = (label, temp, target, zoneKey, relayOn) => {
    let color = "#7f8c8d";
    if (temp !== null && temp !== undefined) {
      if (target !== null && temp > target + 15) color = "#e74c3c";
      else if (target !== null && temp < target - 15) color = "#f39c12";
      else color = "#2ecc71";
    }

    const fieldBox = {
      background: "#111",
      borderRadius: "8px",
      padding: "12px",
      border: "1px solid #1f2a36",
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div
          style={{
            ...fieldBox,
            cursor: "pointer",
            boxShadow: expandedHeater === zoneKey ? "0 0 0 1px #3498db" : "none",
            transition: "box-shadow 0.2s ease",
          }}
          onClick={() => toggleHeaterCard(zoneKey)}
        >
          <div style={{ ...styles.label, marginBottom: 6 }}>
            {label} temperature
          </div>
          <div
            style={{
              fontSize: "1.6em",
              fontWeight: "bold",
              color,
            }}
          >
            {temp !== null && temp !== undefined
              ? `${temp.toFixed(1)} °C`
              : "--.- °C"}
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.8em", color: "#8c9fb1" }}>
            SSR {relayOn ? "active" : "idle"}
          </div>
        </div>

        {expandedHeater === zoneKey && (
          <div
            ref={(node) => {
              if (expandedHeater === zoneKey) setpointRef.current = node;
            }}
            style={{
              ...fieldBox,
              background: "#0c0f15",
              border: "1px solid #3498db",
              cursor: "pointer",
            }}
            onClick={(e) => handleSetpointClick(zoneKey, target, e)}
          >
            <div style={{ ...styles.label, marginBottom: 6 }}>Set point (°C)</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "#ecf0f1",
              }}
            >
              <span style={{ fontSize: "1.4em", fontWeight: "bold" }}>
                {target?.toFixed?.(1) ?? target}
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

        {/* schematic + anchored cards */}
        <div
          style={{
            position: "relative",
            marginTop: "14px",
            padding: "40px 0 90px",
          }}
        >
          <div
            style={{
              ...styles.metricCard,
              position: "absolute",
              left: "3%",
              top: 0,
              minWidth: 160,
              zIndex: 2,
            }}
          >
            <div style={styles.metricLabel}>Main motor</div>
            <div style={{ ...styles.metricValue, color: "#2ecc71" }}>
              {rpmDisplay(mainRpm)} RPM
            </div>
            <div style={{ color: "#8c9fb1", marginTop: 6 }}>Feeder {rpmDisplay(feedRpm)} RPM</div>
          </div>

          <div
            style={{
              ...styles.metricCard,
              position: "absolute",
              left: "5%",
              top: "60%",
              minWidth: 180,
              zIndex: 2,
            }}
          >
            <div style={styles.metricLabel}>Cooling fan</div>
            <div style={{ ...styles.metricValue, color: fanActive ? "#2ecc71" : "#7f8c8d" }}>
              {fanSpeed !== null ? `${rpmDisplay(fanSpeed)} RPM` : fanActive ? "ON" : "OFF"}
            </div>
            <div style={{ color: "#8c9fb1", marginTop: 6 }}>
              Auto-cooling tied to main screw activity
            </div>
          </div>

          <div
            style={{
              ...styles.metricCard,
              position: "absolute",
              left: "34%",
              top: 0,
              minWidth: 160,
              zIndex: 2,
            }}
            data-testid="heater-z1-card"
            onClick={() => toggleHeaterCard("z1")}
          >
            <div style={styles.metricLabel}>Heater Z1</div>
            <div style={{ ...styles.metricValue, color: heaterZ1On ? "#e74c3c" : "#7f8c8d" }}>
              {heaterZ1On ? "ON" : "OFF"}
            </div>
            <div style={{ color: "#8c9fb1", marginTop: 6 }}>
              Target {targetZ1?.toFixed?.(0) ?? 0}&deg;C
            </div>
            {expandedHeater === "z1" && renderSetpointDropdown("z1", targetZ1)}
          </div>

          <div
            style={{
              ...styles.metricCard,
              position: "absolute",
              left: "60%",
              top: 0,
              minWidth: 160,
              zIndex: 2,
            }}
            data-testid="heater-z2-card"
            onClick={() => toggleHeaterCard("z2")}
          >
            <div style={styles.metricLabel}>Heater Z2</div>
            <div style={{ ...styles.metricValue, color: heaterZ2On ? "#e74c3c" : "#7f8c8d" }}>
              {heaterZ2On ? "ON" : "OFF"}
            </div>
            <div style={{ color: "#8c9fb1", marginTop: 6 }}>
              Target {targetZ2?.toFixed?.(0) ?? 0}&deg;C
            </div>
            {expandedHeater === "z2" && renderSetpointDropdown("z2", targetZ2)}
          </div>

          <svg width="100%" viewBox="0 0 600 140">
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

            {/* Fan / pump */}
            <rect
              x="10"
              y="120"
              width="60"
              height="20"
              fill={relays.fan ? "#27ae60" : "#2c3e50"}
              rx="4"
              className={relays.fan ? "fan-spin" : ""}
            />
            <text
              x="40"
              y="135"
              textAnchor="middle"
              fill="#ecf0f1"
              fontSize="10"
            >
              FAN
            </text>

            <rect
              x="80"
              y="120"
              width="60"
              height="20"
              fill={relays.pump ? "#27ae60" : "#2c3e50"}
              rx="4"
            />
            <text
              x="110"
              y="135"
              textAnchor="middle"
              fill="#ecf0f1"
              fontSize="10"
            >
              PUMP
            </text>
          </svg>
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
        <h3>Heater zones</h3>
        <div style={styles.grid2}>
          {renderZone("Zone 1", t1, targetZ1, "z1", heaterZ1On)}
          {renderZone("Zone 2", t2, targetZ2, "z2", heaterZ2On)}
        </div>
      </div>

      <div style={styles.panel}>
        <h3>Temperature summary</h3>
        <div style={styles.grid2}>
          {tempBox("Nozzle", t3)}
          {tempBox("Motor", tm)}
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

export default HomeScreen;
