// file: src/hooks/useKeypad.js
import { useState } from "react";

export default function useKeypad() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 400, y: 400 });
  const [value, setValue] = useState("");
  const [callback, setCallback] = useState(() => () => {});

  const openKeypad = (initial, rect, cb) => {
    let x = rect.right + 20;
    let y = rect.bottom + 20;

    // Keep full keypad on screen
    const maxX = window.innerWidth - 380;
    const maxY = window.innerHeight - 360;

    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;

    setPosition({ x, y });
    setValue(initial);
    setCallback(() => cb);
    setVisible(true);
  };

  const closeKeypad = () => setVisible(false);

  const submit = (val) => {
    setVisible(false);
    callback(val);
  };

  return {
    visible,
    position,
    value,
    setValue,
    openKeypad,
    closeKeypad,
    submit,
  };
}
