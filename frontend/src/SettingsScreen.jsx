// file: frontend/src/SettingsScreen.jsx
import React, { useEffect, useState } from "react";

const LOGICAL_SENSORS = ["t1", "t2", "t3", "motor"];
const ADC_CHANNELS = [0, 1, 2, 3];

// DM556 DIP table (V18 - real matrix)
// ON = true, OFF = false
const DM556_TABLE = {
  current: {
    1.4: [true, true, true],   // ON ON ON
    2.1: [false, true, true],  // OFF ON ON
    2.7: [true, false, true],  // ON OFF ON
    3.2: [false, false, true], // OFF OFF ON
    3.8: [true, true, false],  // ON ON OFF
    4.3: [false, true, false], // OFF ON OFF
    4.9: [true, false, false], // ON OFF OFF
    5.6: [false, false, false] // OFF OFF OFF
  },
  steps: {
    400:   [false, true, true, true],   // OFF ON ON ON
    800:   [true, false, true, true],   // ON OFF ON ON
    1600:  [false, false, true, true],  // OFF OFF ON ON
    3200:  [true, true, false, true],   // ON ON OFF ON
    6400:  [false, true, false, true],  // OFF ON OFF ON
    12800: [true, false, false, true],  // ON OFF OFF ON
    25600: [false, false, false, true], // OFF OFF OFF ON
    1000:  [true, true, true, false],   // ON ON ON OFF
    2000:  [false, true, true, false],  // OFF ON ON OFF
    4000:  [true, false, true, false],  // ON OFF ON OFF
    5000:  [false, false, true, false], // OFF OFF ON OFF
    8000:  [true, true, false, false],  // ON ON OFF OFF
    10000: [false, true, false, false], // OFF ON OFF OFF
    20000: [true, false, false, false], // ON OFF OFF OFF
    25000: [false, false, false, false] // OFF OFF OFF OFF
  }
};

