// file: frontend/src/components/HistoryScreen.jsx
import React, { useMemo, useState } from "react";
import { styles } from "../App";

const SERIES_DEFS = [
  { key: "t1", label: "T1 Temp", color: "#e74c3c", unit: "°C" },
  { key: "t2", label: "T2 Temp", color: "#f1c40f", unit: "°C" },
  { key: "t3", label: "T3 Temp", color: "#2ecc71", unit: "°C" },
  { key: "motor", label: "Motor", color: "#3498db", unit: "rpm" },
];

const CHART_WIDTH = 900;
const CHART_HEIGHT = 320;
const CHART_PADDING = 48;

function formatDuration(ms) {
  if (ms <= 0) return "now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function computeStats(history) {
  const stats = SERIES_DEFS.reduce((acc, s) => {
    acc[s.key] = { min: Infinity, max: -Infinity, sum: 0, count: 0, last: null };
    return acc;
  }, {});

  history.forEach((entry) => {
    const temps = entry.temps || {};
    SERIES_DEFS.forEach((s) => {
      const value = temps[s.key];
      if (value === null || value === undefined || Number.isNaN(value)) return;
      stats[s.key].min = Math.min(stats[s.key].min, value);
      stats[s.key].max = Math.max(stats[s.key].max, value);
      stats[s.key].sum += value;
      stats[s.key].count += 1;
      stats[s.key].last = value;
    });
  });

  return Object.fromEntries(
    Object.entries(stats).map(([key, v]) => {
      if (v.count === 0) {
        return [key, { min: null, max: null, avg: null, last: null }];
      }
      return [key, { min: v.min, max: v.max, avg: v.sum / v.count, last: v.last }];
    })
  );
}

function TrendChart({ history, activeSeries }) {
  const seriesValues = useMemo(() => {
    const allValues = history.flatMap((h) => {
      const temps = h.temps || {};
      return SERIES_DEFS.filter((s) => activeSeries.has(s.key))
        .map((s) => temps[s.key])
        .filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    });
    return allValues.length ? allValues : [0, 1];
  }, [history, activeSeries]);

  const yMinRaw = Math.min(...seriesValues);
  const yMaxRaw = Math.max(...seriesValues);
  const yRange = yMaxRaw - yMinRaw || 1;
  const yPadding = yRange * 0.05;
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;

  const xMin = history[0].t;
  const xMax = history[history.length - 1].t;
  const xSpan = xMax - xMin || 1;

  const mapX = (t) => CHART_PADDING + ((t - xMin) / xSpan) * (CHART_WIDTH - 2 * CHART_PADDING);
  const mapY = (v) =>
    CHART_HEIGHT - CHART_PADDING - ((v - yMin) / (yMax - yMin)) * (CHART_HEIGHT - 2 * CHART_PADDING);

  const yTicks = 5;
  const yStep = (yMax - yMin) / yTicks;
  const xTicks = 6;

  return (
    <svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      style={{ background: "#000", border: "1px solid #222", borderRadius: "6px" }}
    >
      <defs>
        <linearGradient id="gridGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#222" />
          <stop offset="100%" stopColor="#111" />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="url(#gridGradient)" />

      <line
        x1={CHART_PADDING}
        y1={CHART_PADDING}
        x2={CHART_PADDING}
        y2={CHART_HEIGHT - CHART_PADDING}
        stroke="#555"
        strokeWidth={1}
      />
      <line
        x1={CHART_PADDING}
        y1={CHART_HEIGHT - CHART_PADDING}
        x2={CHART_WIDTH - CHART_PADDING}
        y2={CHART_HEIGHT - CHART_PADDING}
        stroke="#555"
        strokeWidth={1}
      />

      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const value = yMin + i * yStep;
        const y = mapY(value);
        return (
          <g key={`y-${i}`}>
            <line x1={CHART_PADDING} y1={y} x2={CHART_WIDTH - CHART_PADDING} y2={y} stroke="#1d1d1d" />
            <text x={CHART_PADDING - 10} y={y + 4} fontSize="10" fill="#aaa" textAnchor="end">
              {value.toFixed(0)}
            </text>
          </g>
        );
      })}

      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const time = xMin + (i / xTicks) * xSpan;
        const x = mapX(time);
        const secAgo = ((xMax - time) / 1000).toFixed(0);
        return (
          <g key={`x-${i}`}>
            <line x1={x} y1={CHART_HEIGHT - CHART_PADDING} x2={x} y2={CHART_PADDING} stroke="#1d1d1d" />
            <text x={x} y={CHART_HEIGHT - CHART_PADDING + 14} fontSize="10" fill="#aaa" textAnchor="middle">
              -{secAgo}s
            </text>
          </g>
        );
      })}

      {SERIES_DEFS.filter((s) => activeSeries.has(s.key)).map((s) => {
        const points = history
          .map((h) => {
            const v = (h.temps || {})[s.key];
            if (v === null || v === undefined || !Number.isFinite(v)) return null;
            return `${mapX(h.t)},${mapY(v)}`;
          })
          .filter(Boolean)
          .join(" ");
        if (!points) return null;
        return <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.8" points={points} />;
      })}
    </svg>
  );
}

