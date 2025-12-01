import React, { useMemo, useState } from "react";
import { styles } from "../styles";

const WIRES = [
  { id: "heater", label: "Heater cartridge", requiresTest: true },
  { id: "thermistor", label: "Thermistor wiring", requiresTest: false },
  { id: "motor", label: "Stepper motor", requiresTest: true },
  { id: "fan", label: "Cooling fan", requiresTest: true },
];

const buildInitialState = () =>
  WIRES.reduce((acc, wire) => {
    acc[wire.id] = {
      reviewed: false,
      safeToTest: false,
      tested: false,
      completed: false,
    };
    return acc;
  }, {});

/**
 * WiringCalibrationScreen Component.
 *
 * Provides a structured checklist for verifying wiring integrity and functionality.
 *
 * Features:
 * - List of critical wiring components (Heaters, Thermistors, Motors, Fans).
 * - Multi-step verification process for each item: Review -> Safe to Test -> Tested -> Complete.
 * - Global review session state management.
 * - Validation logic to ensure all criteria are met before "proceeding".
 *
 * @param {object} props - Component props.
 */
function WiringCalibrationScreen() {
  const [reviewActive, setReviewActive] = useState(false);
  const [autoReviewStarted, setAutoReviewStarted] = useState(false);
  const [wireStates, setWireStates] = useState(() => buildInitialState());

  const handleUpdate = (id, key, value) => {
    setWireStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value,
      },
    }));
  };

  const toggleReview = (id) => {
    const current = wireStates[id];
    handleUpdate(id, "reviewed", !current.reviewed);
  };

  const toggleSafeToTest = (id) => {
    const current = wireStates[id];
    handleUpdate(id, "safeToTest", !current.safeToTest);
    if (current.tested && current.safeToTest) {
      handleUpdate(id, "tested", false);
    }
  };

  const toggleTested = (id) => {
    const current = wireStates[id];
    if (current.safeToTest) {
      handleUpdate(id, "tested", !current.tested);
    }
  };

  const toggleComplete = (id) => {
    const current = wireStates[id];
    handleUpdate(id, "completed", !current.completed);
  };

  const resetChecklist = () => {
    setReviewActive(false);
    setAutoReviewStarted(false);
    setWireStates(buildInitialState());
  };

  const hasAnyProgress = useMemo(
    () =>
      WIRES.some((wire) => {
        const state = wireStates[wire.id];
        return state.reviewed || state.safeToTest || state.tested || state.completed;
      }),
    [wireStates]
  );

  // If the user starts interacting with any card, automatically flag the session as active
  // so they don't have to discover the global "start review" switch first.
  React.useEffect(() => {
    if (!reviewActive && hasAnyProgress) {
      setReviewActive(true);
      setAutoReviewStarted(true);
    }
  }, [hasAnyProgress, reviewActive]);

  const allCriteriaMet = useMemo(
    () =>
      reviewActive &&
      WIRES.every((wire) => {
        const state = wireStates[wire.id];
        const testSatisfied =
          !wire.requiresTest || (state.safeToTest && state.tested);
        return state.reviewed && testSatisfied && state.completed;
      }),
    [reviewActive, wireStates]
  );

  return (
    <div style={styles.container}>
      <h2>Wiring calibration check</h2>
      <p style={{ color: "#ccc", lineHeight: 1.5 }}>
        Confirm each wiring path is reviewed, tested when it is safe to do so,
        and marked complete before continuing.
      </p>

      <div style={{ ...styles.panel, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          style={{
            ...styles.button,
            background: reviewActive ? "#27ae60" : "#2980b9",
            minWidth: 180,
          }}
          onClick={() => setReviewActive((prev) => !prev)}
        >
          {reviewActive ? "Reviewing in progress" : "Start review session"}
        </button>
        <button
          style={styles.buttonSecondary}
          onClick={resetChecklist}
        >
          Reset checklist
        </button>
        <div style={{ color: "#aaa" }}>
          {autoReviewStarted
            ? "Review session started automatically after you updated a component."
            : "Use the reviewing button to indicate an active verification session or start toggling a card."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {WIRES.map((wire) => {
          const state = wireStates[wire.id];
          const testSatisfied =
            !wire.requiresTest || (state.safeToTest && state.tested);
          const canComplete = state.reviewed && testSatisfied;
          return (
            <div
              key={wire.id}
              style={{
                ...styles.metricCard,
                minHeight: 'auto',
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "1.1em", fontWeight: "bold" }}>{wire.label}</div>
                  <div style={{ color: "#888", fontSize: "0.9em" }}>
                    {wire.requiresTest ? "Testing required when safe" : "Visual review only"}
                  </div>
                </div>
                <div style={{ ...styles.pill, background: state.completed ? "#1b3a2a" : "#2c3e50" }}>
                  {state.completed ? "Complete" : "In progress"}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  style={{ ...styles.button, background: state.reviewed ? "#27ae60" : "#34495e" }}
                  onClick={() => toggleReview(wire.id)}
                >
                  {state.reviewed ? "Reviewed" : "Mark reviewed"}
                </button>

                {wire.requiresTest && (
                  <>
                    <button
                      style={{ ...styles.buttonSecondary, background: state.safeToTest ? "#16a085" : "#2c3e50" }}
                      onClick={() => toggleSafeToTest(wire.id)}
                    >
                      {state.safeToTest ? "Safe to test" : "Mark safe to test"}
                    </button>
                    <button
                      style={{
                        ...styles.button,
                        background: state.tested ? "#27ae60" : "#8e44ad",
                        opacity: state.safeToTest ? 1 : 0.5,
                      }}
                      disabled={!state.safeToTest}
                      onClick={() => toggleTested(wire.id)}
                    >
                      {state.tested ? "Tested" : "Test button"}
                    </button>
                  </>
                )}

                <button
                  style={{
                    ...styles.button,
                    background: canComplete ? "#2ecc71" : "#7f8c8d",
                    cursor: canComplete ? "pointer" : "not-allowed",
                    opacity: canComplete ? 1 : 0.6,
                  }}
                  disabled={!canComplete}
                  onClick={() => toggleComplete(wire.id)}
                >
                  {state.completed ? "Completed" : "Complete wire"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          ...styles.panel,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <div style={{ color: "#ccc" }}>
          The final action unlocks when every wire has been reviewed, tested when safe,
          and marked complete while an active review is running.
        </div>
        <button
          style={{
            ...styles.button,
            background: allCriteriaMet ? "#27ae60" : "#7f8c8d",
            padding: "12px 18px",
            cursor: allCriteriaMet ? "pointer" : "not-allowed",
            opacity: allCriteriaMet ? 1 : 0.6,
          }}
          disabled={!allCriteriaMet}
        >
          Ready to proceed
        </button>
      </div>
    </div>
  );
}

export default WiringCalibrationScreen;
