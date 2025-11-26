// file: frontend/src/components/HistoryScreen.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { styles } from "../App";

const SERIES_DEFS = [
  { key: "t1", label: "Zone 1 Temp", color: "#e74c3c", unit: "°C", accessor: (h) => h.temps?.t1 },
  { key: "t2", label: "Zone 2 Temp", color: "#f1c40f", unit: "°C", accessor: (h) => h.temps?.t2 },
  { key: "t3", label: "Nozzle Temp", color: "#2ecc71", unit: "°C", accessor: (h) => h.temps?.t3 },
  { key: "motor_temp", label: "Motor Temp", color: "#9b59b6", unit: "°C", accessor: (h) => h.temps?.motor },
  { key: "target_z1", label: "Target Z1", color: "#ff9f43", unit: "°C", accessor: (h) => h.target_z1 },
  { key: "target_z2", label: "Target Z2", color: "#ffeaa7", unit: "°C", accessor: (h) => h.target_z2 },
  { key: "main_rpm", label: "Main RPM", color: "#3498db", unit: "rpm", accessor: (h) => h.motors?.main },
  { key: "feed_rpm", label: "Feeder RPM", color: "#1abc9c", unit: "rpm", accessor: (h) => h.motors?.feed },
  {
    key: "fan_rpm",
    label: "Cooling fan",
    color: "#00cec9",
    unit: "rpm",
    accessor: (h) => h.fans?.main ?? h.fans?.main_rpm ?? h.fans?.fan_rpm ?? (h.relays?.fan ? 100 : 0),
  },
  {
    key: "pump_state",
    label: "Pump",
    color: "#6c5ce7",
    unit: "on/off",
    accessor: (h) => (h.relays?.pump ? 1 : 0),
  },
  {
    key: "heater_z1_duty",
    label: "Heater Z1 duty",
    color: "#e67e22",
    unit: "%",
    accessor: (h) => h.manual_duty_z1 ?? h.pwm?.z1,
  },
  {
    key: "heater_z2_duty",
    label: "Heater Z2 duty",
    color: "#d35400",
    unit: "%",
    accessor: (h) => h.manual_duty_z2 ?? h.pwm?.z2,
  },
];

const CHART_WIDTH = 900;
const CHART_HEIGHT = 340;
const CHART_PADDING = 48;

const RANGE_PRESETS = {
  "1m": 1000 * 60,
  "1h": 1000 * 60 * 60,
  "8h": 1000 * 60 * 60 * 8,
  "24h": 1000 * 60 * 60 * 24,
  all: null,
};

function formatDuration(ms) {
  if (ms <= 0) return "now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);
  if (days > 0) return `${days}d ${hr % 24}h`;
  return `${hr}h ${min % 60}m`;
}

