# INTAREMA TVEmicro - Hardware Wiring Map
Generated based on Software Version V12 (Configurable I/O)

## 1. Raspberry Pi GPIO Header (BCM Numbering)
The software uses **BCM** numbering, not Board numbering.

| Component | Function | GPIO (BCM) | Physical Pin (Approx) | Type |
| :--- | :--- | :--- | :--- | :--- |
| **SSR 1** | Heater Zone 1 (MICA) | **17** | Pin 11 | Output (PWM) |
| **SSR 2** | Heater Zone 2 (Nozzle) | **27** | Pin 13 | Output (PWM) |
| **SSR 3** | Motor Cooling Fan | **22** | Pin 15 | Output (On/Off) |
| **SSR 4** | Filament Water Pump | **23** | Pin 16 | Output (On/Off) |
| **DM556** | Alarm Signal (ALM+) | **16** | Pin 36 | Input (Pull-Up) |
| **DM556** | Step Pulse (PUL+) | **5** | Pin 29 | Output (Freq) |
| **DM556** | Direction (DIR+) | **6** | Pin 31 | Output (Logic) |
| **TMC2209** | Step Pulse (STEP) | **13** | Pin 33 | Output (Freq) |
| **TMC2209** | Direction (DIR) | **19** | Pin 35 | Output (Logic) |

*> Note: Connect all Driver/SSR Ground pins to Pi GND.*
*> Note: Connect DM556 ALM- to Pi GND.*

## 2. Thermistors (Analog)
*Requires ADC (e.g., MCP3008) or MAX6675 Modules (SPI).*
*Current software simulates these values in 'hardware.py'.*

| Sensor | Location | Variable Name |
| :--- | :--- | :--- |
| **T1** | Feed Throat | 	emp_t1_feed |
| **T2** | Mid-Barrel (Zone 1) | 	emp_t2_mid |
| **T3** | Nozzle (Zone 2) | 	emp_t3_nozzle |
| **T_Case** | NEMA23 Housing | 	emp_motor |

## 3. Changing Assignments
You do not need to edit code to change these pins.
1. Go to the **SETTINGS** tab in the Interface.
2. Edit the **GPIO Configuration**.
3. Click **SAVE SYSTEM CONFIG**.
4. Restart the Backend (python app.py).
