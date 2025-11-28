// Shared DM556 driver switch matrix for NEMA23 motor control

/**
 * Switch configuration table for the DM556 stepper driver.
 * Maps target Current (Amps) and Microsteps to the required DIP switch positions.
 * true = ON, false = OFF.
 */
export const DM556_TABLE = {
  // Switch positions for Peak Current (SW1, SW2, SW3)
  current: {
    1.4: [true, true, true],
    2.1: [false, true, true],
    2.7: [true, false, true],
    3.2: [false, false, true],
    3.8: [true, true, false],
    4.3: [false, true, false],
    4.9: [true, false, false],
    5.6: [false, false, false],
  },
  // Switch positions for Microstepping resolution (SW5, SW6, SW7, SW8)
  steps: {
    400: [false, true, true, true],
    800: [true, false, true, true],
    1600: [false, false, true, true],
    3200: [true, true, false, true],
    6400: [false, true, false, true],
    12800: [true, false, false, true],
    25600: [false, false, false, true],
    1000: [true, true, true, false],
    2000: [false, true, true, false],
    4000: [true, false, true, false],
    5000: [false, false, true, false],
    8000: [true, true, false, false],
    10000: [false, true, false, false],
    20000: [true, false, false, false],
    25000: [false, false, false, false],
  },
};

/**
 * Default configuration values for the DM556 driver.
 */
export const DEFAULT_DM556 = {
  microsteps: 1600,
  current_peak: 3.2,
  idle_half: true,
};
