// file: frontend/src/tabs/Nav.jsx
import React from "react";
import { styles } from "../App";

function Nav({ current, setView, hasActiveAlarms }) {
  const tabs = [
    "HOME",
    "ALARMS",
    "MOTOR",
    "HEATERS",
    "HISTORY",
    "I/O TEST",
    "SENSORS",
    "GPIO",
    "SETTINGS",
    "WIRING CALIBRATION",
  ];

  // Define blinking animation style
  const blinkingStyle = {
    animation: "blinkingRed 2s infinite ease-in-out",
  };

  const getStyle = (tab, isActive) => {
    const base = styles.navBtn(isActive);
    if (tab === "ALARMS" && hasActiveAlarms) {
      return { ...base, ...blinkingStyle, color: "white", background: isActive ? "#c0392b" : "rgba(192, 57, 43, 0.4)" };
    }
    return base;
  };

  return (
    <div style={styles.sidebar}>
      <style>
        {`
          @keyframes blinkingRed {
            0% { box-shadow: inset 0 0 10px rgba(231, 76, 60, 0.2); }
            50% { box-shadow: inset 0 0 40px rgba(231, 76, 60, 0.8); }
            100% { box-shadow: inset 0 0 10px rgba(231, 76, 60, 0.2); }
          }
        `}
      </style>
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid #333",
          fontWeight: "bold",
          color: "#ecf0f1",
          fontSize: "1.2em",
        }}
      >
        TVEmicro
      </div>
      {tabs.map((tab) => (
        <button
          key={tab}
          style={getStyle(tab, current === tab)}
          onClick={() => setView(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export default Nav;