function DipSwitchBlock({ switches }) {
  return (
    <div
      style={{
        background: "#c0392b",
        padding: "10px",
        borderRadius: 4,
        display: "inline-flex",
        gap: 5,
        border: "2px solid #fff",
      }}
    >
      {switches.map((s, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "white",
              fontSize: "0.7em",
              textAlign: "center",
              marginBottom: 2,
            }}
          >
            {i + 1}
          </div>
          <div
            style={{
              width: 20,
              height: 40,
              background: "#ecf0f1",
              position: "relative",
              borderRadius: 2,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                background: "#2c3e50",
                position: "absolute",
                left: 2,
                top: s ? 22 : 2,
                transition: "top 0.2s",
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              color: "white",
              fontSize: "0.7em",
              textAlign: "center",
              marginTop: 2,
            }}
          >
            {s ? "ON" : "OFF"}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [savingTemp, setSavingTemp] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [savingCal, setSavingCal] = useState(false);
  const [savingDm, setSavingDm] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [tempSettings, setTempSettings] = useState({
    poll_interval: 0.25,
    avg_window: 2.0,
    use_average: true,
    decimals_default: 1,
  });

  const [mapping, setMapping] = useState({
    t1: null,
    t2: null,
    t3: null,
    motor: null,
  });

  // sensorCal[channel] = { r_fixed, r_25, beta, v_ref, wiring, decimals, cal_points_raw }
  const [sensorCal, setSensorCal] = useState({});

  const [dm, setDm] = useState({
    microsteps: 1600,
    current_peak: 2.7,
    idle_half: true,
  });

  // --------- LOAD STATUS ONCE ---------
  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setLoading(true);
      setError("");
      setMessage("");
      try {
        const res = await fetch("/api/status");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (cancelled) return;

        const cfg = json.config || {};

        // temp_settings
        const ts = cfg.temp_settings || {};
        setTempSettings({
          poll_interval: ts.poll_interval ?? 0.25,
          avg_window: ts.avg_window ?? 2.0,
          use_average: ts.use_average ?? true,
          decimals_default: ts.decimals_default ?? 1,
        });

        // mapping from sensors / logical
        const sensorsObj = cfg.sensors || {};
        const newMap = { t1: null, t2: null, t3: null, motor: null };
        const newCal = {};

        Object.keys(sensorsObj).forEach((chStr) => {
          const ch = Number(chStr);
          const sc = sensorsObj[chStr] || {};
          const logical = sc.logical;
          if (LOGICAL_SENSORS.includes(logical)) {
            newMap[logical] = ch;
          }

          newCal[ch] = {
            r_fixed: sc.r_fixed ?? 100000,
            r_25: sc.r_25 ?? 100000,
            beta: sc.beta ?? 3950,
            v_ref: sc.v_ref ?? 3.3,
            wiring: sc.wiring ?? "ntc_to_gnd",
            decimals: sc.decimals ?? 1,
            cal_points_raw:
              sc.cal_points && sc.cal_points.length > 0
                ? JSON.stringify(sc.cal_points, null, 2)
                : "",
          };
        });

        setMapping(newMap);
        setSensorCal(newCal);

        // DM556 config
        const dmCfg = cfg.dm556 || {};
        setDm({
          microsteps: dmCfg.microsteps ?? 1600,
          current_peak: dmCfg.current_peak ?? 2.7,
          idle_half: dmCfg.idle_half ?? true,
        });

        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError("Failed to load /api/status: " + String(e.message || e));
        setLoading(false);
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // --------- HANDLERS ---------

  function handleTempChange(field, value) {
    setTempSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleMappingChange(logical, value) {
    setMapping((prev) => ({
      ...prev,
      [logical]: value === "" ? null : Number(value),
    }));
  }

  function handleCalChange(channel, field, value) {
    setSensorCal((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [field]:
          field === "wiring" || field === "cal_points_raw"
            ? value
            : value === ""
            ? ""
            : Number(value),
      },
    }));
  }

  function getDmSwitchState() {
    let swCurr = [false, false, false];
    let swSteps = [false, false, false, false];

    if (DM556_TABLE.current[dm.current_peak]) {
      swCurr = DM556_TABLE.current[dm.current_peak];
    }
    if (DM556_TABLE.steps[dm.microsteps]) {
      swSteps = DM556_TABLE.steps[dm.microsteps];
    }
    // SW1-3 current, SW4 idle-half, SW5-8 microsteps
    return [...swCurr, !dm.idle_half, ...swSteps];
  }

  // --------- SAVE CALLS ---------

  async function saveTempSettings() {
    setSavingTemp(true);
    setError("");
    setMessage("");
    try {
      const body = {
        command: "SET_TEMP_SETTINGS",
        value: {
          params: {
            poll_interval: Number(tempSettings.poll_interval),
            avg_window: Number(tempSettings.avg_window),
            use_average: Boolean(tempSettings.use_average),
            decimals_default: Number(tempSettings.decimals_default),
          },
        },
      };
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "SET_TEMP_SETTINGS failed");
      }
      setMessage("Temperature settings saved.");
    } catch (e) {
      setError("Failed to save temperature settings: " + String(e.message || e));
    } finally {
      setSavingTemp(false);
    }
  }

  async function saveMapping() {
    setSavingMap(true);
    setError("");
    setMessage("");
    try {
      const body = {
        command: "SET_SENSOR_MAPPING",
        value: {
          mapping: {
            t1: mapping.t1,
            t2: mapping.t2,
            t3: mapping.t3,
            motor: mapping.motor,
          },
        },
      };
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "SET_SENSOR_MAPPING failed");
      }
      setMessage("Sensor mapping saved.");
    } catch (e) {
      setError("Failed to save sensor mapping: " + String(e.message || e));
    } finally {
      setSavingMap(false);
    }
  }

  async function saveCalibrationForChannel(ch) {
    setSavingCal(true);
    setError("");
    setMessage("");
    try {
      const cfg = sensorCal[ch];
      let calPoints = undefined;
      if (cfg.cal_points_raw && cfg.cal_points_raw.trim() !== "") {
        try {
          calPoints = JSON.parse(cfg.cal_points_raw);
        } catch (e) {
          throw new Error(
            `Channel ${ch}: cal_points is not valid JSON: ${e.message || e}`
          );
        }
      }

      const params = {
        channel: ch,
        r_fixed: Number(cfg.r_fixed),
        r_25: Number(cfg.r_25),
        beta: Number(cfg.beta),
        v_ref: Number(cfg.v_ref),
        wiring: cfg.wiring,
        decimals: Number(cfg.decimals),
      };
      if (calPoints !== undefined) {
        params.cal_points = calPoints;
      }

      const body = {
        command: "SET_SENSOR_CALIBRATION",
        value: { params },
      };

      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "SET_SENSOR_CALIBRATION failed");
      }
      setMessage(`Calibration saved for channel ${ch}.`);
    } catch (e) {
      setError("Failed to save calibration: " + String(e.message || e));
    } finally {
      setSavingCal(false);
    }
  }

  async function saveDm556() {
    setSavingDm(true);
    setError("");
    setMessage("");
    try {
      const body = {
        command: "UPDATE_DM556",
        value: {
          params: {
            microsteps: Number(dm.microsteps),
            current_peak: Number(dm.current_peak),
            idle_half: Boolean(dm.idle_half),
          },
        },
      };
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "UPDATE_DM556 failed");
      }
      setMessage("DM556 driver config saved.");
    } catch (e) {
      setError("Failed to save DM556 config: " + String(e.message || e));
    } finally {
      setSavingDm(false);
    }
  }

  // --------- RENDER ---------

  return (
    <div style={{ padding: "1rem", maxWidth: 1100, margin: "0 auto" }}>
      <h2>Settings</h2>

      {loading && <div>Loading settingsâ€¦</div>}
      {error && (
        <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>
      )}
      {message && (
        <div style={{ color: "lime", marginBottom: "0.5rem" }}>{message}</div>
      )}

      {/* DM556 driver settings */}
      <section
        style={{
          border: "1px solid #555",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          background: "#1e1e1e",
        }}
      >
        <h3>DM556 Driver</h3>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 260 }}>
            <label style={{ display: "block", marginBottom: 4, color: "#ccc" }}>
              Target current (peak, A)
            </label>
            <select
              style={{
                background: "#000",
                border: "1px solid #555",
                color: "white",
                padding: "5px",
                width: 120,
              }}
              value={dm.current_peak}
              onChange={(e) =>
                setDm((prev) => ({
                  ...prev,
                  current_peak: parseFloat(e.target.value),
                }))
              }
            >
              {Object.keys(DM556_TABLE.current).map((k) => (
                <option key={k} value={k}>
                  {k} A
                </option>
              ))}
            </select>

            <label
              style={{
                display: "block",
                marginTop: 10,
                marginBottom: 4,
                color: "#ccc",
              }}
            >
              Microsteps
            </label>
            <select
              style={{
                background: "#000",
                border: "1px solid #555",
                color: "white",
                padding: "5px",
                width: 120,
              }}
              value={dm.microsteps}
              onChange={(e) =>
                setDm((prev) => ({
                  ...prev,
                  microsteps: parseInt(e.target.value, 10),
                }))
              }
            >
              {Object.keys(DM556_TABLE.steps)
                .map((k) => Number(k))
                .sort((a, b) => a - b)
                .map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
            </select>

            <div style={{ marginTop: 10 }}>
              <label style={{ color: "#aaa", fontSize: "0.9em" }}>
                <input
                  type="checkbox"
                  checked={dm.idle_half}
                  onChange={(e) =>
                    setDm((prev) => ({
                      ...prev,
                      idle_half: e.target.checked,
                    }))
                  }
                  style={{ marginRight: 6 }}
                />
                SW4: Half current when idle
              </label>
            </div>

            <button
              onClick={saveDm556}
              disabled={savingDm}
              style={{
                marginTop: 12,
                padding: "8px 16px",
                borderRadius: 4,
                border: "none",
                background: savingDm ? "#555" : "#3498db",
                color: "white",
                fontWeight: "bold",
                cursor: savingDm ? "default" : "pointer",
              }}
            >
              {savingDm ? "Savingâ€¦" : "Save driver config"}
            </button>
          </div>

          <div style={{ minWidth: 220 }}>
            <div style={{ color: "#ccc", marginBottom: 6 }}>DIP mapping</div>
            <div
              style={{ fontSize: "0.8em", color: "#aaa", marginBottom: 5 }}
            >
              Set the physical DIP switches to match:
            </div>
            <DipSwitchBlock switches={getDmSwitchState()} />
          </div>
        </div>
      </section>

      {/* Temperature loop settings */}
      <section
        style={{
          border: "1px solid #555",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          background: "#1e1e1e",
        }}
      >
        <h3>Temperature loop</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            rowGap: "0.5rem",
            columnGap: "0.75rem",
            maxWidth: 600,
          }}
        >
          <label>Poll interval (s)</label>
          <input
            type="number"
            step="0.01"
            value={tempSettings.poll_interval}
            onChange={(e) =>
              handleTempChange("poll_interval", Number(e.target.value))
            }
          />

          <label>Averaging window (s)</label>
          <input
            type="number"
            step="0.1"
            value={tempSettings.avg_window}
            onChange={(e) =>
              handleTempChange("avg_window", Number(e.target.value))
            }
          />

          <label>Use averaging</label>
          <input
            type="checkbox"
            checked={tempSettings.use_average}
            onChange={(e) =>
              handleTempChange("use_average", e.target.checked)
            }
          />

          <label>Default decimals</label>
          <input
            type="number"
            step="1"
            value={tempSettings.decimals_default}
            onChange={(e) =>
              handleTempChange("decimals_default", Number(e.target.value))
            }
          />
        </div>

        <button
          onClick={saveTempSettings}
          disabled={savingTemp}
          style={{
            marginTop: "0.75rem",
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: savingTemp ? "#555" : "#3498db",
            color: "white",
            fontWeight: "bold",
            cursor: savingTemp ? "default" : "pointer",
          }}
        >
          {savingTemp ? "Savingâ€¦" : "Save temperature settings"}
        </button>
      </section>

      {/* Mapping */}
      <section
        style={{
          border: "1px solid #555",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          background: "#1e1e1e",
        }}
      >
        <h3>Sensor mapping (ADS â†’ logical)</h3>
        <table
          style={{
            width: "100%",
            maxWidth: 500,
            borderCollapse: "collapse",
            marginBottom: "0.5rem",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  borderBottom: "1px solid #555",
                  textAlign: "left",
                  padding: "4px 6px",
                }}
              >
                Logical
              </th>
              <th
                style={{
                  borderBottom: "1px solid #555",
                  textAlign: "left",
                  padding: "4px 6px",
                }}
              >
                ADS channel
              </th>
            </tr>
          </thead>
          <tbody>
            {LOGICAL_SENSORS.map((logical) => (
              <tr key={logical}>
                <td
                  style={{
                    borderBottom: "1px solid #333",
                    padding: "4px 6px",
                  }}
                >
                  {logical}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #333",
                    padding: "4px 6px",
                  }}
                >
                  <select
                    value={
                      mapping[logical] === null ? "" : String(mapping[logical])
                    }
                    onChange={(e) =>
                      handleMappingChange(logical, e.target.value)
                    }
                  >
                    <option value="">(none)</option>
                    {ADC_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={saveMapping}
          disabled={savingMap}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: savingMap ? "#555" : "#3498db",
            color: "white",
            fontWeight: "bold",
            cursor: savingMap ? "default" : "pointer",
          }}
        >
          {savingMap ? "Savingâ€¦" : "Save mapping"}
        </button>
      </section>

      {/* Calibration per channel */}
      <section
        style={{
          border: "1px solid #555",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          background: "#1e1e1e",
        }}
      >
        <h3>Sensor calibration</h3>
        {ADC_CHANNELS.map((ch) => {
          const cfg = sensorCal[ch];
          if (!cfg) {
            return (
              <div key={ch} style={{ marginBottom: "0.75rem" }}>
                <strong>Channel {ch}</strong> â€“ no config loaded
              </div>
            );
          }
          return (
            <div
              key={ch}
              style={{
                border: "1px solid #333",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <strong>Channel {ch}</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr",
                  rowGap: "0.3rem",
                  columnGap: "0.5rem",
                  marginTop: "0.4rem",
                }}
              >
                <label>R_fixed (Î©)</label>
                <input
                  type="number"
                  value={cfg.r_fixed}
                  onChange={(e) =>
                    handleCalChange(ch, "r_fixed", e.target.value)
                  }
                />

                <label>R_25 (Î©)</label>
                <input
                  type="number"
                  value={cfg.r_25}
                  onChange={(e) =>
                    handleCalChange(ch, "r_25", e.target.value)
                  }
                />

                <label>Î² (K)</label>
                <input
                  type="number"
                  value={cfg.beta}
                  onChange={(e) =>
                    handleCalChange(ch, "beta", e.target.value)
                  }
                />

                <label>V_ref (V)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cfg.v_ref}
                  onChange={(e) =>
                    handleCalChange(ch, "v_ref", e.target.value)
                  }
                />

                <label>Wiring</label>
                <select
                  value={cfg.wiring}
                  onChange={(e) =>
                    handleCalChange(ch, "wiring", e.target.value)
                  }
                >
                  <option value="ntc_to_gnd">ntc_to_gnd</option>
                  <option value="ntc_to_vref">ntc_to_vref</option>
                </select>

                <label>Decimals</label>
                <input
                  type="number"
                  value={cfg.decimals}
                  onChange={(e) =>
                    handleCalChange(ch, "decimals", e.target.value)
                  }
                />

                <label>Calibration points (JSON)</label>
                <textarea
                  rows={4}
                  value={cfg.cal_points_raw}
                  onChange={(e) =>
                    handleCalChange(ch, "cal_points_raw", e.target.value)
                  }
                  style={{ fontFamily: "monospace", fontSize: "0.85em" }}
                />
              </div>
              <button
                onClick={() => saveCalibrationForChannel(ch)}
                disabled={savingCal}
                style={{
                  marginTop: "0.5rem",
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: savingCal ? "#555" : "#3498db",
                  color: "white",
                  fontWeight: "bold",
                  cursor: savingCal ? "default" : "pointer",
                }}
              >
                {savingCal ? "Savingâ€¦" : `Save channel ${ch}`}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

