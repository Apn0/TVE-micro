// file: src/components/KeypadOverlay.jsx
import React from "react";
import Keypad from "./Keypad";

/**
 * KeypadOverlay Component.
 *
 * Renders the Keypad component inside a modal overlay.
 * Handles positioning and click-outside-to-close behavior.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.visible - Whether the overlay is visible.
 * @param {object} props.position - {x, y} coordinates for the keypad.
 * @param {string} props.value - The current value being edited.
 * @param {function} props.setValue - Function to update the value.
 * @param {function} props.submit - Function to submit the value.
 * @param {function} props.close - Function to close the overlay.
 */
export default function KeypadOverlay({
  visible,
  position,
  value,
  setValue,
  submit,
  close,
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
      }}
      onClick={close}
    >
      <div
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Keypad
          value={value}
          onChange={setValue}
          onEnter={(v) => submit(v)}
          onCancel={close}
        />
      </div>
    </div>
  );
}
