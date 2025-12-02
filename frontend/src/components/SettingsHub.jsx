import React, { useEffect, useMemo, useState } from "react";

const TILE_LIBRARY = {
  config: { key: "config", label: "Config", icon: "config", target: "SETTINGS_CONFIG" },
  home: { key: "home", label: "Home", icon: "home", target: "HOME" },
  alarms: { key: "alarms", label: "Alarms", icon: "alarms", target: "ALARMS" },
  motor: { key: "motor", label: "Motor", icon: "motor", target: "MOTOR" },
  heaters: { key: "heaters", label: "Heaters", icon: "heaters", target: "HEATERS" },
  history: { key: "history", label: "History", icon: "history", target: "HISTORY" },
  io: { key: "io", label: "I/O Test", icon: "io", target: "I/O TEST" },
  sensors: { key: "sensors", label: "Sensors", icon: "sensors", target: "SENSORS" },
  gpio: { key: "gpio", label: "GPIO", icon: "gpio", target: "GPIO" },
  wiring: { key: "wiring", label: "Wiring", icon: "wiring", target: "WIRING CALIBRATION" },
  edit: { key: "edit", label: "Edit", icon: "edit", isEdit: true },
};

const DEFAULT_LAYOUT = [
  "config",
  "motor",
  "heaters",
  "alarms",
  "history",
  null,
  "io",
  "sensors",
  "gpio",
  "wiring",
  "home",
  "edit",
];

const STORAGE_KEY = "settings-tile-layout";

const iconBase = {
  width: 52,
  height: 52,
  viewBox: "0 0 64 64",
  stroke: "#fff",
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
};

function TileIcon({ name }) {
  switch (name) {
    case "config":
      return (
        <svg {...iconBase}>
          <path d="M32 16l4 3 6-2 2 6 6 2-2 6 3 4-3 4 2 6-6 2-2 6-6-2-4 3-4-3-6 2-2-6-6-2 2-6-3-4 3-4-2-6 6-2 2-6 6 2z" />
          <circle cx="32" cy="32" r="8" />
        </svg>
      );
    case "home":
      return (
        <svg {...iconBase}>
          <path d="M12 30 32 12l20 18" />
          <path d="M18 28v20h28V28" />
          <path d="M26 48V36h12v12" />
        </svg>
      );
    case "alarms":
      return (
        <svg {...iconBase}>
          <circle cx="32" cy="36" r="14" />
          <path d="M32 24V12M18 12l-6-6M46 12l6-6M16 40h32" />
        </svg>
      );
    case "motor":
      return (
        <svg {...iconBase}>
          <circle cx="24" cy="24" r="10" />
          <circle cx="40" cy="40" r="10" />
          <path d="M30 30l8 8" />
          <path d="M18 18l8-8" />
        </svg>
      );
    case "heaters":
      return (
        <svg {...iconBase}>
          <path d="M32 10c6 8 6 14 0 22s-6 14 0 22" />
          <path d="M22 16c4 5 4 10 0 16s-4 12 2 18" />
          <path d="M42 16c4 6 4 12 0 18s-4 11 2 18" />
        </svg>
      );
    case "history":
      return (
        <svg {...iconBase}>
          <path d="M18 18h28v28H18z" />
          <path d="M24 38 30 30l8 6 6-12" />
          <circle cx="24" cy="38" r="2" />
          <circle cx="30" cy="30" r="2" />
          <circle cx="38" cy="36" r="2" />
          <circle cx="44" cy="24" r="2" />
        </svg>
      );
    case "io":
      return (
        <svg {...iconBase}>
          <rect x="16" y="16" width="12" height="32" rx="2" />
          <rect x="36" y="16" width="12" height="32" rx="2" />
          <path d="M22 16v-6m20 6v-6M22 48v6m20-6v6" />
        </svg>
      );
    case "sensors":
      return (
        <svg {...iconBase}>
          <path d="M20 20c0-6.627 5.373-12 12-12s12 5.373 12 12-5.373 12-12 12" />
          <path d="M32 32v16" />
          <path d="M24 48h16" />
        </svg>
      );
    case "gpio":
      return (
        <svg {...iconBase}>
          <rect x="14" y="18" width="36" height="20" rx="3" />
          <path d="M20 18v-6M28 18v-6M36 18v-6M44 18v-6M20 38v8M36 38v8" />
        </svg>
      );
    case "wiring":
      return (
        <svg {...iconBase}>
          <path d="M14 46c6-10 14-10 20 0s14 10 16 0" />
          <path d="M18 18h8l6 12 6-12h8" />
          <circle cx="18" cy="18" r="3" />
          <circle cx="46" cy="18" r="3" />
        </svg>
      );
    case "edit":
      return (
        <svg {...iconBase}>
          <path d="M20 44h8l16-16-8-8-16 16z" />
          <path d="M36 20 44 28" />
        </svg>
      );
    default:
      return null;
  }
}

