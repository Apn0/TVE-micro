// file: frontend/src/tabs/HeaterScreen.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { styles } from "../styles";
import { validateSetpoint } from "../utils/validation";

/**
 * HeaterScreen Component.
 *
 * Provides control and monitoring for the heater zones (Z1, Z2) and Peltier cooling element.
 *
 * Features:
 * - Schematic visualization of the heater zones.
 * - Live temperature display for each zone.
 * - Setpoint adjustment via keypad popup.
 * - Manual duty cycle control when in MANUAL mode.
 * - Peltier element control.
 * - Visual graph of temperature history.
 *
 * @param {object} props - Component props.
 * @param {object} props.data - Current system state and configuration.
 * @param {function} props.sendCmd - Function to send API commands.
 * @param {Array} props.history - Array of historical data points for the graph.
 * @param {object} props.keypad - The keypad hook object.
 */
function HeaterScreen({ data, sendCmd, history = [], keypad }) {
  const temps = data.state?.temps || {};
  const relays = data.state?.relays || {};
  const config = data.config || {};

  const [targetZ1, setTargetZ1] = useState(validateSetpoint(data.state?.target_z1));
  const [targetZ2, setTargetZ2] = useState(validateSetpoint(data.state?.target_z2));
  const [expandedZone, setExpandedZone] = useState(null);
  const [tuneZone, setTuneZone] = useState(null);

  const setpointRef = useRef(null);
  const dutyRef = useRef(null);
  const peltierDutyRef = useRef(null);

  // Extract Autotune state
  const atStatus = data.state?.autotune_status || "IDLE";
  const atResult = data.state?.autotune_result;
  const isTuning = atStatus === "HEATING" || atStatus === "COOLING" || atStatus === "STARTING";

  useEffect(() => {
    setTargetZ1(validateSetpoint(data.state?.target_z1));
    setTargetZ2(validateSetpoint(data.state?.target_z2));
  }, [data.state?.target_z1, data.state?.target_z2]);

  const startTune = (zone) => {
    if (confirm(`Start Auto-Tune for ${zone.toUpperCase()}? This will take 5-10 minutes.`)) {
      setTuneZone(zone);
      fetch("/api/tune/start", {
          method: "POST",
          body: JSON.stringify({ zone, setpoint: 150 })
      });
    }
  };

  const stopTune = () => {
    fetch("/api/tune/stop", { method: "POST" });
  };

  const applyTune = () => {
    fetch("/api/tune/apply", { method: "POST" });
  };

  const heaterGraph = useMemo(() => {
    if (!history || history.length < 2) return null;

    const width = 900;
    const height = 300;
    const padding = 40;

    const points = history
      .map((h) => h.temps || {})
      .flatMap((t) => [t.t1, t.t2, t.t3].filter((v) => v !== null && v !== undefined));

    let yMin = Math.min(...points);
    let yMax = Math.max(...points);
    if (!isFinite(yMin) || !isFinite(yMax)) {
      yMin = 0;
      yMax = 1;
    }
    if (yMax === yMin) {
      yMax += 1;
      yMin -= 1;
    }

    const xMin = history[0].t;
    const xMax = history[history.length - 1].t;
    const xSpan = xMax - xMin || 1;

    const mapX = (t) => padding + ((t - xMin) / xSpan) * (width - 2 * padding);
    const mapY = (v) =>
      height - padding - ((v - yMin) / (yMax - yMin)) * (height - 2 * padding);

    const buildSegments = (key) => {
      const segments = [];
      let prevOn = Boolean((history[0].relays || {})[key]);
      let prevTime = history[0].t;

      for (let i = 1; i < history.length; i++) {
        const sample = history[i];
        const on = Boolean((sample.relays || {})[key]);
        if (on !== prevOn) {
          segments.push({ start: prevTime, end: sample.t, on: prevOn });
          prevTime = sample.t;
          prevOn = on;
        }
      }

      segments.push({ start: prevTime, end: xMax, on: prevOn });
      return segments;
    };

    const getAverageTemp = (sample) => {
      const vals = [sample.temps?.t1, sample.temps?.t2, sample.temps?.t3].filter(
        (v) => v !== null && v !== undefined && !Number.isNaN(v)
      );
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const getSetpoint = (sample, fallback) => {
      const targets = [sample.target_z1, sample.target_z2].filter(
        (v) => v !== null && v !== undefined && !Number.isNaN(v)
      );
      if (targets.length === 0) return fallback;
      const avg = targets.reduce((a, b) => a + b, 0) / targets.length;
      return avg > 0 ? avg : fallback;
    };

    const phaseBands = (() => {
      const tolerance = 5; // degrees C allowance around setpoint
      let lastSetpoint = getSetpoint(history[0], null);
      let reachedSetpoint = false;

      const phaseForSample = (sample) => {
        const setpoint = getSetpoint(sample, lastSetpoint);
        if (setpoint !== null && setpoint !== undefined) {
          lastSetpoint = setpoint;
        }

        const avgTemp = getAverageTemp(sample);
        const motorRpm = (sample.motors?.main || 0) ?? 0;
        const atTemp =
          avgTemp !== null && lastSetpoint !== null && avgTemp >= lastSetpoint - tolerance;
        const belowTemp =
          avgTemp !== null && lastSetpoint !== null && avgTemp < lastSetpoint - tolerance;

        if (atTemp) reachedSetpoint = true;

        if (motorRpm > 0.1) return "production";
        if ((reachedSetpoint || atTemp) && belowTemp) return "cooldown";
        if (reachedSetpoint || atTemp) return "production_ready";
        return "warm_up";
      };

      let currentPhase = phaseForSample(history[0]);
      let phaseStart = history[0].t;
      const segments = [];

      for (let i = 1; i < history.length; i++) {
        const sample = history[i];
        const phase = phaseForSample(sample);
        if (phase !== currentPhase) {
          segments.push({ phase: currentPhase, start: phaseStart, end: sample.t });
          currentPhase = phase;
          phaseStart = sample.t;
        }
      }

      segments.push({ phase: currentPhase, start: phaseStart, end: xMax });
      return segments;
    })();

    const phaseColors = {
      warm_up: "rgba(241, 196, 15, 0.08)",
      production_ready: "rgba(46, 204, 113, 0.08)",
      production: "rgba(52, 152, 219, 0.08)",
      cooldown: "rgba(155, 89, 182, 0.08)",
    };

    const phaseLabels = {
      warm_up: "Warm up",
      production_ready: "Production-ready (idle)",
      production: "Production (main motor running)",
      cooldown: "Cooldown",
    };

    const yTicks = 5;
    const yStep = (yMax - yMin) / yTicks;
    const xTicks = 4;

    const seriesDefs = [
      { key: "t1", label: "T1 barrel", color: "#e74c3c" },
      { key: "t2", label: "T2 barrel", color: "#f1c40f" },
      { key: "t3", label: "T3 barrel", color: "#2ecc71" },
    ];

    const shadingColor = {
      ssr_z1: "rgba(52, 152, 219, 0.12)",
      ssr_z2: "rgba(155, 89, 182, 0.12)",
    };

    return (
      <div style={{ marginTop: "16px" }}>
        <h3>Zone influence on barrel temperatures</h3>
        <p style={{ fontSize: "0.9em", color: "#aaa", marginTop: "6px" }}>
          Transparent bands show when each heater SSR was active.
        </p>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ background: "#000" }}
        >
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#555" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#555" />

          {phaseBands.map((band, idx) => {
            const xStart = mapX(band.start);
            const xEnd = mapX(band.end);
            const labelX = (xStart + xEnd) / 2;
            const labelY = padding + 14;
            const showLabel = xEnd - xStart > 60;
            return (
              <g key={`phase-${idx}`}>
                <rect
                  x={xStart}
                  y={padding}
                  width={Math.max(xEnd - xStart, 0)}
                  height={height - 2 * padding}
                  fill={phaseColors[band.phase] || "rgba(255,255,255,0.05)"}
                />
                {showLabel && (
                  <text
                    x={labelX}
                    y={labelY}
                    fill="#ccc"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {phaseLabels[band.phase] || band.phase}
                  </text>
                )}
              </g>
            );
          })}

          {buildSegments("ssr_z1")
            .filter((s) => s.on)
            .map((s, idx) => (
              <rect
                key={`z1-${idx}`}
                x={mapX(s.start)}
                y={padding}
                width={Math.max(mapX(s.end) - mapX(s.start), 0)}
                height={height - 2 * padding}
                fill={shadingColor.ssr_z1}
              />
            ))}

          {buildSegments("ssr_z2")
            .filter((s) => s.on)
            .map((s, idx) => (
              <rect
                key={`z2-${idx}`}
                x={mapX(s.start)}
                y={padding}
                width={Math.max(mapX(s.end) - mapX(s.start), 0)}
                height={height - 2 * padding}
                fill={shadingColor.ssr_z2}
              />
            ))}

          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const v = yMin + i * yStep;
            const y = mapY(v);
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#222" />
                <text x={padding - 8} y={y + 4} fontSize="10" fill="#aaa" textAnchor="end">
                  {v.toFixed(0)}°
                </text>
              </g>
            );
          })}

          {Array.from({ length: xTicks + 1 }, (_, i) => {
            const t = xMin + (i / xTicks) * (xSpan || 1);
            const x = mapX(t);
            const secAgo = ((xMax - t) / 1000).toFixed(0);
            return (
              <g key={i}>
                <line x1={x} y1={height - padding} x2={x} y2={padding} stroke="#222" />
                <text x={x} y={height - padding + 14} fontSize="10" fill="#aaa" textAnchor="middle">
                  -{secAgo}s
                </text>
              </g>
            );
          })}

          {seriesDefs.map((s) => {
            const pts = history
              .map((h) => {
                const v = (h.temps || {})[s.key];
                if (v === null || v === undefined) return null;
                return `${mapX(h.t)},${mapY(v)}`;
              })
              .filter(Boolean)
              .join(" ");
            if (!pts) return null;
            return (
              <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.5" points={pts} />
            );
          })}
        </svg>

        <div style={{ marginTop: "8px", display: "flex", gap: "16px", fontSize: "0.85em", flexWrap: "wrap" }}>
          {seriesDefs.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ width: "14px", height: "2px", background: s.color, display: "inline-block", marginRight: "4px" }} />
              <span>{s.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "14px", height: "14px", background: shadingColor.ssr_z1, border: "1px solid #3498db", display: "inline-block" }} />
            <span>Zone 1 SSR active</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "14px", height: "14px", background: shadingColor.ssr_z2, border: "1px solid #9b59b6", display: "inline-block" }} />
            <span>Zone 2 SSR active</span>
          </div>
           <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "14px",
                height: "14px",
                background: phaseColors.warm_up,
                border: "1px solid #f1c40f",
                display: "inline-block",
              }}
            />
            <span>Warm up</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "14px",
                height: "14px",
                background: phaseColors.production_ready,
                border: "1px solid #2ecc71",
                display: "inline-block",
              }}
            />
            <span>Production-ready</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "14px",
                height: "14px",
                background: phaseColors.production,
                border: "1px solid #3498db",
                display: "inline-block",
              }}
            />
            <span>Production</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "14px",
                height: "14px",
                background: phaseColors.cooldown,
                border: "1px solid #9b59b6",
                display: "inline-block",
              }}
            />
            <span>Cooldown</span>
          </div>
        </div>
      </div>
    );
  }, [history]);

  useEffect(() => {
    if (!expandedZone) return undefined;

    const handleClick = (event) => {
      const insideSetpoint = setpointRef.current && setpointRef.current.contains(event.target);
      const insideDuty = dutyRef.current && dutyRef.current.contains(event.target);
      const insidePeltier = peltierDutyRef.current && peltierDutyRef.current.contains(event.target);

      if (!insideSetpoint && !insideDuty && !insidePeltier) {
        setExpandedZone(null);
        keypad?.closeKeypad?.();
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [expandedZone, keypad]);

  const toggleZoneExpansion = (zoneKey) => {
    keypad?.closeKeypad?.();
    setExpandedZone((prev) => (prev === zoneKey ? null : zoneKey));
  };

  const handleSetpointClick = (zoneKey, targetValue, event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = Number.isFinite(targetValue) ? String(targetValue) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const validated = validateSetpoint(val);
      if (validated === null) {
        setExpandedZone(null);
        keypad?.closeKeypad?.();
        return;
      }
      if (zoneKey === "z1") setTargetZ1(validated);
      if (zoneKey === "z2") setTargetZ2(validated);
      sendCmd("SET_TARGET", { z1: zoneKey === "z1" ? validated : targetZ1, z2: zoneKey === "z2" ? validated : targetZ2 });
      setExpandedZone(null);
      keypad?.closeKeypad?.();
    });
  };

  const handleDutyClick = (zoneKey, currentDuty, event) => {
    event.stopPropagation();
    if (data.state?.mode !== "MANUAL") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = Number.isFinite(currentDuty) ? String(currentDuty) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const num = parseFloat(val);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        sendCmd("SET_HEATER", { zone: zoneKey, duty: num });
      }
      setExpandedZone(null);
      keypad?.closeKeypad?.();
    });
  };

  const handlePeltierClick = (event) => {
    event.stopPropagation();
    const currentDuty = data.state?.peltier_duty ?? 0;
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = Number.isFinite(currentDuty) ? String(currentDuty) : "";

    keypad?.openKeypad?.(initial, rect, (val) => {
      const num = parseFloat(val);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        sendCmd("SET_PELTIER", { duty: num });
      }
      keypad?.closeKeypad?.();
      setExpandedZone(null);
    });
  };

  const handleModeToggle = () => {
    const newMode = data.state?.mode === "AUTO" ? "MANUAL" : "AUTO";
    sendCmd("SET_MODE", { mode: newMode });
  };

  // Replaces custom fieldBox with standard styles.metricCard look-alike
  // We use a small wrapper or just reuse styles.metricCard.
  // Note: styles.metricCard has minHeight: 150.
  const cardStyle = {
    ...styles.metricCard,
    cursor: "pointer",
    transition: "box-shadow 0.2s ease",
  };

  const renderSchematic = () => {
    // 600px width viewBox
    // Barrel length: 400px (x=50 to x=450)
    // T1: x=100
    // Z1: x=120 to 220
    // T2: x=250
    // Z2: x=270 to 370
    // T3: x=400

    // Active states
    const z1Active = relays.ssr_z1;
    const z2Active = relays.ssr_z2;

    return (
      <div style={{ marginBottom: 20, padding: 20, background: "#111", borderRadius: 8, border: "1px solid #1f2a36" }}>
         <h3 style={{ margin: "0 0 10px 0", color: "#ccc" }}>Heater Zones Schematic</h3>
         <svg width="100%" height="150" viewBox="0 0 600 150">
            {/* Barrel */}
            <defs>
              <linearGradient id="barrelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#7f8c8d" />
                <stop offset="50%" stopColor="#95a5a6" />
                <stop offset="100%" stopColor="#7f8c8d" />
              </linearGradient>
            </defs>
            <rect x="50" y="50" width="450" height="50" fill="url(#barrelGrad)" rx="5" />

            {/* Feed Throat */}
            <polygon points="50,50 80,20 110,50" fill="#555" />
            <text x="80" y="15" textAnchor="middle" fill="#888" fontSize="12">FEED</text>

            {/* Z1 Heater Band */}
            <rect
                x="120" y="45" width="100" height="60"
                fill={z1Active ? "rgba(231, 76, 60, 0.6)" : "rgba(127, 140, 141, 0.3)"}
                stroke={z1Active ? "#e74c3c" : "#555"}
                strokeWidth="2"
                rx="4"
            />
            <text x="170" y="40" textAnchor="middle" fill={z1Active ? "#e74c3c" : "#aaa"} fontWeight="bold">ZONE 1</text>

            {/* Z2 Heater Band */}
            <rect
                x="270" y="45" width="100" height="60"
                fill={z2Active ? "rgba(231, 76, 60, 0.6)" : "rgba(127, 140, 141, 0.3)"}
                stroke={z2Active ? "#e74c3c" : "#555"}
                strokeWidth="2"
                rx="4"
            />
             <text x="320" y="40" textAnchor="middle" fill={z2Active ? "#e74c3c" : "#aaa"} fontWeight="bold">ZONE 2</text>

            {/* Sensors */}
            <circle cx="100" cy="115" r="5" fill="#f1c40f" />
            <text x="100" y="135" textAnchor="middle" fill="#ccc" fontSize="12">T1</text>
            <line x1="100" y1="100" x2="100" y2="115" stroke="#f1c40f" strokeWidth="2" strokeDasharray="2,2"/>

            <circle cx="245" cy="115" r="5" fill="#f1c40f" />
            <text x="245" y="135" textAnchor="middle" fill="#ccc" fontSize="12">T2</text>
            <line x1="245" y1="100" x2="245" y2="115" stroke="#f1c40f" strokeWidth="2" strokeDasharray="2,2"/>

            <circle cx="390" cy="115" r="5" fill="#f1c40f" />
            <text x="390" y="135" textAnchor="middle" fill="#ccc" fontSize="12">T3</text>
            <line x1="390" y1="100" x2="390" y2="115" stroke="#f1c40f" strokeWidth="2" strokeDasharray="2,2"/>

            {/* Heat Flow Arrows (Animated when active) */}
            {z1Active && (
               <g transform="translate(170, 75)">
                  <path d="M -10 -20 L 0 0 L 10 -20" stroke="#e74c3c" strokeWidth="3" fill="none" opacity="0.8">
                     <animateTransform attributeName="transform" type="translate" from="0,-10" to="0,10" dur="1s" repeatCount="indefinite" />
                     <animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="indefinite" />
                  </path>
               </g>
            )}
            {z2Active && (
               <g transform="translate(320, 75)">
                  <path d="M -10 -20 L 0 0 L 10 -20" stroke="#e74c3c" strokeWidth="3" fill="none" opacity="0.8">
                     <animateTransform attributeName="transform" type="translate" from="0,-10" to="0,10" dur="1s" repeatCount="indefinite" />
                     <animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="indefinite" />
                  </path>
               </g>
            )}
         </svg>
      </div>
    );
  }

  const renderPeltierCard = () => {
    const duty = data.state?.peltier_duty ?? 0.0;
    const isExpanded = expandedZone === "peltier";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div
          style={{
            ...cardStyle,
            boxShadow: isExpanded ? "0 0 0 1px #3498db" : styles.metricCard.boxShadow,
            borderColor: duty > 0 ? "#3498db" : "#1f2a36",
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleZoneExpansion("peltier");
          }}
          data-testid="peltier-card"
        >
          <div style={styles.metricLabel}>Peltier Cooling</div>
          <div style={{ ...styles.metricValue, color: duty > 0 ? "#3498db" : "#7f8c8d" }}>
            {duty.toFixed(1)} %
          </div>
          <div style={styles.cardHint}>
            {duty > 0 ? "Cooling Active" : "Idle"}
          </div>
        </div>

        {isExpanded && (
          <div
             ref={(node) => { if (isExpanded) peltierDutyRef.current = node; }}
            style={{
              ...styles.metricCard,
              minHeight: 'auto',
              background: "#0c0f15",
              border: "1px solid #3498db",
              cursor: "pointer",
            }}
            onClick={handlePeltierClick}
            data-testid="peltier-duty-input"
          >
             <div style={styles.metricLabel}>Set Duty Cycle (%)</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ecf0f1" }}>
                <span style={{ fontSize: "1.4em", fontWeight: "bold" }}>{duty.toFixed(1)}</span>
                <span style={styles.cardHint}>Tap to edit</span>
              </div>
          </div>
        )}
      </div>
    );
  };

  const renderZone = (label, temp, target, zoneKey, relayOn) => {
    const tempIsValid = temp !== null && temp !== undefined && Number.isFinite(temp);
    const heaterDuty = data.state?.[`heater_duty_${zoneKey}`] ?? 0.0;
    const isManual = data.state?.mode === "MANUAL";
    const pidParams = config[zoneKey] || {};

    let color = "#7f8c8d";
    if (tempIsValid) {
      if (temp > target + 15) color = "#e74c3c";
      else if (temp < target - 15) color = "#f39c12";
      else color = "#2ecc71";
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div
          style={{
            ...cardStyle,
            boxShadow: expandedZone === zoneKey ? "0 0 0 1px #3498db" : styles.metricCard.boxShadow,
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleZoneExpansion(zoneKey);
          }}
          data-testid={`heater-card-${zoneKey}`}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div style={styles.metricLabel}>{label}</div>
             {tempIsValid && (
                 <div style={{fontSize: '0.8em', color: '#555', fontWeight: 'bold'}}>
                    TARGET: {target?.toFixed(1)}°
                 </div>
             )}
          </div>

          <div style={{ ...styles.metricValue, color }}>
            {tempIsValid ? `${temp.toFixed(1)} °C` : "--.- °C"}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={styles.cardHint}>
                Duty: {heaterDuty.toFixed(1)}% {relayOn && "🔥"}
              </div>
              {/* Optional PID display on main card */}
              <div style={{fontSize: '0.7em', color: '#444'}}>
                 P: {pidParams.kp} I: {pidParams.ki} D: {pidParams.kd}
              </div>
          </div>
        </div>

        {expandedZone === zoneKey && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Setpoint Editor */}
            <div
              ref={(node) => { if (expandedZone === zoneKey) setpointRef.current = node; }}
              style={{
                ...styles.metricCard,
                minHeight: 'auto',
                background: "#0c0f15",
                border: "1px solid #3498db",
                cursor: "pointer",
              }}
              onClick={(e) => handleSetpointClick(zoneKey, target, e)}
              data-testid={`setpoint-dropdown-${zoneKey}`}
            >
              <div style={styles.metricLabel}>Set point (°C)</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ecf0f1" }}>
                <span style={{ fontSize: "1.4em", fontWeight: "bold" }}>{target?.toFixed?.(1) ?? target}</span>
                <span style={styles.cardHint}>Tap to edit</span>
              </div>
            </div>

            {/* Duty Cycle Editor (Manual Mode Only) */}
            <div
              ref={(node) => { if (expandedZone === zoneKey) dutyRef.current = node; }}
              style={{
                ...styles.metricCard,
                minHeight: 'auto',
                background: "#0c0f15",
                border: isManual ? "1px solid #e67e22" : "1px solid #444",
                cursor: isManual ? "pointer" : "default",
                opacity: isManual ? 1 : 0.6,
              }}
              onClick={(e) => handleDutyClick(zoneKey, heaterDuty, e)}
              data-testid={`duty-dropdown-${zoneKey}`}
            >
              <div style={styles.metricLabel}>Duty Cycle (%)</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ecf0f1" }}>
                <span style={{ fontSize: "1.4em", fontWeight: "bold" }}>{heaterDuty.toFixed(1)}</span>
                <span style={{ fontSize: "0.85em", color: isManual ? "#e67e22" : "#8c9fb1" }}>
                  {isManual ? "Tap to edit" : "Auto controlled"}
                </span>
              </div>
            </div>

            {/* PID Info Card */}
             <div style={{
                ...styles.metricCard,
                minHeight: 'auto',
                background: "#151920",
                borderColor: "#333",
                padding: 10
             }}>
                <div style={styles.metricLabel}>PID Parameters</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginTop: 5 }}>
                    <div style={{textAlign: "center", background: "#000", padding: 4, borderRadius: 4}}>
                        <div style={{color: "#666", fontSize: "0.7em"}}>Kp</div>
                        <div style={{fontWeight: "bold", color: "#ddd"}}>{pidParams.kp}</div>
                    </div>
                     <div style={{textAlign: "center", background: "#000", padding: 4, borderRadius: 4}}>
                        <div style={{color: "#666", fontSize: "0.7em"}}>Ki</div>
                        <div style={{fontWeight: "bold", color: "#ddd"}}>{pidParams.ki}</div>
                    </div>
                     <div style={{textAlign: "center", background: "#000", padding: 4, borderRadius: 4}}>
                        <div style={{color: "#666", fontSize: "0.7em"}}>Kd</div>
                        <div style={{fontWeight: "bold", color: "#ddd"}}>{pidParams.kd}</div>
                    </div>
                </div>
             </div>

            {/* Tuning UI */}
            <div style={{marginTop: 5, borderTop: '1px solid #333', paddingTop: 10}}>
                {isTuning && tuneZone === zoneKey ? (
                    <div style={{background: '#d35400', padding: 8, borderRadius: 4, textAlign: 'center'}}>
                        <div style={{fontWeight: 'bold', color: 'white'}}>TUNING...</div>
                        <div style={{fontSize: '0.8em', color: '#ecf0f1', marginBottom: 5}}>Status: {atStatus}</div>
                        <button
                            onClick={stopTune}
                            style={{ ...styles.buttonDanger, marginTop: 5, width: '100%', fontSize: '0.9em', marginRight: 0 }}
                        >
                            STOP TUNING
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => startTune(zoneKey)}
                        disabled={isTuning}
                        style={{ ...styles.buttonSecondary, width: '100%', opacity: isTuning ? 0.3 : 1, background: '#2c3e50', border: '1px solid #444' }}
                    >
                        Auto-Tune (Tyreus-Luyben)
                    </button>
                )}
            </div>

            {atStatus === "DONE" && tuneZone === zoneKey && atResult && (
                <div style={{background: '#27ae60', padding: 8, borderRadius: 4, marginTop: 5}}>
                    <div style={{fontSize: '0.9em', fontWeight: 'bold', color: 'white', marginBottom: 4}}>Tuning Complete</div>
                    <div style={{fontSize: '0.8em', color: '#ecf0f1'}}>Kp={atResult.kp}, Ki={atResult.ki}, Kd={atResult.kd}</div>
                    <button
                        onClick={applyTune}
                        style={{ ...styles.button, width: '100%', fontSize: '0.9em', marginTop: 8, marginRight: 0, background: '#fff', color: '#27ae60' }}
                    >
                        APPLY SETTINGS
                    </button>
                </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2>Mica heater zones</h2>
            <p style={{ fontSize: "0.9em", color: "#aaa" }}>
              Set temperature targets for each zone. Toggle mode to control duty cycle manually.
            </p>
          </div>
          <button
            onClick={handleModeToggle}
            style={{
              padding: "10px 20px",
              background: data.state?.mode === "AUTO" ? "#2ecc71" : "#e67e22",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Mode: {data.state?.mode}
          </button>
        </div>

        {renderSchematic()}

        <div style={{ ...styles.grid2, gridTemplateColumns: "1fr 1fr 1fr" }}>
          {renderZone("Zone 1", temps.t1 ?? null, targetZ1, "z1", relays.ssr_z1)}
          {renderZone("Zone 2", temps.t2 ?? null, targetZ2, "z2", relays.ssr_z2)}
          {renderPeltierCard()}
        </div>
      </div>
      {heaterGraph}
    </div>
  );
}

export default HeaterScreen;
