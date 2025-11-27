# INTAREMA TVEmicro - Hardware Wiring Map
Generated based on Software Version V12 (Configurable I/O)

## 1. PWM SSR Hat (I2C)
The SSR board is driven over I2C (PCA9685 at address **0x40**, bus **1**). Channel numbering below is `CHx (PCA index)`.

| Channel | Function | PWM Name | Notes |
| :--- | :--- | :--- | :--- |
| **CH1 (0)** | Heater Zone 1 (Z1) | `z1` | SSR output via I2C |
| **CH2 (1)** | Heater Zone 2 (Z2) | `z2` | SSR output via I2C |
| **CH3 (2)** | Motor Cooling Fan | `fan` | Optional PWM duty (otherwise relay) |
| **CH4 (3)** | Nozzle Fan | `fan_nozzle` | Optional PWM duty |
| **CH5 (4)** | Filament Water Pump | `pump` | Optional PWM duty (otherwise relay) |
| **CH6 (5)** | Status LED | `led_status` | Optional PWM brightness |

## 2. Raspberry Pi GPIO Header (BCM Numbering)
The software uses **BCM** numbering, not Board numbering. GPIO mappings cover buttons and steppers. Fan/pump pins remain for relay fallback if PWM is unavailable.

| Component | Function | GPIO (BCM) | Physical Pin (Approx) | Type |
| :--- | :--- | :--- | :--- | :--- |
| **SSR 3 (Fallback)** | Motor Cooling Fan | **22** | Pin 15 | Output (On/Off) |
| **SSR 4 (Fallback)** | Filament Water Pump | **23** | Pin 16 | Output (On/Off) |
| **DM556** | Step Pulse (PUL+) | **5** | Pin 29 | Output (Freq) |
| **DM556** | Direction (DIR+) | **6** | Pin 31 | Output (Logic) |
| **DM556** | Enable (ENA+) | **12** | Pin 32 | Output (Logic) |
| **TMC2209** | Step Pulse (STEP) | **13** | Pin 33 | Output (Freq) |
| **TMC2209** | Direction (DIR) | **19** | Pin 35 | Output (Logic) |
| **TMC2209** | Enable (EN) | **26** | Pin 37 | Output (Logic) |

*> Note: Connect all Driver/SSR Ground pins to Pi GND.*
*DM556 ALM+/ALM- indicators are only visible on the driver itself; no alarm signal is routed back to the Pi.*

## 2. Thermistors (Analog)
*Requires ADC (e.g., MCP3008) or MAX6675 Modules (SPI).*
*Current software simulates these values in 'hardware.py'.*

| Sensor | Location | Variable Name |
| :--- | :--- | :--- |
| **T1** | Feed Throat |        emp_t1_feed |
| **T2** | Mid-Barrel (Zone 1) |        emp_t2_mid |
| **T3** | NEMA23 Housing |         emp_motor |
| **T_Case** | Nozzle (Zone 2) |    emp_t3_nozzle |

## 3. Changing Assignments
You do not need to edit code to change these pins.
1. Go to the **SETTINGS** tab in the Interface.
2. Edit the **GPIO Configuration**.
3. Click **SAVE SYSTEM CONFIG**.
4. Restart the Backend (python app.py).
