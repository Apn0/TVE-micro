// file: frontend/src/App.jsx
import React, { useState, useEffect } from 'react';

// --- STYLES ---
const styles = {
    layout: { display: 'flex', height: '100vh', background: '#121212', fontFamily: 'Segoe UI, sans-serif', position: 'relative' },
    sidebar: { width: '200px', background: '#1e1e1e', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' },
    content: { flex: 1, padding: '30px', overflowY: 'auto' },
    navBtn: (active) => ({
        padding: '20px', background: active ? '#3498db' : 'transparent',
        color: active ? 'white' : '#aaa', border: 'none', textAlign: 'left',
        cursor: 'pointer', fontSize: '1.1em', fontWeight: 'bold',
        borderBottom: '1px solid #333'
    }),
    panel: { background: '#1e1e1e', borderRadius: '8px', padding: '20px', marginBottom: '20px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    label: { color: '#aaa', marginBottom: '5px', display: 'block', fontSize: '0.9em' },
    value: { fontSize: '1.4em', fontWeight: 'bold', color: 'white' },
    small: { fontSize: '0.8em', color: '#888' },
    button: {
        padding: '10px 20px',
        background: '#3498db',
        border: 'none',
        borderRadius: '4px',
        color: 'white',
        cursor: 'pointer',
        fontWeight: 'bold',
        marginRight: '10px'
    },
    buttonDanger: {
        padding: '10px 20px',
        background: '#e74c3c',
        border: 'none',
        borderRadius: '4px',
        color: 'white',
        cursor: 'pointer',
        fontWeight: 'bold',
        marginRight: '10px'
    },
    buttonSecondary: {
        padding: '8px 14px',
        background: '#2c3e50',
        border: 'none',
        borderRadius: '4px',
        color: '#ecf0f1',
        cursor: 'pointer',
        fontWeight: 'bold',
        marginRight: '8px',
        fontSize: '0.9em'
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #555',
        background: '#000',
        color: 'white',
        width: '100%',
        boxSizing: 'border-box'
    },
    slider: {
        width: '100%'
    },
    badge: (color) => ({
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '999px',
        background: color,
        color: 'white',
        fontSize: '0.8em',
        fontWeight: 'bold',
        marginLeft: '8px'
    }),
    statusBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#111',
        borderTop: '1px solid #333',
        padding: '6px 16px',
        fontSize: '0.8em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#aaa'
    },
    ioGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px'
    },
    ioBox: (active) => ({
        borderRadius: '6px',
        padding: '10px',
        background: active ? '#27ae60' : '#2c3e50',
        color: 'white',
        textAlign: 'center',
        cursor: 'pointer',
        border: active ? '1px solid #2ecc71' : '1px solid #34495e'
    })
};

