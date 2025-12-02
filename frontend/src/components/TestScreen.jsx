// file: frontend/src/tabs/TestScreen.jsx
import React, { useEffect, useMemo, useState } from "react";
import { styles } from "../styles";

const badge = (label, color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  borderRadius: "999px",
  background: color,
  color: "#0b0f14",
  fontWeight: "bold",
  fontSize: "0.85em",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
  border: "1px solid #0b0f14",
});

const sectionTitle = (title, subtitle) => (
  <div style={{ marginBottom: "12px" }}>
    <div style={{ color: "#ecf0f1", fontSize: "1.1em", fontWeight: "bold" }}>
      {title}
    </div>
    {subtitle && <div style={{ color: "#8c9fb1", fontSize: "0.9em" }}>{subtitle}</div>}
  </div>
);

/**
 * TestScreen Component.
 *
 * Provides a dedicated interface for low-level I/O testing and validation.
 *
 * Features:
 * - Direct control of relays (Fan, Pump).
 * - Motor RPM control and nudging.
 * - Manual jogging interface for motors.
 * - PWM channel testing with sliders.
 * - Live snapshot of system state and temperatures.
 * - Emergency Stop trigger.
 *
 * @param {object} props - Component props.
 * @param {object} props.data - Current system state and configuration.
 * @param {function} props.sendCmd - Function to send API commands.
 */
