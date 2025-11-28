// file: src/hooks/useKeypad.js
import { useState } from "react";

/**
 * Custom hook to manage the state and visibility of the global keypad.
 *
 * @returns {object} An object containing:
 *   - visible (boolean): Whether the keypad is currently shown.
 *   - position (object): {x, y} coordinates for the keypad.
 *   - value (string): The current input value in the keypad.
 *   - setValue (function): Function to update the keypad value.
 *   - openKeypad (function): Function to open the keypad at a specific location.
 *       Args:
 *         initial (string): Initial value to display.
 *         rect (DOMRect): Bounding rectangle of the trigger element, used for positioning.
 *         cb (function): Callback function to execute when "Enter" is pressed.
 *   - closeKeypad (function): Function to close the keypad without submitting.
 *   - submit (function): Function to submit the current value and close the keypad.
 */
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
