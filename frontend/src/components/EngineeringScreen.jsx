// file: frontend/src/components/EngineeringScreen.jsx
import React, { useState, useEffect } from "react";
import { styles } from "../styles";

/**
 * EngineeringScreen Component.
 *
 * Implements the "Engineering Focused" layout for system configuration.
 * Groups settings into logical engineering subsystems with a dense, form-based UI.
 */
function EngineeringScreen({ data, sendCmd, setView }) {
  // Local state for form fields
  const [logging, setLogging] = useState({ interval: 1.0, flush_interval: 60.0 });
  const [cycle, setCycle] = useState({ autoStart: false, safetyTimeout: 300 });
  const [motorLimits, setMotorLimits] = useState({ maxRpm: 5000, accel: 100 });
  const [heaterConfig, setHeaterConfig] = useState({ maxDuty: 100, coldExtrusionTemp: 140 });
  const [fanConfig, setFanConfig] = useState({ alwaysOn: false, postRunCooling: 60 });
  const [ledConfig, setLedConfig] = useState({ brightness: 100, blinkOnActivity: true });

  // Load initial values from data prop when available
  useEffect(() => {
    if (data?.config) {
      if (data.config.logging) setLogging(prev => ({ ...prev, ...data.config.logging }));
      // Map other config values here as backend API supports them
    }
  }, [data]);

  const handleSaveSystem = () => {
    sendCmd("SET_LOGGING_SETTINGS", { params: logging });
  };

  const SettingRow = ({ label, children, description }) => (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: "12px", borderBottom: "1px solid #333", paddingBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ color: "#ecf0f1", fontWeight: "500", fontSize: "0.95em" }}>{label}</label>
        <div style={{ marginLeft: "10px" }}>{children}</div>
      </div>
      {description && <div style={{ color: "#7f8c8d", fontSize: "0.8em", marginTop: "2px" }}>{description}</div>}
    </div>
  );

  const SectionHeader = ({ title }) => (
    <h3 style={{
      borderBottom: "2px solid #e67e22",
      paddingBottom: "5px",
      marginTop: "20px",
      marginBottom: "15px",
      color: "#e67e22"
    }}>
      {title}
    </h3>
  );

  const Input = (props) => (
    <input
      {...props}
      style={{
        background: "#2c3e50",
        border: "1px solid #34495e",
        color: "white",
        padding: "4px 8px",
        borderRadius: "4px",
        textAlign: "right",
        width: "80px",
        ...props.style
      }}
    />
  );

  const Toggle = ({ checked, onChange }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ transform: "scale(1.2)", cursor: "pointer" }}
    />
  );

  return (
    <div style={styles.container}>
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, color: "#ecf0f1" }}>Engineering Settings</h2>
          <p style={{ color: "#95a5a6", margin: "5px 0 0 0" }}>
            Advanced configuration for system mechanics, logic, and hardware.
          </p>
        </div>
        <button
            style={{ ...styles.buttonSecondary, fontSize: "0.9em" }}
            onClick={() => setView("SETTINGS")}
        >
            Back to General
        </button>
      </div>

      {/* --- SECTION 1: SYSTEM & LOGGING --- */}
      <div style={styles.panel}>
        <SectionHeader title="System & Logging" />
        <SettingRow label="Data Log Interval" description="Seconds between data points recorded to CSV">
          <Input
            type="number" step="0.1"
            value={logging.interval}
            onChange={(e) => setLogging({ ...logging, interval: parseFloat(e.target.value) })}
          />
        </SettingRow>
        <SettingRow label="Flush Interval" description="Seconds before forcing write to disk">
          <Input
            type="number" step="1"
            value={logging.flush_interval}
            onChange={(e) => setLogging({ ...logging, flush_interval: parseFloat(e.target.value) })}
          />
        </SettingRow>
        <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
          <button style={styles.button} onClick={handleSaveSystem}>Apply System Settings</button>
          <button style={{ ...styles.button, background: "#c0392b" }}>Restart Backend Service</button>
        </div>
      </div>

      {/* --- SECTION 2: PROCESS CYCLE --- */}
      <div style={styles.panel}>
        <SectionHeader title="Process Cycle Logic" />
        <SettingRow label="Auto-Start on Power Up" description="Automatically begin heating sequence when device turns on">
          <Toggle
            checked={cycle.autoStart}
            onChange={(e) => setCycle({...cycle, autoStart: e.target.checked})}
          />
        </SettingRow>
        <SettingRow label="Safety Timeout" description="Max duration (min) for heater activity without motor movement">
          <Input
             type="number"
             value={cycle.safetyTimeout}
             onChange={(e) => setCycle({...cycle, safetyTimeout: parseInt(e.target.value)})}
          />
        </SettingRow>
      </div>

      {/* --- SECTION 3: HEATERS --- */}
      <div style={styles.panel}>
        <SectionHeader title="Heaters (Thermal)" />
        <SettingRow label="Max Heater Duty Cycle" description="Limit global power output (%) to prevent overshoot/SSR stress">
          <Input
            type="number" max="100" min="0"
            value={heaterConfig.maxDuty}
            onChange={(e) => setHeaterConfig({...heaterConfig, maxDuty: parseInt(e.target.value)})}
          />
        </SettingRow>
        <SettingRow label="Cold Extrusion Limit" description="Min temperature (°C) required to enable main motor">
          <Input
            type="number"
            value={heaterConfig.coldExtrusionTemp}
            onChange={(e) => setHeaterConfig({...heaterConfig, coldExtrusionTemp: parseInt(e.target.value)})}
          />
        </SettingRow>
        <div style={{ marginTop: "10px", padding: "10px", background: "#2c3e50", borderRadius: "4px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "5px", color: "#bdc3c7" }}>PID Parameters</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div><small>Kp</small><br/><Input defaultValue={25.0} style={{width: "100%"}} /></div>
                <div><small>Ki</small><br/><Input defaultValue={0.05} style={{width: "100%"}} /></div>
                <div><small>Kd</small><br/><Input defaultValue={10.0} style={{width: "100%"}} /></div>
            </div>
        </div>
      </div>

      {/* --- SECTION 4: MOTORS --- */}
      <div style={styles.panel}>
        <SectionHeader title="Main Motor (Drive)" />
        <SettingRow label="Max RPM" description="Absolute hardware limit for safety">
            <Input
                type="number"
                value={motorLimits.maxRpm}
                onChange={(e) => setMotorLimits({...motorLimits, maxRpm: parseInt(e.target.value)})}
            />
        </SettingRow>
        <SettingRow label="Acceleration Ramp" description="RPM change per second">
            <Input
                type="number"
                value={motorLimits.accel}
                onChange={(e) => setMotorLimits({...motorLimits, accel: parseInt(e.target.value)})}
            />
        </SettingRow>
      </div>

      {/* --- SECTION 5: PERIPHERALS (FAN/LED) --- */}
      <div style={styles.panel}>
        <SectionHeader title="Peripherals (Fan & LED)" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
                <h4 style={{ margin: "0 0 10px 0", color: "#bdc3c7" }}>Cooling Fan</h4>
                <SettingRow label="Always On">
                    <Toggle checked={fanConfig.alwaysOn} onChange={(e) => setFanConfig({...fanConfig, alwaysOn: e.target.checked})} />
                </SettingRow>
                <SettingRow label="Post-Run Cool (s)">
                    <Input value={fanConfig.postRunCooling} onChange={(e) => setFanConfig({...fanConfig, postRunCooling: parseInt(e.target.value)})} />
                </SettingRow>
            </div>
            <div>
                <h4 style={{ margin: "0 0 10px 0", color: "#bdc3c7" }}>Status LED</h4>
                <SettingRow label="Blink Activity">
                    <Toggle checked={ledConfig.blinkOnActivity} onChange={(e) => setLedConfig({...ledConfig, blinkOnActivity: e.target.checked})} />
                </SettingRow>
                <SettingRow label="Brightness (%)">
                    <Input value={ledConfig.brightness} onChange={(e) => setLedConfig({...ledConfig, brightness: parseInt(e.target.value)})} />
                </SettingRow>
            </div>
        </div>
      </div>

      {/* --- SECTION 6: BACKEND / IO MAPPING --- */}
      <div style={styles.panel}>
        <SectionHeader title="Hardware I/O Mapping" />
        <p style={{ color: "#e74c3c", fontSize: "0.9em" }}>
            Warning: Changing pin assignments requires a full system restart.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" }}>
            {/* Placeholder mapping UI */}
            {["SSR Z1", "SSR Z2", "Main PWM", "Fan Relay", "Pump Relay"].map(label => (
                <div key={label} style={{ background: "#2c3e50", padding: "8px", borderRadius: "4px" }}>
                    <div style={{ fontSize: "0.8em", color: "#bdc3c7" }}>{label}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                        <span style={{ fontSize: "0.9em" }}>GPIO</span>
                        <Input style={{ width: "40px", padding: "2px" }} defaultValue={0} />
                    </div>
                </div>
            ))}
        </div>
      </div>

      <div style={{ height: "40px" }}></div>
    </div>
  );
}

export default EngineeringScreen;
