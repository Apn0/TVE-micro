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
 * @param {function} props.onKey - Function to handle key presses.
 * @param {boolean} props.highlight - Whether the value is highlighted.
 * @param {function} props.close - Function to close the overlay.
 */
export default function KeypadOverlay({
  visible,
  position,
  value,
  onKey,
  highlight,
  close,
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        // Removed backdropFilter to remove blurred background effect
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
          onKey={onKey}
          highlight={highlight}
        />
      </div>
    </div>
  );
}
