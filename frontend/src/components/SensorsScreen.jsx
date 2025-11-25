import React, { useState } from "react";
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

function SensorsScreen({ data, sendCmd }) {
  const adc = data.config?.adc || {};
  const sensorsFromBackend = data.config?.sensors || {};
  const channels = [0, 1, 2, 3];

  const [localSensors, setLocalSensors] = useState(() => sensorsFromBackend);

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
          ? 0
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

    channels.forEach((ch) => {
      sendCmd("SET_SENSOR_CALIBRATION", {
        params: { channel: ch, r_fixed: value },
      });
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
          Configure the 4 NTC channels. Edit values in the table below, then
          write them to the controller.
        </p>
        <div
          style={{
            fontSize: "0.9em",
            color: "#ccc",
            marginBottom: "12px",
          }}
        >
          <div>Enabled: {adc.enabled ? "yes" : "no"}</div>
          <div>Bus: {adc.bus ?? "-"}</div>
          <div>
            Address:{" "}
            {adc.address !== undefined ? `0x${adc.address.toString(16)}` : "-"}
          </div>
          <div>FSR (read-only): {adc.fsr ?? "-"} V</div>
        </div>

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
                      style={{ ...inputStyle, width: "70px" }}
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
                      style={{ ...inputStyle, width: "110px" }}
                    >
                      <option value="ntc_to_gnd">ntc_to_gnd</option>
                      <option value="ntc_to_vref">ntc_to_vref</option>
                      <option value="custom">custom</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={cfg.decimals ?? 1}
                      onChange={(e) =>
                        handleFieldChange(
                          ch,
                          "decimals",
                          e.target.value === "" ? "" : e.target.value
                        )
                      }
                      style={{ ...inputStyle, width: "60px" }}
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
