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
 *   - handleKeyPress (function): Main handler for keypad interactions.
 *   - isFirstPress (boolean): Whether the user hasn't typed anything yet since opening.
 */
export default function useKeypad() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 400, y: 400 });
  const [value, setValue] = useState("");
  const [callback, setCallback] = useState(() => () => {});
  const [isFirstPress, setIsFirstPress] = useState(true);

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
    setIsFirstPress(true);
    setCallback(() => cb);
    setVisible(true);
  };

  const closeKeypad = () => setVisible(false);

  const submit = (val) => {
    setVisible(false);
    callback(val);
  };

  const handleKeyPress = (key) => {
    if (key === "ESC") {
      closeKeypad();
      return;
    }
    if (key === "↵") {
      submit(value);
      return;
    }
    if (key === "Del") {
      if (isFirstPress) {
        setValue("");
        setIsFirstPress(false);
      } else {
        setValue((prev) => prev.slice(0, -1));
      }
      return;
    }
    if (key === "Ins") return;

    // Numbers, decimal point, negative sign
    if (isFirstPress) {
      // If dot is pressed first, prefix with 0 for better UX, or just set it.
      // E.g. "0."
      if (key === ".") {
        setValue("0.");
      } else {
        setValue(key);
      }
      setIsFirstPress(false);
    } else {
      setValue((prev) => prev + key);
    }
  };

  return {
    visible,
    position,
    value,
    setValue,
    openKeypad,
    closeKeypad,
    submit,
    handleKeyPress,
    isFirstPress,
  };
}