function Legend({ stats, activeSeries, toggleSeries }) {
  return (
    <div
      style={{
        marginTop: "10px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "10px",
      }}
    >
      {SERIES_DEFS.map((s) => {
        const isActive = activeSeries.has(s.key);
        const stat = stats[s.key];
        return (
          <button
            key={s.key}
            onClick={() => toggleSeries(s.key)}
            style={{
              textAlign: "left",
              border: `1px solid ${isActive ? s.color : "#2c2c2c"}`,
              background: isActive ? "#141414" : "#0b0b0b",
              color: "#e0e0e0",
              borderRadius: "6px",
              padding: "10px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: 12, height: 3, background: s.color, display: "inline-block" }} />
              <strong>{s.label}</strong>
              <span style={{ fontSize: "0.8em", color: "#999" }}>{isActive ? "(visible)" : "(hidden)"}</span>
            </div>
            {stat && stat.min !== null ? (
              <div style={{ display: "flex", gap: "10px", fontSize: "0.9em", color: "#ccc" }}>
                <span>
                  Min <strong>{stat.min.toFixed(1)}</strong>
                </span>
                <span>
                  Avg <strong>{stat.avg.toFixed(1)}</strong>
                </span>
                <span>
                  Max <strong>{stat.max.toFixed(1)}</strong>
                </span>
              </div>
            ) : (
              <span style={{ fontSize: "0.85em", color: "#666" }}>No data yet</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function HistoryScreen({ history }) {
  const sanitizedHistory = useMemo(
    () => (history || []).filter((entry) => entry && Number.isFinite(entry.t)),
    [history]
  );
  const [activeSeries, setActiveSeries] = useState(() => new Set(SERIES_DEFS.map((s) => s.key)));

  if (!sanitizedHistory.length) {
    return (
      <div style={styles.panel}>
        <h2>History</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa", marginBottom: 0 }}>
          Waiting for samples… leave the HMI running to build a few minutes of temperature and RPM history.
        </p>
      </div>
    );
  }

  const stats = useMemo(() => computeStats(sanitizedHistory), [sanitizedHistory]);
  const sampleCount = sanitizedHistory.length;
  const timeSpanMs = sanitizedHistory[sampleCount - 1].t - sanitizedHistory[0].t;
  const lastSampleAge = Date.now() - sanitizedHistory[sampleCount - 1].t;

  const toggleSeries = (key) => {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div>
      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div>
            <h2 style={{ marginBottom: "6px" }}>History</h2>
            <p style={{ fontSize: "0.9em", color: "#aaa", margin: 0 }}>
              Live trend of temperatures and motor data. Toggle series to focus on what matters and keep the HMI running to
              collect a rolling window of the latest readings.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(140px, 1fr))",
              gap: "10px",
              minWidth: "420px",
            }}
          >
            <SummaryTile label="Samples" value={sampleCount.toLocaleString()} />
            <SummaryTile label="Span" value={formatDuration(timeSpanMs)} />
            <SummaryTile label="Last sample" value={`${formatDuration(lastSampleAge)} ago`} />
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          <TrendChart history={sanitizedHistory} activeSeries={activeSeries} />
        </div>

        <Legend stats={stats} activeSeries={activeSeries} toggleSeries={toggleSeries} />
      </div>
    </div>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #222",
        borderRadius: "8px",
        padding: "10px 12px",
        color: "#eaeaea",
      }}
    >
      <div style={{ fontSize: "0.75em", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.3em", fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

export default HistoryScreen;
