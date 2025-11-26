// file: frontend/src/components/GpioScreen.jsx
import React, { useState } from "react";
import { styles } from "../App";

function GpioScreen({ data, sendCmd }) {
  const [pin, setPin] = useState(17);
  const [direction, setDirection] = useState("OUT");
  const [pull, setPull] = useState("NONE");
  const [writeState, setWriteState] = useState(false);
  const [readValue, setReadValue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const adc = data.config?.adc || {};
  const pins = data.config?.pins || {};

  const doConfigure = async () => {
    setBusy(true);
    setErr("");
    try {
      await sendCmd("GPIO_CONFIG", {
        pin,
        direction,
        pull: pull === "NONE" ? null : pull,
      });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doWrite = async () => {
    setBusy(true);
    setErr("");
    try {
      await sendCmd("GPIO_WRITE", { pin, state: writeState });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doRead = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "GPIO_READ", value: { pin } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.msg || "Read failed");
      setReadValue(json.value);
    } catch (e) {
      setErr(String(e.message || e));
      setReadValue(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={styles.panel}>
        <h2>GPIO / Bus Control</h2>
        <p style={{ color: "#aaa", marginTop: 0 }}>
          Quick-and-dirty poking for pins. Configure, drive high/low, and read
          back. Use carefully – this bypasses most safety logic.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={styles.label}>BCM Pin</div>
            <input
              type="number"
              value={pin}
              style={{ ...styles.input, width: "120px" }}
              onChange={(e) => setPin(parseInt(e.target.value, 10) || 0)}
            />

            <div style={{ ...styles.label, marginTop: 10 }}>Direction</div>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              style={{ ...styles.input, width: "140px" }}
            >
              <option value="OUT">Output</option>
              <option value="IN">Input</option>
            </select>

            <div style={{ ...styles.label, marginTop: 10 }}>Pull</div>
            <select
              value={pull}
              onChange={(e) => setPull(e.target.value)}
              style={{ ...styles.input, width: "140px" }}
            >
              <option value="NONE">None</option>
              <option value="UP">Pull-up</option>
              <option value="DOWN">Pull-down</option>
            </select>

            <div style={{ marginTop: 12 }}>
              <button style={styles.button} onClick={doConfigure} disabled={busy}>
                {busy ? "Working…" : "Configure Pin"}
              </button>
            </div>
          </div>

          <div>
            <div style={{ ...styles.label }}>Drive output</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={writeState}
                onChange={(e) => setWriteState(e.target.checked)}
                style={{ transform: "scale(1.2)" }}
              />
              <span>{writeState ? "HIGH" : "LOW"}</span>
            </label>
            <button
              style={{ ...styles.button, marginTop: 10 }}
              onClick={doWrite}
              disabled={busy}
            >
              {busy ? "Working…" : "Write"}
            </button>

            <div style={{ ...styles.label, marginTop: 20 }}>Read input</div>
            <button style={styles.buttonSecondary} onClick={doRead} disabled={busy}>
              {busy ? "Working…" : "Sample"}
            </button>
            {readValue !== null && (
              <div style={{ marginTop: 10 }}>
                <span style={{ color: "#ecf0f1", fontWeight: "bold" }}>
                  {readValue ? "HIGH" : "LOW"}
                </span>
              </div>
            )}
          </div>
        </div>

        {err && (
          <div style={{ marginTop: 12, color: "#e74c3c" }}>
            {err}
          </div>
        )}
      </div>

      <div style={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Current pin mapping</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {Object.entries(pins).map(([key, val]) => (
            <div key={key} style={{ background: "#111", padding: 10, borderRadius: 6, border: "1px solid #333" }}>
              <div style={styles.label}>{key}</div>
              <div style={{ fontWeight: "bold", color: "#ecf0f1" }}>{val ?? "—"}</div>
            </div>
          ))}
        </div>
        <p style={{ color: "#aaa", fontSize: "0.9em", marginTop: 10 }}>
          Use the Settings tab for persistent pin remapping; this view shows the
          live configuration reported by the controller.
        </p>
      </div>

      <div style={styles.panel}>
        <h3 style={{ marginTop: 0 }}>Bus overview</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={styles.label}>I²C bus</div>
            <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>{adc.bus ?? "?"}</div>
            <div style={styles.label}>ADC address</div>
            <div style={{ fontSize: "1.2em" }}>0x{(adc.address ?? 0).toString(16)}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.9em", color: "#aaa" }}>
              SPI/I2C tests not wired yet; this is a placeholder for quick read/write
              widgets in the next iteration.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GpioScreen;
