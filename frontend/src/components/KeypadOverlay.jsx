// file: src/components/KeypadOverlay.jsx
import React from "react";
import Keypad from "./Keypad";

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
