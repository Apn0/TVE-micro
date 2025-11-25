// file: frontend/src/tabs/HistoryScreen.jsx
import React from "react";
import { styles } from "../App";

function HistoryScreen({ history }) {
  const width = 900;
  const height = 260;
  const padding = 40;

  if (!history || history.length === 0) {
    return (
      <div style={styles.panel}>
        <h2>History</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Waiting for samples… leave the HMI running to build a few minutes of
          temperature and RPM history.
        </p>
      </div>
    );
  }

  const seriesDefs = [
    { key: "t1", label: "T1", color: "#e74c3c" },
    { key: "t2", label: "T2", color: "#f1c40f" },
    { key: "t3", label: "T3", color: "#2ecc71" },
    { key: "motor", label: "Motor", color: "#3498db" },
  ];

  const temps = history
    .map((h) => h.temps || {})
    .flatMap((t) => [t.t1, t.t2, t.t3, t.motor].filter((v) => v !== null && v !== undefined));

  let yMin = Math.min(...temps);
  let yMax = Math.max(...temps);
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

  const mapX = (t) =>
    padding + ((t - xMin) / xSpan) * (width - 2 * padding);
  const mapY = (v) =>
    height - padding - ((v - yMin) / (yMax - yMin)) * (height - 2 * padding);

  const yTicks = 5;
  const yStep = (yMax - yMin) / yTicks;
  const xTicks = 4;
  const timeSpanSec = (xSpan / 1000).toFixed(0);

  return (
    <div>
      <div style={styles.panel}>
        <h2>History</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Live trend of temperatures (T1, T2, T3, motor). Shows the last ~600
          samples (about 10 minutes at 1 Hz). Time span currently ~
          {timeSpanSec} s.
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
            const points = history
              .map((h) => {
                const v = (h.temps || {})[s.key];
                if (v === null || v === undefined) return null;
                return `${mapX(h.t)},${mapY(v)}`;
              })
              .filter(Boolean)
              .join(" ");
            if (!points) return null;
            return (
              <polyline
                key={s.key}
                fill="none"
                stroke={s.color}
                strokeWidth="1.5"
                points={points}
              />
            );
          })}
        </svg>

        <div
          style={{
            marginTop: "8px",
            display: "flex",
            gap: "12px",
            fontSize: "0.85em",
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
        </div>
      </div>
    </div>
  );
}

export default HistoryScreen;