function TestScreen({ data, sendCmd }) {
  const relays = data.state?.relays || {};
  const motors = data.state?.motors || {};
  const temps = data.state?.temps || {};
  const pwmState = data.state?.pwm || {};
  const status = data.state?.status || "READY";
  const mode = data.state?.mode || "AUTO";
  const pwmConfig = data.config?.pwm || {};

  const [mainTarget, setMainTarget] = useState(motors.main ?? 0);
  const [feedTarget, setFeedTarget] = useState(motors.feed ?? 0);
  const [jogSteps, setJogSteps] = useState(200);
  const [jogSpeed, setJogSpeed] = useState(1000);
  const [localPwm, setLocalPwm] = useState(pwmState);

  useEffect(() => {
    setMainTarget(motors.main ?? 0);
    setFeedTarget(motors.feed ?? 0);
  }, [motors.main, motors.feed]);

  useEffect(() => {
    setLocalPwm(pwmState);
  }, [pwmState]);

  const pwmChannels = useMemo(() => {
    const channels = pwmConfig.channels || {};
    return Object.keys(channels).map((name) => ({ name, channel: channels[name] }));
  }, [pwmConfig.channels]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const toggleRelay = (relay) => {
    const next = !relays[relay];
    sendCmd("SET_RELAY", { relay, state: next });
  };

  const applyMotor = (motor, value) => {
    const safe = clamp(Number.isFinite(value) ? value : 0, 0, 5000);
    if (motor === "main") setMainTarget(safe);
    if (motor === "feed") setFeedTarget(safe);
    sendCmd("SET_MOTOR", { motor, rpm: safe });
  };

  const nudgeMotor = (motor, delta) => {
    const current = motor === "main" ? mainTarget : feedTarget;
    applyMotor(motor, current + delta);
  };

  const jogMotor = (motor, direction) => {
    const steps = clamp(parseInt(jogSteps, 10) || 0, 1, 100000);
    const speed = clamp(parseInt(jogSpeed, 10) || 0, 1, 20000);
    sendCmd("MOVE_MOTOR_STEPS", { motor, steps: direction * steps, speed });
  };

  const stopManualMove = (motor) => {
    sendCmd("STOP_MANUAL_MOVE", { motor });
  };

  const updatePwm = (name, duty) => {
    const safeDuty = clamp(Number.isFinite(duty) ? duty : 0, 0, 100);
    setLocalPwm((prev) => ({ ...prev, [name]: safeDuty }));
    sendCmd("SET_PWM_OUTPUT", { name, duty: safeDuty });
  };

  const tempsList = useMemo(() => {
    return Object.entries(temps).map(([key, value]) => `${key}: ${value?.toFixed?.(1) ?? value ?? "--"} °C`);
  }, [temps]);

  const ioCard = (title, body, footer) => (
    <div
      style={{
        ...styles.metricCard,
      }}
    >
      <div style={{ color: "#d7e0ea", fontWeight: "bold" }}>{title}</div>
      <div style={{ color: "#c9d6e2", flex: 1 }}>{body}</div>
      {footer && <div>{footer}</div>}
    </div>
  );

  const quickButton = (label, onClick, tone = "primary") => {
    let baseStyle = styles.button;
    if (tone === "secondary") baseStyle = styles.buttonSecondary;
    if (tone === "danger") baseStyle = styles.buttonDanger;

    return (
      <button
        style={{
          ...baseStyle,
          marginRight: 0,
          width: "100%",
        }}
        onClick={onClick}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>I/O Test Console</h2>
            <p style={{ fontSize: "0.9em", color: "#aaa", marginTop: "6px" }}>
              Exercise outputs, jog motors, and validate wiring in one place. Commands bypass production
              interlocks—keep eyes on the machine while experimenting.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <div style={badge(status, status === "READY" ? "#2ecc71" : "#f1c40f")}>{status}</div>
            <div style={badge(mode, "#95a5a6")}>Mode: {mode}</div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        {sectionTitle("Outputs", "Toggle relays without leaving the page.")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {ioCard(
            "Fan",
            <div>
              <div style={{ fontSize: "1.6em", fontWeight: "bold" }}>{relays.fan ? "ON" : "OFF"}</div>
              <div style={{ color: "#8c9fb1", marginTop: "4px" }}>
                Relay drives the cooling fan output.
              </div>
            </div>,
            quickButton(relays.fan ? "Turn fan off" : "Turn fan on", () => toggleRelay("fan"), relays.fan ? "secondary" : "primary")
          )}
          {ioCard(
            "Pump",
            <div>
              <div style={{ fontSize: "1.6em", fontWeight: "bold" }}>{relays.pump ? "ON" : "OFF"}</div>
              <div style={{ color: "#8c9fb1", marginTop: "4px" }}>
                Relay for coolant or additive pump.
              </div>
            </div>,
            quickButton(relays.pump ? "Turn pump off" : "Turn pump on", () => toggleRelay("pump"), relays.pump ? "secondary" : "primary")
          )}
          {ioCard(
            "Emergency stop",
            <div style={{ color: "#f8e287", fontWeight: "bold" }}>
              Latches all outputs off and records an alarm.
            </div>,
            quickButton("Send E-STOP", () => sendCmd("EMERGENCY_STOP"), "danger")
          )}
        </div>
      </div>

      <div style={styles.panel}>
        {sectionTitle("Motor control", "Set targets or nudge by a few RPM.")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          {ioCard(
            "Main screw",
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "2em", fontWeight: "bold" }}>{(motors.main ?? 0).toFixed(1)} RPM</div>
              <div style={{ color: "#8c9fb1" }}>Target</div>
              <input
                type="number"
                min="0"
                max="5000"
                step="1"
                value={mainTarget}
                onChange={(e) => setMainTarget(Number(e.target.value))}
                onBlur={() => applyMotor("main", mainTarget)}
                style={{ ...styles.input, width: "100%" }}
              />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[ -10, -5, 5, 10 ].map((delta) => (
                  <button
                    key={delta}
                    style={styles.buttonSecondary}
                    onClick={() => nudgeMotor("main", delta)}
                  >
                    {delta > 0 ? "+" : ""}{delta} RPM
                  </button>
                ))}
                <button style={styles.buttonSecondary} onClick={() => applyMotor("main", 0)}>Stop</button>
              </div>
            </div>
          )}

          {ioCard(
            "Feeder",
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "2em", fontWeight: "bold" }}>{(motors.feed ?? 0).toFixed(1)} RPM</div>
              <div style={{ color: "#8c9fb1" }}>Target</div>
              <input
                type="number"
                min="0"
                max="5000"
                step="1"
                value={feedTarget}
                onChange={(e) => setFeedTarget(Number(e.target.value))}
                onBlur={() => applyMotor("feed", feedTarget)}
                style={{ ...styles.input, width: "100%" }}
              />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[ -4, -2, 2, 4 ].map((delta) => (
                  <button
                    key={delta}
                    style={styles.buttonSecondary}
                    onClick={() => nudgeMotor("feed", delta)}
                  >
                    {delta > 0 ? "+" : ""}{delta} RPM
                  </button>
                ))}
                <button style={styles.buttonSecondary} onClick={() => applyMotor("feed", 0)}>Stop</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={styles.panel}>
        {sectionTitle("Jog", "Send small positioning moves without leaving the screen.")}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ minWidth: "180px" }}>
            <div style={styles.label}>Steps</div>
            <input
              type="number"
              min="1"
              max="100000"
              value={jogSteps}
              onChange={(e) => setJogSteps(e.target.value)}
              style={{ ...styles.input, width: "100%" }}
            />
          </div>
          <div style={{ minWidth: "180px" }}>
            <div style={styles.label}>Speed (steps/s)</div>
            <input
              type="number"
              min="1"
              max="20000"
              value={jogSpeed}
              onChange={(e) => setJogSpeed(e.target.value)}
              style={{ ...styles.input, width: "100%" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px", flex: 1 }}>
            {ioCard(
              "Main screw jog",
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button style={styles.buttonSecondary} onClick={() => jogMotor("main", -1)}>Reverse</button>
                <button style={styles.buttonSecondary} onClick={() => jogMotor("main", 1)}>Forward</button>
                <button style={styles.buttonSecondary} onClick={() => stopManualMove("main")}>Stop move</button>
              </div>
            )}
            {ioCard(
              "Feeder jog",
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button style={styles.buttonSecondary} onClick={() => jogMotor("feed", -1)}>Reverse</button>
                <button style={styles.buttonSecondary} onClick={() => jogMotor("feed", 1)}>Forward</button>
                <button style={styles.buttonSecondary} onClick={() => stopManualMove("feed")}>Stop move</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        {sectionTitle(
          "PWM outputs",
          pwmConfig.enabled
            ? "Fine tune duty cycles per channel."
            : "PWM controller is disabled in config; sliders are read-only."
        )}
        {pwmChannels.length === 0 ? (
          <div style={{ color: "#8c9fb1" }}>No PWM channels defined in config.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            {pwmChannels.map(({ name, channel }) => (
              <div
                key={name}
                style={{
                  ...styles.metricCard,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", color: "#d7e0ea", fontWeight: "bold" }}>
                  <span>{name}</span>
                  <span style={{ color: "#8c9fb1" }}>CH {channel}</span>
                </div>
                <div style={{ fontSize: "1.6em", fontWeight: "bold" }}>{(localPwm?.[name] ?? 0).toFixed?.(1) ?? "0.0"}%</div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={localPwm?.[name] ?? 0}
                  onChange={(e) => updatePwm(name, Number(e.target.value))}
                  disabled={!pwmConfig.enabled}
                />
                {!pwmConfig.enabled && (
                  <div style={{ color: "#f1c40f", fontSize: "0.9em" }}>
                    PWM disabled in controller config
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.panel}>
        {sectionTitle("Live snapshot", "Quick glance at temperatures and runtime state.")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          <div style={styles.pill}>Relays: fan {relays.fan ? "ON" : "OFF"} · pump {relays.pump ? "ON" : "OFF"}</div>
          <div style={styles.pill}>Main: {(motors.main ?? 0).toFixed(1)} RPM</div>
          <div style={styles.pill}>Feeder: {(motors.feed ?? 0).toFixed(1)} RPM</div>
        </div>
        <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
          {tempsList.length === 0 ? (
            <div style={{ color: "#8c9fb1" }}>No temperature telemetry available.</div>
          ) : (
            tempsList.map((entry) => (
              <div
                key={entry}
                style={{
                  ...styles.metricCard,
                  padding: "10px",
                  color: "#d7e0ea",
                }}
              >
                {entry}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default TestScreen;
