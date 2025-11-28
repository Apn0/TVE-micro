import React, { useMemo, useState } from "react";
import { styles } from "../App";

/*
  NOTE – IMPORTANT BEHAVIOUR CHANGE

  - localSensors is now ONLY initialised from backend once.
  - It is NOT overwritten every poll anymore, so your edits no longer
    get reset each second.
  - Use the buttons:
      • "Reload from controller" → pull fresh config from backend
      • "Write all channels to controller" → send all edited rows
*/

/**
 * SensorsScreen Component.
 *
 * Provides monitoring and configuration for ADS1115-based sensors.
 *
 * Features:
 * - Live display of sensor values mapped to logical names (t1, t2, t3, motor).
 * - Configuration table for each ADC channel (Enabled, Logical Name, Calibration Params).
 * - Buttons to apply configuration changes to the backend.
 * - Local state management to prevent overwriting edits during polling.
 *
 * @param {object} props - Component props.
 * @param {object} props.data - Current system state and configuration.
 * @param {function} props.sendCmd - Function to send API commands.
 */
function SensorsScreen({ data, sendCmd }) {
  const adc = data.config?.adc || {};
  const sensorsFromBackend = data.config?.sensors || {};
  const temps = data.state?.temps || {};
  const channels = [0, 1, 2, 3];

  const [localSensors, setLocalSensors] = useState(() => sensorsFromBackend);

  const logicalMap = useMemo(() => {
    const pairs = Object.entries(sensorsFromBackend || {});
    return pairs.reduce((acc, [ch, cfg]) => {
      if (cfg?.logical) {
        acc[cfg.logical] = { channel: Number(ch), cfg };
      }
      return acc;
    }, {});
  }, [sensorsFromBackend]);

  const formatTemp = (value, decimals = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "--.--";
    return Number(value).toFixed(decimals);
  };

  const sensorCards = [
    { key: "t1", label: "T1 thermistor", detail: "Barrel / zone 1", value: temps.t1 },
    { key: "t2", label: "T2 thermistor", detail: "Zone 2 mid-barrel", value: temps.t2 },
    { key: "t3", label: "T3 thermistor", detail: "Nozzle / zone 3", value: temps.t3 },
    {
      key: "motor",
      label: "Motor thermistor",
      detail: "Stepper casing",
      value: temps.motor,
    },
  ];

  const handleFieldChange = (ch, field, value) => {
    setLocalSensors((prev) => {
      const key = String(ch);
      const prevCfg = (prev && prev[key]) || {};
      return {
        ...(prev || {}),
        [key]: {
          ...prevCfg,
          [field]: value,
        },
      };
    });
  };

  const reloadFromBackend = () => {
    setLocalSensors(sensorsFromBackend);
  };

  const buildParams = (ch) => {
    const cfg = (localSensors && localSensors[String(ch)]) || {};
    return {
      channel: ch,
      enabled: cfg.enabled ?? true,
      logical: cfg.logical || "",
      r_fixed:
        cfg.r_fixed === "" || cfg.r_fixed === null
          ? null
          : Number(cfg.r_fixed),
      r_25:
        cfg.r_25 === "" || cfg.r_25 === null ? null : Number(cfg.r_25),
      beta:
        cfg.beta === "" || cfg.beta === null ? null : Number(cfg.beta),
      wiring: cfg.wiring || "",
      decimals:
        cfg.decimals === "" || cfg.decimals === null
          ? 2
          : parseInt(cfg.decimals, 10),
    };
  };

  const applyOne = (ch) => {
    sendCmd("SET_SENSOR_CALIBRATION", {
      params: buildParams(ch),
    });
  };

  const applyAll = () => {
    channels.forEach((ch) => {
      sendCmd("SET_SENSOR_CALIBRATION", {
        params: buildParams(ch),
      });
    });
  };

  const applyRfixedAll = (value) => {
    setLocalSensors((prev) => {
      const next = { ...(prev || {}) };
      channels.forEach((ch) => {
        const key = String(ch);
        const prevCfg = next[key] || {};
        next[key] = { ...prevCfg, r_fixed: value };
      });
      return next;
    });
  };

  const tdStyle = {
    padding: "6px 8px",
    borderBottom: "1px solid #333",
    fontSize: "0.85em",
    textAlign: "center",
  };

  const thStyle = {
    ...tdStyle,
    fontWeight: "bold",
  };

  const inputStyle = {
    ...styles.input,
    width: "80px",
    textAlign: "center",
  };

  const smallBtn = {
    ...styles.buttonSecondary,
    padding: "4px 8px",
    fontSize: "0.75em",
    marginRight: 0,
  };

  return (
    <div>
      <div style={styles.panel}>
        <h2>ADS1115 sensors</h2>
        <p style={{ fontSize: "0.9em", color: "#aaa" }}>
          Live thermistor readings and calibration controls in one place. Values
          below are shown with two decimals for quick diagnostics.
        </p>

        <div style={styles.metricGrid}>
          {sensorCards.map((card) => {
            const mapping = logicalMap[card.key];
            const decimals = mapping?.cfg?.decimals ?? 2;
            return (
              <div key={card.key} style={styles.metricCard}>
                <div style={styles.metricLabel}>{card.label}</div>
                <div style={{ color: "#b0c4de", fontSize: "0.95em" }}>{card.detail}</div>
                <div style={styles.metricValue}>
                  {formatTemp(card.value, 2)}
                  <span style={{ fontSize: "0.7em", marginLeft: 6, color: "#8c9fb1" }}>
                    °C
                  </span>
                </div>
                <div style={styles.cardHint}>
                  {mapping
                    ? `Mapped to A${mapping.channel} (${mapping.cfg.wiring || "wiring ?"}, ${decimals} dp)`
                    : "No mapping from ADS to this logical sensor"}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            marginTop: "16px",
            color: "#ccc",
            fontSize: "0.9em",
          }}
        >
          <div style={{ background: "#151a21", padding: "12px", borderRadius: 8, border: "1px solid #1f2a36" }}>
            <div style={styles.label}>ADC enabled</div>
            <div style={styles.metricBig}>{adc.enabled ? "Yes" : "No"}</div>
          </div>
          <div style={{ background: "#151a21", padding: "12px", borderRadius: 8, border: "1px solid #1f2a36" }}>
            <div style={styles.label}>Bus</div>
            <div style={styles.metricBig}>{adc.bus ?? "-"}</div>
          </div>
          <div style={{ background: "#151a21", padding: "12px", borderRadius: 8, border: "1px solid #1f2a36" }}>
            <div style={styles.label}>Address</div>
            <div style={styles.metricBig}>
              {adc.address !== undefined ? `0x${adc.address.toString(16)}` : "-"}
            </div>
          </div>
          <div style={{ background: "#151a21", padding: "12px", borderRadius: 8, border: "1px solid #1f2a36" }}>
            <div style={styles.label}>FSR (read-only)</div>
            <div style={styles.metricBig}>{adc.fsr ?? "-"} V</div>
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          <button
            style={styles.buttonSecondary}
            onClick={() => applyRfixedAll(1000)}
          >
            Set all R_fixed = 1 kΩ
          </button>
          <button
            style={{ ...styles.buttonSecondary, marginLeft: "8px" }}
            onClick={reloadFromBackend}
          >
            Reload from controller
          </button>
          <button
            style={{ ...styles.buttonSecondary, marginLeft: "8px" }}
            onClick={applyAll}
          >
            Write all channels to controller
          </button>
        </div>

        <p style={{ fontSize: "0.85em", color: "#aaa", marginTop: "6px" }}>
          "Set all R_fixed" only updates the local table. Use a write button to
          persist the values on the controller. Decimals default to two places
          for clearer live readouts.
        </p>
      </div>

      <div style={styles.panel}>
        <h3>Channel overview</h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            color: "#ccc",
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Channel</th>
              <th style={thStyle}>Enabled</th>
              <th style={thStyle}>Logical</th>
              <th style={thStyle}>R_fixed (Ω)</th>
              <th style={thStyle}>R_25 (Ω)</th>
              <th style={thStyle}>β</th>
              <th style={thStyle}>Wiring</th>
              <th style={thStyle}>Decimals</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => {
              const key = String(ch);
              const cfg = (localSensors && localSensors[key]) || {};
              return (
                <tr key={ch}>
                  <td style={tdStyle}>A{ch}</td>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={cfg.enabled ?? true}
                      onChange={(e) =>
                        handleFieldChange(ch, "enabled", e.target.checked)
                      }
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={cfg.logical ?? ""}
                      onChange={(e) =>
                        handleFieldChange(ch, "logical", e.target.value)
                      }
                      style={{ ...inputStyle, width: "80px" }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={cfg.r_fixed ?? ""}
                      onChange={(e) =>
                        handleFieldChange(
                          ch,
                          "r_fixed",
                          e.target.value === "" ? "" : e.target.value
                        )
                      }
                      style={inputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={cfg.r_25 ?? ""}
                      onChange={(e) =>
                        handleFieldChange(
                          ch,
                          "r_25",
                          e.target.value === "" ? "" : e.target.value
                        )
                      }
                      style={inputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={cfg.beta ?? ""}
                      onChange={(e) =>
                        handleFieldChange(
                          ch,
                          "beta",
                          e.target.value === "" ? "" : e.target.value
                        )
                      }
                      style={inputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={cfg.wiring ?? "ntc_to_gnd"}
                      onChange={(e) =>
                        handleFieldChange(ch, "wiring", e.target.value)
                      }
                      style={{ ...inputStyle, width: "120px" }}
                    >
                      <option value="ntc_to_gnd">ntc_to_gnd</option>
                      <option value="ntc_to_vref">ntc_to_vref</option>
                      <option value="custom">custom</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={cfg.decimals ?? 2}
                      onChange={(e) =>
                        handleFieldChange(
                          ch,
                          "decimals",
                          e.target.value === "" ? "" : e.target.value
                        )
                      }
                      style={{ ...inputStyle, width: "70px" }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      style={smallBtn}
                      onClick={() => applyOne(ch)}
                    >
                      Write A{ch}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ fontSize: "0.8em", color: "#777", marginTop: "8px" }}>
          All columns are center aligned. Edits stay local until you press a
          write button.
        </p>
      </div>
    </div>
  );
}

export default SensorsScreen;
