// file: frontend/src/components/SequencingConfig.jsx
import React, { useMemo, useState } from "react";
import { styles } from "../App";

export const SEQUENCE_PHASES = [
  { key: "startup", label: "Startup" },
  { key: "shutdown", label: "Power Down" },
  { key: "emergency", label: "Emergency" },
];

export const DEVICE_DEFAULTS = {
  startup: [
    { device: "main_motor", action: "on", delay: 0.0, enabled: true },
    { device: "feed_motor", action: "on", delay: 2.0, enabled: true },
    { device: "fan", action: "on", delay: 0.0, enabled: false },
    { device: "pump", action: "on", delay: 0.0, enabled: false },
  ],
  shutdown: [
    { device: "feed_motor", action: "off", delay: 0.0, enabled: true },
    { device: "main_motor", action: "off", delay: 5.0, enabled: true },
    { device: "fan", action: "off", delay: 0.0, enabled: false },
    { device: "pump", action: "off", delay: 0.0, enabled: false },
  ],
  emergency: [
    { device: "feed_motor", action: "off", delay: 0.0, enabled: true },
    { device: "main_motor", action: "off", delay: 0.0, enabled: true },
    { device: "fan", action: "off", delay: 0.0, enabled: true },
    { device: "pump", action: "off", delay: 0.0, enabled: true },
  ],
};

const DEVICE_LABELS = {
  main_motor: "Main Screw Motor",
  feed_motor: "Feed Screw Motor",
  fan: "Process Fan",
  pump: "Coolant Pump",
};

/**
 * Normalizes sequence configuration by merging provided settings with defaults.
 *
 * @param {object} seq - The input sequence configuration object.
 * @returns {object} A complete, normalized sequence configuration object.
 */
export function normalizeSequenceConfig(seq = {}) {
  const normalized = {
    check_temp_before_start: seq.check_temp_before_start ?? true,
  };

  SEQUENCE_PHASES.forEach(({ key }) => {
    const base = {};
    (DEVICE_DEFAULTS[key] || []).forEach((step) => {
      base[step.device] = { ...step };
    });

    if (Array.isArray(seq[key])) {
      seq[key].forEach((step) => {
        if (!step || !step.device) return;
        const existing = base[step.device] || { device: step.device, action: "off", delay: 0.0, enabled: true };
        base[step.device] = {
          ...existing,
          ...step,
          device: step.device,
          action: (step.action || existing.action || "off").toLowerCase(),
          delay:
            step.delay === undefined || step.delay === null || Number.isNaN(Number(step.delay))
              ? existing.delay || 0.0
              : Number(step.delay),
          enabled: step.enabled !== undefined ? Boolean(step.enabled) : existing.enabled,
        };
      });
    }

    normalized[key] = Object.values(base);
  });

  return normalized;
}

function PhaseTable({ phase, steps, onChange }) {
  return (
    <div style={{ background: "#161a1f", border: "1px solid #2c3e50", borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: "1.1em", fontWeight: "bold", marginBottom: 10 }}>{phase.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, alignItems: "center" }}>
        <div style={{ color: "#888", fontSize: "0.8em" }}>Device</div>
        <div style={{ color: "#888", fontSize: "0.8em" }}>Action</div>
        <div style={{ color: "#888", fontSize: "0.8em" }}>Delay (s)</div>
        <div style={{ color: "#888", fontSize: "0.8em" }}>Included</div>
        {steps.map((step) => (
          <React.Fragment key={`${phase.key}-${step.device}`}>
            <div style={{ color: "#ddd", fontWeight: 600 }}>{DEVICE_LABELS[step.device] || step.device}</div>
            <select
              value={step.action}
              onChange={(e) => onChange(phase.key, step.device, "action", e.target.value)}
              style={{ ...styles.input, width: "100%", textAlign: "left" }}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
            <input
              type="number"
              step="0.1"
              min="0"
              value={step.delay}
              style={{ ...styles.input, width: "100%" }}
              onChange={(e) => onChange(phase.key, step.device, "delay", parseFloat(e.target.value))}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#ccc" }}>
              <input
                type="checkbox"
                checked={step.enabled}
                onChange={(e) => onChange(phase.key, step.device, "enabled", e.target.checked)}
              />
              Enable
            </label>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * SequencingConfig Component.
 *
 * A modal overlay for configuring the automated startup, shutdown, and emergency sequences.
 * Allows setting delays and actions (ON/OFF) for motors, fans, and pumps in each phase.
 *
 * @param {object} props - Component props.
 * @param {object} props.sequence - Current sequence configuration.
 * @param {function} props.onClose - Callback to close the modal.
 * @param {function} props.onSave - Callback to save the configuration changes.
 */
export default function SequencingConfig({ sequence, onClose, onSave }) {
  const normalized = useMemo(() => normalizeSequenceConfig(sequence), [sequence]);
  const [workingSeq, setWorkingSeq] = useState(normalized);
  const [saving, setSaving] = useState(false);

  const handleChange = (phaseKey, device, field, value) => {
    setWorkingSeq((prev) => {
      const next = { ...prev };
      next[phaseKey] = (next[phaseKey] || []).map((step) =>
        step.device === device ? { ...step, [field]: field === "delay" ? Math.max(0, Number(value) || 0) : value } : step
      );
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(workingSeq);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0f1114",
        zIndex: 1000,
        padding: 30,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button style={styles.buttonSecondary} onClick={onClose}>
              ← Back
            </button>
            <h2 style={{ margin: 0 }}>Sequencing Config</h2>
          </div>
          <div style={{ color: "#aaa" }}>
            Control startup, power-down, and emergency ordering for motors and auxiliaries.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ color: "#ccc", display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={workingSeq.check_temp_before_start}
              onChange={(e) =>
                setWorkingSeq((prev) => ({ ...prev, check_temp_before_start: e.target.checked }))
              }
            />
            Check temperatures before start
          </label>
          <button style={styles.button} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Sequence"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {SEQUENCE_PHASES.map((phase) => (
          <PhaseTable
            key={phase.key}
            phase={phase}
            steps={workingSeq[phase.key] || []}
            onChange={handleChange}
          />
        ))}
      </div>
    </div>
  );
}