function useStoredLayout() {
  return useState(() => {
    if (typeof window === "undefined") return [...DEFAULT_LAYOUT];
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to read stored layout", e);
    }
    return [...DEFAULT_LAYOUT];
  });
}

function SettingsHub({ setView }) {
  const [layout, setLayout] = useStoredLayout();
  const [editMode, setEditMode] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const tiles = useMemo(() => layout.map((key) => (key ? TILE_LIBRARY[key] : null)), [layout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const handleTileClick = (index) => {
    const tile = tiles[index];

    if (tile?.isEdit) {
      setEditMode((prev) => !prev);
      setSelectedIndex(null);
      return;
    }

    if (editMode) {
      if (selectedIndex === null) {
        setSelectedIndex(index);
        return;
      }

      if (selectedIndex === index) {
        setSelectedIndex(null);
        return;
      }

      setLayout((prev) => {
        const next = [...prev];
        [next[selectedIndex], next[index]] = [next[index], next[selectedIndex]];
        return next;
      });
      setSelectedIndex(null);
      return;
    }

    if (tile?.target) {
      setView(tile.target);
    }
  };

  const emptyTile = (index) => (
    <button
      key={`empty-${index}`}
      style={tileStyle({ isEmpty: true, isSelected: selectedIndex === index, editMode })}
      onClick={() => handleTileClick(index)}
      aria-label="Empty slot"
    >
      {editMode ? <div style={emptyLabel}>Empty</div> : null}
    </button>
  );

  return (
    <div style={hubContainer}>
      <div style={gridStyle}>
        {tiles.map((tile, index) => {
          if (!tile) return emptyTile(index);
          const isSelected = selectedIndex === index;
          const isEditTile = tile.isEdit;

          return (
            <button
              key={tile.key}
              style={tileStyle({ editMode, isSelected, isEditTile })}
              onClick={() => handleTileClick(index)}
            >
              <div style={iconWrapper(isEditTile, editMode, isSelected)}>
                <TileIcon name={tile.icon} />
              </div>
              <div style={tileLabel}>{editMode && isEditTile ? (isSelected ? "Done" : "Edit") : tile.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const hubContainer = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "30px 10px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "18px",
};

const tileBase = {
  border: "1px solid #3d3d3d",
  background: "#0a0a0a",
  color: "#f6f6f6",
  borderRadius: "14px",
  minHeight: 160,
  aspectRatio: "1 / 1",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  cursor: "pointer",
  transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
  boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
};

const tileStyle = ({ editMode, isSelected, isEditTile, isEmpty }) => ({
  ...tileBase,
  borderStyle: isEmpty ? "dashed" : "solid",
  borderColor: isSelected ? "#58a6ff" : isEditTile ? "#888" : isEmpty ? "#333" : "#4b4b4b",
  opacity: isEmpty && !editMode ? 0.25 : 1,
  boxShadow: isSelected ? "0 0 0 3px rgba(88,166,255,0.35)" : tileBase.boxShadow,
  transform: isSelected ? "scale(0.98)" : "scale(1)",
});

const iconWrapper = (isEditTile, editMode, isSelected) => ({
  width: 72,
  height: 72,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  background: isEditTile && editMode ? "#1b2636" : "transparent",
  boxShadow: isSelected ? "inset 0 0 0 2px #58a6ff" : "inset 0 0 0 1px rgba(255,255,255,0.12)",
});

const tileLabel = {
  fontSize: "0.95em",
  fontWeight: 600,
  letterSpacing: "0.3px",
  textAlign: "center",
};

const emptyLabel = {
  color: "#6b6b6b",
  fontSize: "0.9em",
  fontWeight: 600,
};

export default SettingsHub;
