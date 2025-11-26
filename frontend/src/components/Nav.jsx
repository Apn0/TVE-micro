// file: frontend/src/tabs/Nav.jsx
import React from "react";
import { styles } from "../App";

function Nav({ current, setView }) {
  const tabs = [
    "HOME",
    "MOTOR",
    "HEATERS",
    "HISTORY",
    "I/O TEST",
    "SENSORS",
    "GPIO",
    "SETTINGS",
    "WIRING CALIBRATION",
  ];

  return (
    <div style={styles.sidebar}>
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
          style={styles.navBtn(current === tab)}
          onClick={() => setView(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export default Nav;
