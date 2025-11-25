// file: frontend/src/tabs/DipSwitchBlock.jsx
import React from "react";
import { styles } from "../App";

function DipSwitchBlock({ switches }) {
  return (
    <div style={styles.dipBlock}>
      {switches.map((s, i) => (
        <div
          key={i}
          style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <div style={styles.dipLabel}>{i + 1}</div>
          <div style={styles.dipSwitch}>
            <div style={styles.dipKnob(s)} />
          </div>
          <div style={styles.dipLabel}>{s ? "ON" : "OFF"}</div>
        </div>
      ))}
    </div>
  );
}

export default DipSwitchBlock;