function computeStats(history) {
  const stats = SERIES_DEFS.reduce((acc, s) => {
    acc[s.key] = { min: Infinity, max: -Infinity, sum: 0, count: 0, last: null };
    return acc;
  }, {});

  history.forEach((entry) => {
    SERIES_DEFS.forEach((s) => {
      const valueRaw = s.accessor(entry);
      const value = typeof valueRaw === "boolean" ? (valueRaw ? 1 : 0) : valueRaw;
      if (value === null || value === undefined || !Number.isFinite(value)) return;
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

function clampRange(start, end, bounds) {
  const span = Math.max(1000, end - start);
  const min = bounds.min;
  const max = bounds.max;
  const clampedStart = Math.max(min, Math.min(start, max - 1000));
  const clampedEnd = Math.min(max, Math.max(end, min + 1000));
  return { start: clampedStart, end: Math.max(clampedStart + span * 0.05, clampedEnd) };
}

function TrendChart({ history, activeSeries, viewRange, setViewRange, dataRange, pauseLive }) {
  const svgRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastPinchDistance = useRef(null);

  const viewStart = viewRange?.start ?? dataRange.min;
  const viewEnd = viewRange?.end ?? dataRange.max;
  const viewHistory = useMemo(
    () => history.filter((h) => h.t >= viewStart && h.t <= viewEnd),
    [history, viewStart, viewEnd]
  );

  const seriesValues = useMemo(() => {
    const allValues = viewHistory.flatMap((h) =>
      SERIES_DEFS.filter((s) => activeSeries.has(s.key))
        .map((s) => {
          const valueRaw = s.accessor(h);
          return typeof valueRaw === "boolean" ? (valueRaw ? 1 : 0) : valueRaw;
        })
        .filter((v) => v !== null && v !== undefined && Number.isFinite(v))
    );
    return allValues.length ? allValues : [0, 1];
  }, [viewHistory, activeSeries]);

  const yMinRaw = Math.min(...seriesValues);
  const yMaxRaw = Math.max(...seriesValues);
  const yRange = yMaxRaw - yMinRaw || 1;
  const yPadding = yRange * 0.08;
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;

  const xMin = viewStart;
  const xMax = viewEnd;
  const xSpan = xMax - xMin || 1;

  const mapX = (t) => CHART_PADDING + ((t - xMin) / xSpan) * (CHART_WIDTH - 2 * CHART_PADDING);
  const mapY = (v) =>
    CHART_HEIGHT - CHART_PADDING - ((v - yMin) / (yMax - yMin)) * (CHART_HEIGHT - 2 * CHART_PADDING);

  const yTicks = 5;
  const yStep = (yMax - yMin) / yTicks;
  const xTicks = 6;

  const applyZoom = (zoomFactor, anchorPx = null) => {
    pauseLive();
    const span = viewEnd - viewStart;
    const rect = svgRef.current?.getBoundingClientRect();
    const anchorRatio = rect && anchorPx !== null ? (anchorPx - rect.left) / rect.width : 0.5;
    const anchorTime = viewStart + anchorRatio * span;
    const nextSpan = Math.max(1000, span * zoomFactor);
    const nextStart = anchorTime - anchorRatio * nextSpan;
    const nextEnd = nextStart + nextSpan;
    setViewRange(clampRange(nextStart, nextEnd, dataRange));
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    applyZoom(factor, e.clientX);
  };

  const handlePointerDown = (e) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      pauseLive();
      const pts = Array.from(pointersRef.current.values());
      lastPinchDistance.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const handlePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDistance.current && dist > 0) {
        const zoomFactor = Math.max(0.5, Math.min(1.5, lastPinchDistance.current / dist));
        const centerPx = (pts[0].x + pts[1].x) / 2;
        applyZoom(zoomFactor, centerPx);
      }
      lastPinchDistance.current = dist;
    }
  };

  const handlePointerUp = (e) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      lastPinchDistance.current = null;
    }
  };

  return (
    <div
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ background: "#000", border: "1px solid #222", borderRadius: "6px", touchAction: "none" }}
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
              <text x={CHART_PADDING - 8} y={y + 3} fontSize="10" fill="#aaa" textAnchor="end">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const t = xMin + (i / xTicks) * xSpan;
          const x = mapX(t);
          const secAgo = Math.round((xMax - t) / 1000);
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
          const points = viewHistory
            .map((h) => {
              const raw = s.accessor(h);
              const v = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
              if (v === null || v === undefined || !Number.isFinite(v)) return null;
              return `${mapX(h.t)},${mapY(v)}`;
            })
            .filter(Boolean)
            .join(" ");
          if (!points) return null;
          return <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.8" points={points} />;
        })}

        {!viewHistory.length && (
          <text x="50%" y="50%" textAnchor="middle" fill="#777" fontSize="12">
            No samples in selected window
          </text>
        )}
      </svg>
    </div>
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
                <span>
                  Last <strong>{stat.last.toFixed(1)}</strong>
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
  const [rangePreset, setRangePreset] = useState("24h");
  const [viewRange, setViewRange] = useState(null);
  const [liveMode, setLiveMode] = useState(true);

  const dataRange = useMemo(() => {
    if (!sanitizedHistory.length) return { min: 0, max: 1 };
    return { min: sanitizedHistory[0].t, max: sanitizedHistory[sanitizedHistory.length - 1].t };
  }, [sanitizedHistory]);

  const applyPreset = (preset) => {
    setRangePreset(preset);
    if (!sanitizedHistory.length) return;
    const end = sanitizedHistory[sanitizedHistory.length - 1].t;
    const startCandidate = RANGE_PRESETS[preset] === null ? sanitizedHistory[0].t : end - RANGE_PRESETS[preset];
    const start = Math.max(sanitizedHistory[0].t, startCandidate);
    setViewRange({ start, end });
    setLiveMode(true);
  };

  useEffect(() => {
    if (!sanitizedHistory.length) return;
    if (!liveMode) return;
    const end = sanitizedHistory[sanitizedHistory.length - 1].t;
    const presetMs = RANGE_PRESETS[rangePreset];
    const span = presetMs === null ? end - sanitizedHistory[0].t : presetMs;
    const start = Math.max(sanitizedHistory[0].t, end - span);
    setViewRange({ start, end });
  }, [sanitizedHistory, liveMode, rangePreset]);

  if (!sanitizedHistory.length) {
    return (
      <div style={styles.panel}>
        <h2>History</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa", marginBottom: 0 }}>
          Waiting for samples… leave the HMI running to build a rolling archive of temperatures, motors, fans, pumps, and
          heater duty.
        </p>
      </div>
    );
  }

  const viewHistory = useMemo(() => {
    if (!viewRange) return sanitizedHistory;
    return sanitizedHistory.filter((h) => h.t >= viewRange.start && h.t <= viewRange.end);
  }, [sanitizedHistory, viewRange]);

  const stats = useMemo(() => computeStats(viewHistory), [viewHistory]);
  const sampleCount = viewHistory.length;
  const timeSpanMs = viewRange ? viewRange.end - viewRange.start : sanitizedHistory[sanitizedHistory.length - 1].t - sanitizedHistory[0].t;
  const lastSampleAge = Date.now() - sanitizedHistory[sanitizedHistory.length - 1].t;

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

  const pauseLive = () => setLiveMode(false);

  return (
    <div>
      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div>
            <h2 style={{ marginBottom: "6px" }}>History</h2>
            <p style={{ fontSize: "0.9em", color: "#aaa", margin: 0 }}>
              Full run history with zoomable trends for temperatures, motors, fans, pump, and heater duty. Use the buttons
              below to jump to common windows or pinch/scroll to fine-tune the view.
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

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginTop: "12px",
            alignItems: "center",
          }}
        >
          <ControlButton active={rangePreset === "1m"} onClick={() => applyPreset("1m")}>Last minute</ControlButton>
          <ControlButton active={rangePreset === "1h"} onClick={() => applyPreset("1h")}>Last hour</ControlButton>
          <ControlButton active={rangePreset === "8h"} onClick={() => applyPreset("8h")}>Last 8 hours</ControlButton>
          <ControlButton active={rangePreset === "24h"} onClick={() => applyPreset("24h")}>
            Last day
          </ControlButton>
          <ControlButton active={rangePreset === "all"} onClick={() => applyPreset("all")}>Interval</ControlButton>
          <ControlButton
            active={liveMode}
            onClick={() => {
              if (liveMode) {
                setLiveMode(false);
              } else {
                applyPreset(rangePreset);
              }
            }}
          >
            {liveMode ? "LIVE" : "PAUSED"}
          </ControlButton>
          {!liveMode && (
            <span style={{ color: "#aaa", fontSize: "0.9em" }}>
              Paused — scroll/pinch to zoom and tap a preset to resume live following.
            </span>
          )}
        </div>

        <div style={{ marginTop: "14px" }}>
          <TrendChart
            history={sanitizedHistory}
            activeSeries={activeSeries}
            viewRange={viewRange}
            setViewRange={setViewRange}
            dataRange={dataRange}
            pauseLive={pauseLive}
          />
        </div>

        <Legend stats={stats} activeSeries={activeSeries} toggleSeries={toggleSeries} />
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 6,
        border: active ? "1px solid #3498db" : "1px solid #2c2c2c",
        background: active ? "#0f1b26" : "#0b0b0b",
        color: "#e0e0e0",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
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
