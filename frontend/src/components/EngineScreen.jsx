// file: frontend/src/tabs/EngineScreen.jsx
import React, { useState, useEffect } from "react";
import { styles } from "../App";

function EngineScreen({ data, sendCmd }) {
  const motors = data.state?.motors || {};
  const [mainRpm, setMainRpm] = useState(motors.main ?? 0);
  const [feedRpm, setFeedRpm] = useState(motors.feed ?? 0);

  useEffect(() => {
    setMainRpm(motors.main ?? 0);
    setFeedRpm(motors.feed ?? 0);
  }, [motors.main, motors.feed]);

  const sendMain = (rpm) => {
    setMainRpm(rpm);
    sendCmd("SET_MOTOR", { motor: "main", rpm });
  };

  const sendFeed = (rpm) => {
    setFeedRpm(rpm);
    sendCmd("SET_MOTOR", { motor: "feed", rpm });
  };

  return (
    <div>
      <div style={styles.panel}>
        <h2>Main motor (NEMA23 + DM556)</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Control main screw speed and feeder. Actual RPM is derived from step
          frequency and microstep config.
        </p>
        <div style={styles.grid2}>
          <div>
            <div style={styles.label}>Main screw target RPM</div>
            <input
              type="range"
              min="0"
              max="120"
              step="1"
              value={mainRpm}
              onChange={(e) => sendMain(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={styles.metricBig}>{mainRpm.toFixed(0)} RPM</div>
          </div>
          <div>
            <div style={styles.label}>Feeder target RPM</div>
            <input
              type="range"
              min="0"
              max="60"
              step="1"
              value={feedRpm}
              onChange={(e) => sendFeed(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={styles.metricBig}>{feedRpm.toFixed(0)} RPM</div>
          </div>
        </div>
        <div style={{ marginTop: "20px" }}>
          <button
            style={styles.buttonSecondary}
            onClick={() => sendMain(0)}
          >
            Stop main
          </button>
          <button
            style={styles.buttonSecondary}
            onClick={() => sendFeed(0)}
          >
            Stop feeder
          </button>
        </div>
      </div>
    </div>
  );
}

export default EngineScreen;
