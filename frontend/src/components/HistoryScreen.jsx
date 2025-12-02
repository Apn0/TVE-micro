// file: frontend/src/components/HistoryScreen.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { styles } from "../styles";

const SERIES_BASE = [
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

const DEFAULT_AXES = {
  t1: "right",
  t2: "right",
  t3: "right",
  motor_temp: "right",
  target_z1: "right",
  target_z2: "right",
  main_rpm: "right",
  feed_rpm: "right",
  fan_rpm: "right",
  pump_state: "left",
  heater_z1_duty: "left",
  heater_z2_duty: "left",
};

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

function computeStats(history, seriesDefs) {
  const stats = seriesDefs.reduce((acc, s) => {
    acc[s.key] = { min: Infinity, max: -Infinity, sum: 0, count: 0, last: null };
    return acc;
  }, {});

  history.forEach((entry) => {
    seriesDefs.forEach((s) => {
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

function TrendChart({ history, activeSeries, viewRange, setViewRange, dataRange, pauseLive, seriesDefs, config }) {
  const svgRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastPinchDistance = useRef(null);
  const dragState = useRef(null);
  const [pinTime, setPinTime] = useState(null);

  const viewStart = viewRange?.start ?? dataRange.min;
  const viewEnd = viewRange?.end ?? dataRange.max;
  const viewHistory = useMemo(
    () => history.filter((h) => h.t >= viewStart && h.t <= viewEnd),
    [history, viewStart, viewEnd]
  );

  const leftValues = useMemo(() => {
    const allValues = viewHistory.flatMap((h) =>
      seriesDefs.filter((s) => activeSeries.has(s.key) && s.axis === "left")
        .map((s) => {
          const valueRaw = s.accessor(h);
          return typeof valueRaw === "boolean" ? (valueRaw ? 1 : 0) : valueRaw;
        })
        .filter((v) => v !== null && v !== undefined && Number.isFinite(v))
    );
    return allValues.length ? allValues : [0, 1];
  }, [viewHistory, activeSeries, seriesDefs]);

  const rightValues = useMemo(() => {
    const allValues = viewHistory.flatMap((h) =>
      seriesDefs.filter((s) => activeSeries.has(s.key) && s.axis === "right")
        .map((s) => {
          const valueRaw = s.accessor(h);
          return typeof valueRaw === "boolean" ? (valueRaw ? 1 : 0) : valueRaw;
        })
        .filter((v) => v !== null && v !== undefined && Number.isFinite(v))
    );
    return allValues.length ? allValues : [0, 250];
  }, [viewHistory, activeSeries, seriesDefs]);

  const [leftMin, leftMax] = useMemo(() => {
    if (config?.y_left_min != null && config?.y_left_max != null) {
      return [config.y_left_min, config.y_left_max];
    }
    const min = Math.min(...leftValues);
    const max = Math.max(...leftValues);
    const span = max - min || 1;
    const pad = span * 0.08;
    // Respect overrides if only one is set
    const finalMin = config?.y_left_min ?? Math.min(0, min - pad);
    const finalMax = config?.y_left_max ?? max + pad;
    return [finalMin, finalMax];
  }, [leftValues, config]);

  const [rightMin, rightMax] = useMemo(() => {
    if (config?.y_right_min != null && config?.y_right_max != null) {
      return [config.y_right_min, config.y_right_max];
    }
    const min = Math.min(...rightValues);
    const max = Math.max(...rightValues);
    const span = max - min || 1;
    const pad = span * 0.08;
    const finalMin = config?.y_right_min ?? Math.min(0, min - pad);
    const finalMax = config?.y_right_max ?? Math.max(250, max + pad);
    return [finalMin, finalMax];
  }, [rightValues, config]);

  const xMin = viewStart;
  const xMax = viewEnd;
  const xSpan = xMax - xMin || 1;

  const mapX = (t) => CHART_PADDING + ((t - xMin) / xSpan) * (CHART_WIDTH - 2 * CHART_PADDING);
  const mapYLeft = (v) =>
    CHART_HEIGHT - CHART_PADDING - ((v - leftMin) / (leftMax - leftMin)) * (CHART_HEIGHT - 2 * CHART_PADDING);
  const mapYRight = (v) =>
    CHART_HEIGHT - CHART_PADDING - ((v - rightMin) / (rightMax - rightMin)) * (CHART_HEIGHT - 2 * CHART_PADDING);

  const yTicks = 5;
  const leftStep = (leftMax - leftMin) / yTicks;
  const rightStep = (rightMax - rightMin) / yTicks;
  const xTicks = 6;

  const xToTime = (xPx) => {
    const ratio = (xPx - CHART_PADDING) / (CHART_WIDTH - 2 * CHART_PADDING);
    return xMin + ratio * xSpan;
  };

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
      dragState.current = null;
    } else {
      pauseLive();
      dragState.current = { startX: e.clientX, startStart: viewStart, startEnd: viewEnd };
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
    } else if (dragState.current) {
      const deltaPx = e.clientX - dragState.current.startX;
      const deltaTime = (deltaPx / (CHART_WIDTH - 2 * CHART_PADDING)) * xSpan;
      const nextStart = dragState.current.startStart - deltaTime;
      const nextEnd = dragState.current.startEnd - deltaTime;
      setViewRange(clampRange(nextStart, nextEnd, dataRange));
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const boundedX = Math.max(rect.left + CHART_PADDING, Math.min(e.clientX, rect.right - CHART_PADDING));
      setPinTime(xToTime(boundedX));
    }
  };

  const handlePointerUp = (e) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      lastPinchDistance.current = null;
    }
    dragState.current = null;
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
          x1={CHART_WIDTH - CHART_PADDING}
          y1={CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
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
          const value = leftMin + i * leftStep;
          const y = mapYLeft(value);
          return (
            <g key={`y-left-${i}`}>
              <line x1={CHART_PADDING} y1={y} x2={CHART_WIDTH - CHART_PADDING} y2={y} stroke="#1d1d1d" />
              <text x={CHART_PADDING - 8} y={y + 3} fontSize="10" fill="#aaa" textAnchor="end">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const value = rightMin + i * rightStep;
          const y = mapYRight(value);
          return (
            <g key={`y-right-${i}`}>
              <text x={CHART_WIDTH - CHART_PADDING + 8} y={y + 3} fontSize="10" fill="#aaa" textAnchor="start">
                {value.toFixed(0)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const t = xMin + (i / xTicks) * xSpan;
          const x = mapX(t);
          const secAgo = (xMax - t) / 1000;
          let label;
          if (xSpan > 60000) {
            const minAgo = secAgo / 60;
            const val = Math.abs(minAgo) < 0.1 ? 0 : minAgo;
            const isInt = Math.abs(val % 1) < 0.01;
            label = `-${val.toFixed(isInt ? 0 : 1)}m`;
          } else {
            label = `-${Math.round(secAgo)}s`;
          }

          return (
            <g key={`x-${i}`}>
              <line x1={x} y1={CHART_HEIGHT - CHART_PADDING} x2={x} y2={CHART_PADDING} stroke="#1d1d1d" />
              <text x={x} y={CHART_HEIGHT - CHART_PADDING + 14} fontSize="10" fill="#aaa" textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}

        {seriesDefs.filter((s) => activeSeries.has(s.key)).map((s) => {
          const points = viewHistory
            .map((h) => {
              const raw = s.accessor(h);
              const v = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
              if (v === null || v === undefined || !Number.isFinite(v)) return null;
              const yMapper = s.axis === "left" ? mapYLeft : mapYRight;
              return `${mapX(h.t)},${yMapper(v)}`;
            })
            .filter(Boolean)
            .join(" ");
          if (!points) return null;
          return <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.8" points={points} />;
        })}

        {pinTime !== null && (
          <line
            x1={mapX(pinTime)}
            y1={CHART_PADDING}
            x2={mapX(pinTime)}
            y2={CHART_HEIGHT - CHART_PADDING}
            stroke="#888"
            strokeDasharray="4 4"
          />
        )}

        {!viewHistory.length && (
          <text x="50%" y="50%" textAnchor="middle" fill="#777" fontSize="12">
            No samples in selected window
          </text>
        )}
      </svg>
      {pinTime !== null && viewHistory.length > 0 && (
        <PinReadout
          pinTime={pinTime}
          history={viewHistory}
          activeSeries={activeSeries}
          seriesDefs={seriesDefs}
        />
      )}
    </div>
  );
}

function PinReadout({ pinTime, history, activeSeries, seriesDefs }) {
  const closest = useMemo(() => {
    let best = null;
    let bestDist = Infinity;
    history.forEach((h) => {
      const dist = Math.abs(h.t - pinTime);
      if (dist < bestDist) {
        best = h;
        bestDist = dist;
      }
    });
    return best;
  }, [history, pinTime]);

  if (!closest) return null;

  return (
    <div style={{ marginTop: 8, background: "#0b0b0b", border: "1px solid #1f1f1f", borderRadius: 8, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#dfe6ee" }}>
        <div style={{ fontWeight: 700 }}>Pinned at {new Date(pinTime).toLocaleString()}</div>
        <div style={{ fontSize: "0.9em", color: "#9aa5b1" }}>Nearest sample: {new Date(closest.t).toLocaleTimeString()}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, marginTop: 8 }}>
        {seriesDefs.filter((s) => activeSeries.has(s.key)).map((s) => {
          const raw = s.accessor(closest);
          const v = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
          if (v === null || v === undefined || !Number.isFinite(v)) return null;
          return (
            <div
              key={s.key}
              style={{
                border: `1px solid ${s.color}40`,
                borderRadius: 6,
                padding: 8,
                color: "#e0e0e0",
                background: "#0f141a",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                <div>
                  <div style={{ fontWeight: 700 }}>{s.label}</div>
                  <div style={{ color: "#9aa5b1", fontSize: "0.85em" }}>{s.unit}</div>
                </div>
              </div>
              <div style={{ fontWeight: 800 }}>{v.toFixed(1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ stats, activeSeries, toggleSeries, seriesDefs }) {
  return (
    <div
      style={{
        marginTop: "10px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "10px",
      }}
    >
      {seriesDefs.map((s) => {
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

/**
 * HistoryScreen Component.
 *
 * Provides a comprehensive historical trend view of all system metrics.
 *
 * Features:
 * - Zoomable and pannable SVG line chart.
 * - Interactive legend to toggle series visibility.
 * - Live data following or paused inspection modes.
 * - Data export to CSV.
 * - Statistics calculation (Min, Max, Avg, Last) for the visible window.
 * - Touch and mouse interaction support (pinch-to-zoom, drag-to-pan).
 *
 * @param {object} props - Component props.
 * @param {Array} props.history - Full array of historical data points.
 * @param {object} props.config - System configuration object (optional).
 */
function HistoryScreen({ history, config }) {
  const sanitizedHistory = useMemo(
    () => (history || []).filter((entry) => entry && Number.isFinite(entry.t)),
    [history]
  );

  const seriesDefs = useMemo(() => {
    const axes = config?.history?.series_axis || DEFAULT_AXES;
    return SERIES_BASE.map((s) => ({
      ...s,
      axis: axes[s.key] || DEFAULT_AXES[s.key] || "right",
    }));
  }, [config]);

  const [activeSeries, setActiveSeries] = useState(() => {
    const saved = localStorage.getItem("history_active_series");
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) return new Set(arr);
      } catch (e) {
        console.warn("Failed to parse saved series", e);
      }
    }
    return new Set(seriesDefs.map((s) => s.key));
  });
  const [rangePreset, setRangePreset] = useState(() => localStorage.getItem("history_range_preset") || "24h");
  const [viewRange, setViewRange] = useState(() => {
    const saved = localStorage.getItem("history_view_range");
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      if (parsed && Number.isFinite(parsed.start) && Number.isFinite(parsed.end)) return parsed;
    } catch (e) {
      console.warn("Failed to parse saved view range", e);
    }
    return null;
  });
  const [liveMode, setLiveMode] = useState(() => {
    const saved = localStorage.getItem("history_live_mode");
    return saved ? saved === "true" : true;
  });

  const dataRange = useMemo(() => {
    if (!sanitizedHistory.length) return { min: 0, max: 1 };
    return { min: sanitizedHistory[0].t, max: sanitizedHistory[sanitizedHistory.length - 1].t };
  }, [sanitizedHistory]);

  const applyPreset = (preset) => {
    setRangePreset(preset);
    localStorage.setItem("history_range_preset", preset);
    if (!sanitizedHistory.length) return;
    const end = sanitizedHistory[sanitizedHistory.length - 1].t;
    const startCandidate = RANGE_PRESETS[preset] === null ? sanitizedHistory[0].t : end - RANGE_PRESETS[preset];
    const start = Math.max(sanitizedHistory[0].t, startCandidate);
    setViewRange({ start, end });
    localStorage.setItem("history_view_range", JSON.stringify({ start, end }));
    setLiveMode(true);
    localStorage.setItem("history_live_mode", "true");
  };

  useEffect(() => {
    if (!sanitizedHistory.length) return;
    if (!liveMode) return;
    const end = sanitizedHistory[sanitizedHistory.length - 1].t;
    const presetMs = RANGE_PRESETS[rangePreset];
    const span = presetMs === null ? end - sanitizedHistory[0].t : presetMs;
    const start = Math.max(sanitizedHistory[0].t, end - span);
    setViewRange({ start, end });
    localStorage.setItem("history_view_range", JSON.stringify({ start, end }));
  }, [sanitizedHistory, liveMode, rangePreset]);

  useEffect(() => {
    localStorage.setItem("history_active_series", JSON.stringify(Array.from(activeSeries)));
  }, [activeSeries]);

  useEffect(() => {
    if (viewRange) {
      localStorage.setItem("history_view_range", JSON.stringify(viewRange));
    }
  }, [viewRange]);

  useEffect(() => {
    localStorage.setItem("history_live_mode", liveMode ? "true" : "false");
  }, [liveMode]);

  const viewHistory = useMemo(() => {
    if (!viewRange) return sanitizedHistory;
    return sanitizedHistory.filter((h) => h.t >= viewRange.start && h.t <= viewRange.end);
  }, [sanitizedHistory, viewRange]);

  const stats = useMemo(() => computeStats(viewHistory, seriesDefs), [viewHistory, seriesDefs]);
  const sampleCount = viewHistory.length;
  const timeSpanMs = sanitizedHistory.length
    ? viewRange
      ? viewRange.end - viewRange.start
      : sanitizedHistory[sanitizedHistory.length - 1].t - sanitizedHistory[0].t
    : 0;
  const lastSampleAge = sanitizedHistory.length ? Date.now() - sanitizedHistory[sanitizedHistory.length - 1].t : 0;

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

  const exportHistory = () => {
    const headers = ["timestamp"].concat(seriesDefs.map((s) => s.key));
    const rows = sanitizedHistory.map((h) => {
      const base = [new Date(h.t).toISOString()];
      const seriesValues = seriesDefs.map((s) => {
        const vRaw = s.accessor(h);
        const v = typeof vRaw === "boolean" ? (vRaw ? 1 : 0) : vRaw;
        return v ?? "";
      });
      return base.concat(seriesValues).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tve-history-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    <div style={styles.container}>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: "#9aa5b1", fontSize: "0.9em" }}>
              Drag to pan, scroll/pinch to zoom smoothly, or tap anywhere on the chart to inspect values at that moment.
            </span>
            <button
              onClick={exportHistory}
              style={{
                ...styles.buttonSecondary,
                background: "#0c0c0c",
                border: "1px solid #2c2c2c",
              }}
            >
              Save CSV
            </button>
          </div>
          <TrendChart
            history={sanitizedHistory}
            activeSeries={activeSeries}
            viewRange={viewRange}
            setViewRange={setViewRange}
            dataRange={dataRange}
            pauseLive={pauseLive}
            seriesDefs={seriesDefs}
            config={config?.history}
          />
        </div>

        <Legend stats={stats} activeSeries={activeSeries} toggleSeries={toggleSeries} seriesDefs={seriesDefs} />
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.buttonSecondary,
        background: active ? "#0f1b26" : "#0b0b0b",
        border: active ? "1px solid #3498db" : "1px solid #2c2c2c",
        color: "#e0e0e0",
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
        ...styles.metricCard,
        minHeight: 'auto',
        // Implicitly uses padding: 14px from styles.metricCard
      }}
    >
      <div style={{ fontSize: "0.75em", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.3em", fontWeight: "bold", color: "#eaeaea" }}>{value}</div>
    </div>
  );
}

export default HistoryScreen;
