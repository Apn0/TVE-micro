// file: frontend/src/tabs/HeaterScreen.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { styles } from "../App";
import { validateSetpoint } from "../utils/validation";

function HeaterScreen({ data, sendCmd, history = [], keypad }) {
  const temps = data.state?.temps || {};
  const relays = data.state?.relays || {};
  const [targetZ1, setTargetZ1] = useState(validateSetpoint(data.state?.target_z1));
  const [targetZ2, setTargetZ2] = useState(validateSetpoint(data.state?.target_z2));
  const [expandedZone, setExpandedZone] = useState(null);
  const setpointRef = useRef(null);

  useEffect(() => {
    setTargetZ1(validateSetpoint(data.state?.target_z1));
    setTargetZ2(validateSetpoint(data.state?.target_z2));
  }, [data.state?.target_z1, data.state?.target_z2]);

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

    const shadingColor = {
      ssr_z1: "rgba(52, 152, 219, 0.12)",
      ssr_z2: "rgba(155, 89, 182, 0.12)",
    };

    const yTicks = 5;
    const yStep = (yMax - yMin) / yTicks;
    const xTicks = 4;

    const seriesDefs = [
      { key: "t1", label: "T1 barrel", color: "#e74c3c" },
      { key: "t2", label: "T2 barrel", color: "#f1c40f" },
      { key: "t3", label: "T3 barrel", color: "#2ecc71" },
    ];

    return (
      <div style={{ marginTop: "16px" }}>
        <h3>Zone influence on barrel temperatures</h3>
        <p style={{ fontSize: "0.9em", color: "#aaa", marginTop: "6px" }}>
          Transparent bands show when each heater SSR was active. Use this to see
          how zone 1 and zone 2 firing impacts barrel thermocouples T1, T2, and T3
          over time. Stage shading marks warm up, production readiness, production,
          and cooldown so you can correlate temperature behavior with the line
          lifecycle.
        </p>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ background: "#000" }}
        >
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="#555"
          />
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#555"
          />

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
                <line
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="#222"
                />
                <text
                  x={padding - 8}
                  y={y + 4}
                  fontSize="10"
                  fill="#aaa"
                  textAnchor="end"
                >
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
                <line
                  x1={x}
                  y1={height - padding}
                  x2={x}
                  y2={padding}
                  stroke="#222"
                />
                <text
                  x={x}
                  y={height - padding + 14}
                  fontSize="10"
                  fill="#aaa"
                  textAnchor="middle"
                >
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
              <polyline
                key={s.key}
                fill="none"
                stroke={s.color}
                strokeWidth="1.5"
                points={pts}
              />
            );
          })}
        </svg>

        <div
          style={{
            marginTop: "8px",
            display: "flex",
            gap: "16px",
            fontSize: "0.85em",
            flexWrap: "wrap",
          }}
        >
          {seriesDefs.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  width: "14px",
                  height: "2px",
                  background: s.color,
                  display: "inline-block",
                  marginRight: "4px",
                }}
              />
              <span>{s.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "14px",
                height: "14px",
                background: shadingColor.ssr_z1,
                border: "1px solid #3498db",
                display: "inline-block",
              }}
            />
            <span>Zone 1 SSR active</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "14px",
                height: "14px",
                background: shadingColor.ssr_z2,
                border: "1px solid #9b59b6",
                display: "inline-block",
              }}
            />
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
            <span>Production-ready (not producing)</span>
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
            <span>Production (main motor running)</span>
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
      if (setpointRef.current && !setpointRef.current.contains(event.target)) {
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

      const nextZ1 = zoneKey === "z1" ? validated : targetZ1;
      const nextZ2 = zoneKey === "z2" ? validated : targetZ2;

      if (zoneKey === "z1") setTargetZ1(validated);
      if (zoneKey === "z2") setTargetZ2(validated);
      sendCmd("SET_TARGET", { z1: nextZ1, z2: nextZ2 });

      setExpandedZone(null);
      keypad?.closeKeypad?.();
    });
  };

  const fieldBox = {
    background: "#111",
    borderRadius: "8px",
    padding: "12px",
    border: "1px solid #1f2a36",
  };

  const renderZone = (label, temp, target, zoneKey, relayOn) => {
    let color = "#7f8c8d";
    if (temp !== null && temp !== undefined) {
      if (temp > target + 15) color = "#e74c3c";
      else if (temp < target - 15) color = "#f39c12";
      else color = "#2ecc71";
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div
          style={{
            ...fieldBox,
            cursor: "pointer",
            boxShadow: expandedZone === zoneKey ? "0 0 0 1px #3498db" : "none",
            transition: "box-shadow 0.2s ease",
          }}
          onClick={() => toggleZoneExpansion(zoneKey)}
        >
          <div style={{ ...styles.label, marginBottom: 6 }}>{label} temperature</div>
          <div
            style={{
              fontSize: "1.6em",
              fontWeight: "bold",
              color,
            }}
          >
            {temp !== null && temp !== undefined ? `${temp.toFixed(1)} °C` : "--.- °C"}
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.8em", color: "#8c9fb1" }}>
            SSR {relayOn ? "active" : "idle"}
          </div>
        </div>

        {expandedZone === zoneKey && (
          <div
            ref={(node) => {
              if (expandedZone === zoneKey) setpointRef.current = node;
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
              <span style={{ fontSize: "1.4em", fontWeight: "bold" }}>{target?.toFixed?.(1) ?? target}</span>
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
        <h2>Mica heater zones</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Set temperature targets for each zone. PID loop will eventually drive
          SSR duty; for now we just pass targets to the backend.
        </p>
        <div style={styles.grid2}>
          {renderZone("Zone 1", temps.t1 ?? null, targetZ1, "z1", relays.ssr_z1)}
          {renderZone("Zone 2", temps.t2 ?? null, targetZ2, "z2", relays.ssr_z2)}
        </div>
      </div>
      {heaterGraph}
    </div>
  );
}

export default HeaterScreen;
