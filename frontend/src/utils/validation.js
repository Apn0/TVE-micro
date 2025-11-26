// Common validation helpers that need to stay consistent across the UI.

export const SETPOINT_LIMITS = {
  min: 0,
  max: 450,
};

/**
 * Validate and clamp a setpoint coming from keypad/string input.
 * Returns a finite number (one decimal place) or null when invalid.
 */
export function validateSetpoint(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;

  const clamped = Math.min(Math.max(parsed, SETPOINT_LIMITS.min), SETPOINT_LIMITS.max);
  return Number(clamped.toFixed(1));
}