// --- HELPER COMPONENTS ---
function Nav({ current, setView }) {
    const tabs = [
        { id: 'HOME', label: 'Dashboard' },
        { id: 'ENGINE', label: 'Main Motor' },
        { id: 'HEATERS', label: 'Heaters' },
        { id: 'I/O TEST', label: 'I/O Test' },
        { id: 'SETTINGS', label: 'Settings' }
    ];
    return (
        <div style={styles.sidebar}>
            {tabs.map(t => (
                <button
                    key={t.id}
                    style={styles.navBtn(current === t.id)}
                    onClick={() => setView(t.id)}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

function StatusBadge({ status }) {
    let color = '#7f8c8d';
    if (status === 'READY') color = '#27ae60';
    if (status === 'ALARM') color = '#e74c3c';
    if (status === 'RUNNING') color = '#3498db';
    return <span style={styles.badge(color)}>{status}</span>;
}

function ModeBadge({ mode }) {
    return (
        <span style={styles.badge(mode === 'AUTO' ? '#9b59b6' : '#f39c12')}>
            {mode}
        </span>
    );
}

// --- HOME SCREEN ---
function HomeScreen({ data, sendCmd }) {
    const temps = data.state?.temps || {};
    const motors = data.state?.motors || {};
    const relays = data.state?.relays || {};
    const status = data.state?.status || 'READY';
    const mode = data.state?.mode || 'AUTO';

    const t1 = temps.t1 ?? null;
    const t2 = temps.t2 ?? null;
    const t3 = temps.t3 ?? null;
    const tm = temps.motor ?? null;

    const anyAlarm = status === 'ALARM';

    return (
        <div>
            <div style={styles.panel}>
                <h2>
                    System overview <StatusBadge status={status} /> <ModeBadge mode={mode} />
                </h2>
                <p style={styles.small}>
                    Live snapshot of the extruder. Use the tabs on the left for detailed tuning.
                </p>

                <div style={styles.grid2}>
                    <div>
                        <h3>Temperatures</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <TempBox label="Zone 1" value={t1} />
                            <TempBox label="Zone 2" value={t2} />
                            <TempBox label="Nozzle" value={t3} />
                            <TempBox label="Motor" value={tm} />
                        </div>
                    </div>
                    <div>
                        <h3>Motors</h3>
                        <MotorBox label="Main screw" rpm={motors.main} />
                        <MotorBox label="Feeder" rpm={motors.feed} />
                        <div style={{ marginTop: '15px' }}>
                            <button
                                style={styles.button}
                                onClick={() => sendCmd('SET_MODE', { mode: mode === 'AUTO' ? 'MANUAL' : 'AUTO' })}
                            >
                                Toggle to {mode === 'AUTO' ? 'MANUAL' : 'AUTO'}
                            </button>
                            <button
                                style={styles.buttonDanger}
                                onClick={() => sendCmd('EMERGENCY_STOP')}
                            >
                                EMERGENCY STOP
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div style={styles.panel}>
                <h3>Auxiliary</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <RelayChip
                        label="Cooling fan"
                        active={relays.fan}
                        onClick={() => sendCmd('SET_RELAY', { relay: 'fan', state: !relays.fan })}
                    />
                    <RelayChip
                        label="Pump"
                        active={relays.pump}
                        onClick={() => sendCmd('SET_RELAY', { relay: 'pump', state: !relays.pump })}
                    />
                </div>
            </div>

            {anyAlarm && (
                <div style={{ ...styles.panel, border: '1px solid #e74c3c' }}>
                    <h3>Alarm</h3>
                    <p style={{ color: '#e74c3c' }}>{data.state?.alarm_msg || 'Unknown alarm.'}</p>
                    <button
                        style={styles.button}
                        onClick={() => sendCmd('CLEAR_ALARM')}
                    >
                        Clear alarm
                    </button>
                </div>
            )}
        </div>
    );
}

function TempBox({ label, value }) {
    const isValid = value !== null && value !== undefined;
    const color = !isValid
        ? '#7f8c8d'
        : value > 250
            ? '#e74c3c'
            : value > 210
                ? '#f39c12'
                : '#2ecc71';
    return (
        <div style={{ background: '#111', borderRadius: '6px', padding: '10px' }}>
            <div style={styles.label}>{label}</div>
            <div style={{ ...styles.value, color: color }}>
                {isValid ? value.toFixed(1) + ' °C' : '--.- °C'}
            </div>
        </div>
    );
}

function MotorBox({ label, rpm }) {
    const v = rpm ?? 0;
    return (
        <div style={{ background: '#111', borderRadius: '6px', padding: '10px', marginBottom: '8px' }}>
            <div style={styles.label}>{label}</div>
            <div style={styles.value}>{v.toFixed(1)} RPM</div>
        </div>
    );
}

function RelayChip({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '8px 16px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                background: active ? '#2ecc71' : '#2c3e50',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.9em'
            }}
        >
            {label}: {active ? 'ON' : 'OFF'}
        </button>
    );
}

// --- ENGINE SCREEN ---
function EngineScreen({ data, sendCmd }) {
    const motors = data.state?.motors || {};
    const [mainRpm, setMainRpm] = useState(motors.main ?? 0);
    const [feedRpm, setFeedRpm] = useState(motors.feed ?? 0);

    useEffect(() => {
        setMainRpm(motors.main ?? 0);
        setFeedRpm(motors.feed ?? 0);
    }, [motors.main, motors.feed]);

    const sendMain = (rpm) => {
        setMainRpm(rpm);
        sendCmd('SET_MOTOR', { motor: 'main', rpm });
    };

    const sendFeed = (rpm) => {
        setFeedRpm(rpm);
        sendCmd('SET_MOTOR', { motor: 'feed', rpm });
    };

    return (
        <div style={styles.panel}>
            <h2>Main motor (NEMA23 + DM556)</h2>
            <p style={styles.small}>
                Control the main screw and feeder speed. Actual RPM is derived from driver settings and step frequency.
            </p>

            <div style={styles.grid2}>
                <div>
                    <h3>Main screw</h3>
                    <label style={styles.label}>Target RPM</label>
                    <input
                        type="range"
                        min="0"
                        max="120"
                        step="1"
                        value={mainRpm}
                        onChange={(e) => sendMain(parseFloat(e.target.value))}
                        style={styles.slider}
                    />
                    <div style={styles.value}>{mainRpm.toFixed(0)} RPM</div>
                </div>

                <div>
                    <h3>Feeder</h3>
                    <label style={styles.label}>Target RPM</label>
                    <input
                        type="range"
                        min="0"
                        max="60"
                        step="1"
                        value={feedRpm}
                        onChange={(e) => sendFeed(parseFloat(e.target.value))}
                        style={styles.slider}
                    />
                    <div style={styles.value}>{feedRpm.toFixed(0)} RPM</div>
                </div>
            </div>

            <div style={{ marginTop: '20px' }}>
                <button style={styles.buttonSecondary} onClick={() => sendMain(0)}>Stop main</button>
                <button style={styles.buttonSecondary} onClick={() => sendFeed(0)}>Stop feeder</button>
            </div>
        </div>
    );
}

// --- HEATER SCREEN ---
function HeaterScreen({ data, sendCmd }) {
    const temps = data.state?.temps || {};
    const [targetZ1, setTargetZ1] = useState(data.state?.target_z1 ?? 0);
    const [targetZ2, setTargetZ2] = useState(data.state?.target_z2 ?? 0);

    useEffect(() => {
        setTargetZ1(data.state?.target_z1 ?? 0);
        setTargetZ2(data.state?.target_z2 ?? 0);
    }, [data.state?.target_z1, data.state?.target_z2]);

    const applyTargets = () => {
        sendCmd('SET_TARGET', { z1: targetZ1, z2: targetZ2 });
    };

    return (
        <div style={styles.panel}>
            <h2>Mica heater zones</h2>
            <p style={styles.small}>
                Set the target temperature for each zone. PID control will eventually drive SSR duty.
            </p>
            <div style={styles.grid2}>
                <HeaterZone
                    label="Zone 1"
                    temp={temps.t1}
                    target={targetZ1}
                    onChange={setTargetZ1}
                />
                <HeaterZone
                    label="Zone 2"
                    temp={temps.t2}
                    target={targetZ2}
                    onChange={setTargetZ2}
                />
            </div>

            <button style={{ ...styles.button, marginTop: '20px' }} onClick={applyTargets}>
                Apply targets
            </button>
        </div>
    );
}

function HeaterZone({ label, temp, target, onChange }) {
    const v = temp ?? null;
    let color = '#7f8c8d';
    if (v !== null) {
        if (v > target + 15) color = '#e74c3c';
        else if (v < target - 15) color = '#f39c12';
        else color = '#2ecc71';
    }

    return (
        <div style={{ background: '#111', borderRadius: '6px', padding: '12px' }}>
            <div style={styles.label}>{label}</div>
            <div style={{ ...styles.value, color }}>
                {v !== null ? v.toFixed(1) + ' °C' : '--.- °C'}
            </div>
            <label style={{ ...styles.label, marginTop: '10px' }}>Target (°C)</label>
            <input
                type="number"
                style={styles.input}
                value={target}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            />
        </div>
    );
}

// --- I/O TEST SCREEN ---
function TestScreen({ data, sendCmd }) {
    const relays = data.state?.relays || {};
    const motors = data.state?.motors || {};
    const status = data.state?.status || 'READY';

    const toggleRelay = (name) => {
        const current = relays[name];
        sendCmd('SET_RELAY', { relay: name, state: !current });
    };

    const nudgeMotor = (motor, delta) => {
        const base = motors[motor] ?? 0;
        const target = base + delta;
        sendCmd('SET_MOTOR', { motor, rpm: target });
    };

    return (
        <div style={styles.panel}>
            <h2>I/O Test</h2>
            <p style={styles.small}>
                Quick test panel for outputs. Keep an eye on the machine while toggling.
            </p>

            <div style={styles.ioGrid}>
                <div
                    style={styles.ioBox(relays.fan)}
                    onClick={() => toggleRelay('fan')}
                >
                    FAN<br />
                    <span style={styles.small}>{relays.fan ? 'ON' : 'OFF'}</span>
                </div>
                <div
                    style={styles.ioBox(relays.pump)}
                    onClick={() => toggleRelay('pump')}
                >
                    PUMP<br />
                    <span style={styles.small}>{relays.pump ? 'ON' : 'OFF'}</span>
                </div>
                <div
                    style={styles.ioBox(false)}
                    onClick={() => sendCmd('EMERGENCY_STOP')}
                >
                    <span style={{ color: '#ffdd57', fontWeight: 'bold' }}>STOP</span>
                    <br />
                    <span style={styles.small}>Emergency</span>
                </div>
            </div>

            <div style={{ marginTop: '20px' }}>
                <h3>Motor nudge</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        style={styles.buttonSecondary}
                        onClick={() => nudgeMotor('main', 5)}
                    >
                        Main +5 RPM
                    </button>
                    <button
                        style={styles.buttonSecondary}
                        onClick={() => nudgeMotor('main', -5)}
                    >
                        Main -5 RPM
                    </button>
                    <button
                        style={styles.buttonSecondary}
                        onClick={() => nudgeMotor('feed', 2)}
                    >
                        Feeder +2 RPM
                    </button>
                    <button
                        style={styles.buttonSecondary}
                        onClick={() => nudgeMotor('feed', -2)}
                    >
                        Feeder -2 RPM
                    </button>
                </div>
            </div>

            <div style={{ marginTop: '20px' }}>
                <strong>Status:</strong> <StatusBadge status={status} />
            </div>
        </div>
    );
}

// --- DM556 LOGIC (V18 - Real Matrix) ---
// ON = true, OFF = false
const DM556_TABLE = {
    current: {
        1.4: [true, true, true],   // ON ON ON
        2.1: [false, true, true],  // OFF ON ON
        2.7: [true, false, true],  // ON OFF ON
        3.2: [false, false, true], // OFF OFF ON
        3.8: [true, true, false],  // ON ON OFF
        4.3: [false, true, false], // OFF ON OFF
        4.9: [true, false, false], // ON OFF OFF
        5.6: [false, false, false] // OFF OFF OFF
    },
    steps: {
        400:   [false, true, true, true],    // OFF ON ON ON
        800:   [true, false, true, true],    // ON OFF ON ON
        1600:  [false, false, true, true],   // OFF OFF ON ON
        3200:  [true, true, false, true],    // ON ON OFF ON
        6400:  [false, true, false, true],   // OFF ON OFF ON
        12800: [true, false, false, true],   // ON OFF OFF ON
        25600: [false, false, false, true],  // OFF OFF OFF ON
        1000:  [true, true, true, false],    // ON ON ON OFF
        2000:  [false, true, true, false],   // OFF ON ON OFF
        4000:  [true, false, true, false],   // ON OFF ON OFF
        5000:  [false, false, true, false],  // OFF OFF ON OFF
        8000:  [true, true, false, false],   // ON ON OFF OFF
        10000: [false, true, false, false],  // OFF ON OFF OFF
        20000: [true, false, false, false],  // ON OFF OFF OFF
        25000: [false, false, false, false]  // OFF OFF OFF OFF
    }
};

function DipSwitchBlock({ switches }) {
    return (
        <div style={{
            background: '#c0392b',
            padding: '10px',
            borderRadius: 4,
            display: 'inline-flex',
            gap: 5,
            border: '2px solid #fff',
            marginTop: '10px'
        }}>
            {switches.map((s, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ color: 'white', fontSize: '0.7em', textAlign: 'center', marginBottom: 2 }}>
                        {i + 1}
                    </div>
                    <div style={{
                        width: 20, height: 40,
                        background: '#ecf0f1',
                        position: 'relative',
                        borderRadius: 2
                    }}>
                        <div style={{
                            width: 16,
                            height: 16,
                            background: '#2c3e50',
                            position: 'absolute',
                            left: 2,
                            top: s ? 22 : 2,
                            transition: 'top 0.2s',
                            borderRadius: 2
                        }} />
                    </div>
                    <div style={{ color: 'white', fontSize: '0.7em', textAlign: 'center', marginTop: 2 }}>
                        {s ? 'ON' : 'OFF'}
                    </div>
                </div>
            ))}
        </div>
    );
}

// --- SENSOR / ADC SETTINGS SCREEN (migrated from components/SettingsScreen.jsx) ---
const LOGICAL_SENSORS = ["t1", "t2", "t3", "motor"];
const ADC_CHANNELS = [0, 1, 2, 3];

function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [savingTemp, setSavingTemp] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [savingCal, setSavingCal] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [tempSettings, setTempSettings] = useState({
    poll_interval: 0.25,
    avg_window: 2.0,
    use_average: true,
    decimals_default: 1,
  });

  const [mapping, setMapping] = useState({
    t1: null,
    t2: null,
    t3: null,
    motor: null,
  });

  // sensorCal[channel] = { r_fixed, r_25, beta, v_ref, wiring, decimals, cal_points_raw }
  const [sensorCal, setSensorCal] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setLoading(true);
      setError("");
      setMessage("");
      try {
        const res = await fetch("/api/status");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        const cfg = data.config || {};

        // temp settings
        const ts = cfg.temp_settings || {};
        setTempSettings({
          poll_interval: Number(ts.poll_interval ?? 0.25),
          avg_window: Number(ts.avg_window ?? 2.0),
          use_average:
            ts.use_average === undefined ? true : Boolean(ts.use_average),
          decimals_default: Number(ts.decimals_default ?? 1),
        });

        // sensors / mapping / calibration
        const sensors = cfg.sensors || {};
        const newMap = { t1: null, t2: null, t3: null, motor: null };
        const newCal = {};

        ADC_CHANNELS.forEach((ch) => {
          const key = String(ch);
          const sc = sensors[key] || {};
          const logical = sc.logical || null;

          if (logical && LOGICAL_SENSORS.includes(logical)) {
            newMap[logical] = ch;
          }

          newCal[ch] = {
            r_fixed: sc.r_fixed ?? 100000,
            r_25: sc.r_25 ?? 100000,
            beta: sc.beta ?? 3950,
            v_ref: sc.v_ref ?? 3.3,
            wiring: sc.wiring ?? "ntc_to_gnd",
            decimals: sc.decimals ?? 1,
            cal_points_raw:
              sc.cal_points && sc.cal_points.length > 0
                ? JSON.stringify(sc.cal_points, null, 2)
                : "",
          };
        });

        setMapping(newMap);
        setSensorCal(newCal);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e && e.message ? e.message : String(e);
        setError("Failed to load /api/status: " + msg);
        setLoading(false);
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleTempChange(field, value) {
    setTempSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleMappingChange(logical, value) {
    setMapping((prev) => ({
      ...prev,
      [logical]: value === "" ? null : Number(value),
    }));
  }

  function handleCalChange(channel, field, value) {
    setSensorCal((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [field]:
          field === "wiring" || field === "cal_points_raw"
            ? value
            : value === ""
            ? ""
            : Number(value),
      },
    }));
  }

  async function saveTempSettings() {
    setSavingTemp(true);
    setError("");
    setMessage("");
    try {
      const body = {
        command: "SET_TEMP_SETTINGS",
        value: {
          params: {
            poll_interval: Number(tempSettings.poll_interval),
            avg_window: Number(tempSettings.avg_window),
            use_average: Boolean(tempSettings.use_average),
            decimals_default: Number(tempSettings.decimals_default),
          },
        },
      };
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "SET_TEMP_SETTINGS failed");
      }
      setMessage("Temperature settings saved.");
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      setError("Failed to save temperature settings: " + msg);
    } finally {
      setSavingTemp(false);
    }
  }

  async function saveMapping() {
    setSavingMap(true);
    setError("");
    setMessage("");
    try {
      const body = {
        command: "SET_SENSOR_MAPPING",
        value: {
          mapping: {
            t1: mapping.t1,
            t2: mapping.t2,
            t3: mapping.t3,
            motor: mapping.motor,
          },
        },
      };
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "SET_SENSOR_MAPPING failed");
      }
      setMessage("Sensor mapping saved.");
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      setError("Failed to save sensor mapping: " + msg);
    } finally {
      setSavingMap(false);
    }
  }

  async function saveCalibrationForChannel(ch) {
    setSavingCal(true);
    setError("");
    setMessage("");
    try {
      const cfg = sensorCal[ch];
      let calPoints = undefined;
      if (cfg.cal_points_raw && cfg.cal_points_raw.trim() !== "") {
        try {
          calPoints = JSON.parse(cfg.cal_points_raw);
        } catch (e) {
          const msgInner = e && e.message ? e.message : String(e);
          throw new Error(
            `Channel ${ch}: cal_points is not valid JSON: ${msgInner}`
          );
        }
      }

      const params = {
        channel: ch,
        r_fixed: Number(cfg.r_fixed),
        r_25: Number(cfg.r_25),
        beta: Number(cfg.beta),
        v_ref: Number(cfg.v_ref),
        wiring: cfg.wiring,
        decimals: Number(cfg.decimals),
      };
      if (calPoints !== undefined) {
        params.cal_points = calPoints;
      }

      const body = {
        command: "SET_SENSOR_CALIBRATION",
        value: { params },
      };

      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.msg || "SET_SENSOR_CALIBRATION failed");
      }
      setMessage(`Calibration saved for channel ${ch}.`);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      setError("Failed to save calibration: " + msg);
    } finally {
      setSavingCal(false);
    }
  }

  return (
    <div style={styles.panel}>
      <h2>Settings – Sensors &amp; ADC</h2>

      {loading && <div>Loading settings…</div>}
      {error && <div style={{ color: "red", marginBottom: "0.5rem" }}>{error}</div>}
      {message && (
        <div style={{ color: "lime", marginBottom: "0.5rem" }}>{message}</div>
      )}

      {/* Temperature loop */}
      <section style={{ marginBottom: "1rem" }}>
        <h3>Temperature loop</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            rowGap: "0.5rem",
            columnGap: "0.75rem",
            maxWidth: 600,
          }}
        >
          <label>Poll interval (s)</label>
          <input
            type="number"
            step="0.01"
            value={tempSettings.poll_interval}
            onChange={(e) =>
              handleTempChange("poll_interval", Number(e.target.value))
            }
          />

          <label>Averaging window (s)</label>
          <input
            type="number"
            step="0.1"
            value={tempSettings.avg_window}
            onChange={(e) =>
              handleTempChange("avg_window", Number(e.target.value))
            }
          />

          <label>Use averaging</label>
          <input
            type="checkbox"
            checked={tempSettings.use_average}
            onChange={(e) =>
              handleTempChange("use_average", e.target.checked)
            }
          />

          <label>Default decimals</label>
          <input
            type="number"
            step="1"
            value={tempSettings.decimals_default}
            onChange={(e) =>
              handleTempChange("decimals_default", Number(e.target.value))
            }
          />
        </div>

        <button
          onClick={saveTempSettings}
          disabled={savingTemp}
          style={{
            marginTop: "0.75rem",
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: savingTemp ? "#555" : "#3498db",
            color: "white",
            fontWeight: "bold",
            cursor: savingTemp ? "default" : "pointer",
          }}
        >
          {savingTemp ? "Saving…" : "Save temperature settings"}
        </button>
      </section>

      {/* Mapping */}
      <section style={{ marginBottom: "1rem" }}>
        <h3>Sensor mapping (ADS ? logical)</h3>
        <table
          style={{
            width: "100%",
            maxWidth: 500,
            borderCollapse: "collapse",
            marginBottom: "0.5rem",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  borderBottom: "1px solid #555",
                  textAlign: "left",
                  padding: "4px 6px",
                }}
              >
                Logical
              </th>
              <th
                style={{
                  borderBottom: "1px solid #555",
                  textAlign: "left",
                  padding: "4px 6px",
                }}
              >
                ADS channel
              </th>
            </tr>
          </thead>
          <tbody>
            {LOGICAL_SENSORS.map((logical) => (
              <tr key={logical}>
                <td
                  style={{
                    borderBottom: "1px solid #333",
                    padding: "4px 6px",
                  }}
                >
                  {logical}
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #333",
                    padding: "4px 6px",
                  }}
                >
                  <select
                    value={
                      mapping[logical] === null ? "" : String(mapping[logical])
                    }
                    onChange={(e) =>
                      handleMappingChange(logical, e.target.value)
                    }
                  >
                    <option value="">(none)</option>
                    {ADC_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={saveMapping}
          disabled={savingMap}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: savingMap ? "#555" : "#3498db",
            color: "white",
            fontWeight: "bold",
            cursor: savingMap ? "default" : "pointer",
          }}
        >
          {savingMap ? "Saving…" : "Save mapping"}
        </button>
      </section>

      {/* Calibration per channel */}
      <section>
        <h3>Sensor calibration</h3>
        <p style={{ fontSize: "0.9rem", color: "#aaa" }}>
          Enter 2+ calibration points as JSON:
          <code>{'[{"raw_temp": 200, "true_temp": 210}, ...]'}</code>
        </p>
        {ADC_CHANNELS.map((ch) => {
          const cfg = sensorCal[ch];
          if (!cfg) {
            return (
              <div key={ch} style={{ marginTop: "0.75rem" }}>
                <strong>Channel {ch}</strong> – no config loaded
              </div>
            );
          }
          return (
            <div
              key={ch}
              style={{
                marginTop: "0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid #333",
              }}
            >
              <strong>Channel {ch}</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr",
                  rowGap: "0.3rem",
                  columnGap: "0.5rem",
                  marginTop: "0.4rem",
                }}
              >
                <label>R_fixed (O)</label>
                <input
                  type="number"
                  value={cfg.r_fixed}
                  onChange={(e) =>
                    handleCalChange(ch, "r_fixed", e.target.value)
                  }
                />

                <label>R_25 (O)</label>
                <input
                  type="number"
                  value={cfg.r_25}
                  onChange={(e) =>
                    handleCalChange(ch, "r_25", e.target.value)
                  }
                />

                <label>ß (K)</label>
                <input
                  type="number"
                  value={cfg.beta}
                  onChange={(e) =>
                    handleCalChange(ch, "beta", e.target.value)
                  }
                />

                <label>V_ref (V)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cfg.v_ref}
                  onChange={(e) =>
                    handleCalChange(ch, "v_ref", e.target.value)
                  }
                />

                <label>Wiring</label>
                <select
                  value={cfg.wiring}
                  onChange={(e) =>
                    handleCalChange(ch, "wiring", e.target.value)
                  }
                >
                  <option value="ntc_to_gnd">ntc_to_gnd</option>
                  <option value="ntc_to_vref">ntc_to_vref</option>
                </select>

                <label>Decimals</label>
                <input
                  type="number"
                  value={cfg.decimals}
                  onChange={(e) =>
                    handleCalChange(ch, "decimals", e.target.value)
                  }
                />

                <label>Calibration points (JSON)</label>
                <textarea
                  rows={4}
                  value={cfg.cal_points_raw}
                  onChange={(e) =>
                    handleCalChange(ch, "cal_points_raw", e.target.value)
                  }
                  style={{ fontFamily: "monospace", fontSize: "0.85em" }}
                />
              </div>
              <button
                onClick={() => saveCalibrationForChannel(ch)}
                disabled={savingCal}
                style={{
                  marginTop: "0.5rem",
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: savingCal ? "#555" : "#3498db",
                  color: "white",
                  fontWeight: "bold",
                  cursor: savingCal ? "default" : "pointer",
                }}
              >
                {savingCal ? "Saving…" : `Save channel ${ch}`}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// --- APP ROOT ---
function App() {
  const [view, setView] = useState('HOME');
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e && e.message ? e.message : String(e);
          setError("Lost connection to backend: " + msg);
        }
      } finally {
        if (!cancelled) {
          setTimeout(poll, 1000);
        }
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  const sendCmd = async (command, value = {}) => {
    setMessage("");
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, value })
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.msg || 'Command failed');
      }
      setMessage(command + ' OK');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      setError("Command error: " + msg);
    }
  };

  return (
    <div style={styles.layout}>
      <Nav current={view} setView={setView} />

      {data && (
        <div style={styles.content}>
          {view === 'HOME' && <HomeScreen data={data} sendCmd={sendCmd} />}
          {view === 'ENGINE' && <EngineScreen data={data} sendCmd={sendCmd} />}
          {view === 'HEATERS' && <HeaterScreen data={data} sendCmd={sendCmd} />}
          {view === 'I/O TEST' && <TestScreen data={data} sendCmd={sendCmd} />}
          {view === 'SETTINGS' && <SettingsScreen />}
        </div>
      )}

      <div style={styles.statusBar}>
        <div>
          {error && <span style={{ color: '#e74c3c' }}>{error}</span>}
          {!error && message && <span style={{ color: '#2ecc71' }}>{message}</span>}
          {!error && !message && <span>Backend: {data ? 'connected' : 'connecting…'}</span>}
        </div>
        <div>
          <span style={styles.small}>Mini Hackstruder HMI · v0.1</span>
        </div>
      </div>
    </div>
  );
}

export default App;

