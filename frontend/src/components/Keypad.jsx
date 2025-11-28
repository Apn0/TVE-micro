// file: src/components/Keypad.jsx
import React from "react";

const btn = {
  width: "60px",
  height: "60px",
  margin: "4px",
  fontSize: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "6px",
  background: "#2c3e50",
  color: "white",
  cursor: "pointer",
  userSelect: "none"
};

/**
 * Keypad Component.
 *
 * Renders a numeric keypad for data entry on touchscreens.
 * Includes number keys, decimal point, negative sign, delete, enter, and escape.
 *
 * @param {object} props - Component props.
 * @param {string} props.value - The current value being edited.
 * @param {function} props.onKey - Callback when a key is pressed.
 * @param {boolean} props.highlight - Whether the value is currently "selected" (will be overwritten).
 */
export default function Keypad({ value, onKey, highlight }) {
  const press = (v) => {
    if (onKey) onKey(v);
  };

  // Styles for the value display
  const displayStyle = {
    flex: 1,
    padding: "10px",
    fontSize: "24px",
    // Highlight effect: blue bg + white text if selected, else dark bg + green text
    background: highlight ? "#0078d7" : "#222",
    color: highlight ? "#fff" : "#0f0",
    borderRadius: "4px", // slight rounding
    transition: "background 0.2s, color 0.2s"
  };

  return (
    <div
      style={{
        padding: "20px",
        background: "#111",
        border: "2px solid #555",
        borderRadius: "10px",
        display: "inline-block",
      }}
    >
      <div style={{ display: "flex", marginBottom: "10px" }}>
        <div style={displayStyle}>
          {value}
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div>
          {[["7","8","9"],["4","5","6"],["1","2","3"],["0","-","."]].map((row,i) => (
            <div key={i} style={{ display: "flex" }}>
              {row.map((n) => (
                <div key={n} style={btn} onClick={() => press(n)}>
                  {n}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right column like EREMA */}
        <div style={{ marginLeft: "10px" }}>
          {[
            "Del",
            "Ins",
            "↵",
            "ESC",
          ].map((n) => (
            <div key={n} style={{ ...btn, width: "80px" }} onClick={() => press(n)}>
              {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
