// Common validation helpers that need to stay consistent across the UI.

export const SETPOINT_LIMITS = {
  min: 0,
  max: 450,
};

/**
 * Validate and clamp a setpoint coming from keypad/string input.
 *
 * Ensures the value is a finite number and falls within the defined limits (0-450).
 * Rounds the result to one decimal place.
 *
 * @param {string|number} rawValue - The input value to validate.
 * @returns {number|null} The clamped and formatted number, or null if input is invalid/non-finite.
 */
export function validateSetpoint(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;

  const clamped = Math.min(Math.max(parsed, SETPOINT_LIMITS.min), SETPOINT_LIMITS.max);
  return Number(clamped.toFixed(1));
}
