// file: frontend/src/tabs/DipSwitchBlock.jsx
import React from "react";
import { styles } from "../App";

/**
 * DipSwitchBlock Component.
 *
 * Renders a visual representation of a DIP switch block.
 * Used to show the configured settings for hardware drivers (e.g., DM556).
 *
 * @param {object} props - Component props.
 * @param {Array<boolean>} props.switches - Array of booleans representing switch states (true=ON, false=OFF).
 */
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
