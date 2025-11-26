// file: frontend/src/tabs/HeaterScreen.jsx
import React, { useState, useEffect, useMemo } from "react";
import { styles } from "../App";

function HeaterScreen({ data, sendCmd, history = [] }) {
  const temps = data.state?.temps || {};
  const relays = data.state?.relays || {};
  const [targetZ1, setTargetZ1] = useState(data.state?.target_z1 ?? 0);
  const [targetZ2, setTargetZ2] = useState(data.state?.target_z2 ?? 0);

  useEffect(() => {
    setTargetZ1(data.state?.target_z1 ?? 0);
    setTargetZ2(data.state?.target_z2 ?? 0);
  }, [data.state?.target_z1, data.state?.target_z2]);

  const applyTargets = () => {
    sendCmd("SET_TARGET", { z1: targetZ1, z2: targetZ2 });
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
          over time.
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
        </div>
      </div>
    );
  }, [history]);

  const renderZone = (label, temp, target, onChange, relayOn) => {
    let color = "#7f8c8d";
    if (temp !== null && temp !== undefined) {
      if (temp > target + 15) color = "#e74c3c";
      else if (temp < target - 15) color = "#f39c12";
      else color = "#2ecc71";
    }

    return (
      <div style={{ background: "#111", borderRadius: "6px", padding: "12px" }}>
        <div style={styles.label}>{label}</div>
        <div
          style={{
            fontSize: "1.6em",
            fontWeight: "bold",
            color,
          }}
        >
          {temp !== null && temp !== undefined ? `${temp.toFixed(1)} °C` : "--.- °C"}
        </div>
        <div style={{ marginTop: "10px" }}>
          <div style={styles.label}>Target (°C)</div>
          <input
            type="number"
            value={target}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{ ...styles.input, width: "80px" }}
          />
        </div>
        <div style={{ marginTop: "8px", fontSize: "0.8em" }}>
          SSR:{" "}
          <span style={{ color: relayOn ? "#2ecc71" : "#7f8c8d" }}>
            {relayOn ? "ON" : "OFF"}
          </span>
        </div>
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
          {renderZone(
            "Zone 1",
            temps.t1 ?? null,
            targetZ1,
            setTargetZ1,
            relays.ssr_z1
          )}
          {renderZone(
            "Zone 2",
            temps.t2 ?? null,
            targetZ2,
            setTargetZ2,
            relays.ssr_z2
          )}
        </div>
        <button
          style={{ ...styles.button, marginTop: "20px" }}
          onClick={applyTargets}
        >
          Apply targets
        </button>
      </div>
      {heaterGraph}
    </div>
  );
}

export default HeaterScreen;
