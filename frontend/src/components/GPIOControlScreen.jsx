// file: frontend/src/components/GPIOControlScreen.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { styles } from '../App';

const MODULE_LIBRARY = [
  {
    type: 'Temperature Sensor (TMP102)',
    role: 'sensor',
    channels: 1,
    defaultSettings: { pollRateSeconds: 1, unit: '°C' },
  },
  {
    type: 'IO Expander (MCP23017)',
    role: 'effector',
    channels: 16,
    defaultSettings: { bankMode: 'sequential', defaultDrive: 'low' },
  },
  {
    type: 'OLED Display (SSD1306)',
    role: 'effector',
    channels: 0,
    defaultSettings: { resolution: '128x64', contrast: 50 },
  },
  {
    type: 'Pressure Sensor (MS5611)',
    role: 'sensor',
    channels: 1,
    defaultSettings: { oversampling: 'x4', filter: 'medium' },
  },
];

const FALLBACK_I2C_BUSES = [
  {
    id: 'i2c-0',
    label: 'I2C-0 (board header)',
    sda: 'GPIO2',
    scl: 'GPIO3',
    speed: '400 kHz',
    lastScan: 'Just now',
    addresses: [0x3c, 0x40],
    modules: [
      {
        address: 0x3c,
        type: 'OLED Display (SSD1306)',
        role: 'effector',
        channels: 0,
        settings: { resolution: '128x64', contrast: 50 },
      },
      {
        address: 0x40,
        type: 'Temperature Sensor (TMP102)',
        role: 'sensor',
        channels: 1,
        settings: { pollRateSeconds: 1, unit: '°C' },
      },
    ],
  },
  {
    id: 'i2c-1',
    label: 'I2C-1 (auxiliary)',
    sda: 'GPIO22',
    scl: 'GPIO23',
    speed: '100 kHz',
    lastScan: '30s ago',
    addresses: [0x20],
    modules: [
      {
        address: 0x20,
        type: 'IO Expander (MCP23017)',
        role: 'effector',
        channels: 16,
        settings: { bankMode: 'sequential', defaultDrive: 'low' },
      },
    ],
  },
];

const FALLBACK_UART_PORTS = [
  {
    id: 'uart-0',
    label: 'UART-0',
    tx: 'GPIO14',
    rx: 'GPIO15',
    usage: 'Console / diagnostics',
    baud: '115200',
  },
  {
    id: 'uart-1',
    label: 'UART-1',
    tx: 'GPIO0',
    rx: 'GPIO1',
    usage: 'Module comms',
    baud: '9600',
  },
];

/**
 * GPIOControlScreen Component.
 *
 * Provides a comprehensive interface for managing the Raspberry Pi's GPIO pins,
 * I2C buses, and UART configurations.
 *
 * Features:
 * - List of all GPIO pins (BCM numbering) with current mode, value, and pull-up/down state.
 * - Ability to change pin mode (IN/OUT), pull resistor, and output value.
 * - Pin naming/labeling for easier identification.
 * - I2C bus visualization, showing detected addresses and assigned modules.
 * - Module assignment for I2C devices from a library of templates.
 * - UART port mapping display.
 */
function GPIOControlScreen() {
  const [pinStatus, setPinStatus] = useState({});
  const [i2cBuses, setI2cBuses] = useState(FALLBACK_I2C_BUSES);
  const [uartPorts, setUartPorts] = useState(FALLBACK_UART_PORTS);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch initial GPIO status
    const fetchGpioStatus = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/gpio');
        const json = await res.json();
        if (json.success) {
          setPinStatus(json.pins || json.status || {});
          setI2cBuses(
            Array.isArray(json.i2c_buses || json.i2c)
              ? json.i2c_buses || json.i2c
              : FALLBACK_I2C_BUSES
          );
          setUartPorts(
            Array.isArray(json.uart || json.uart_ports)
              ? json.uart || json.uart_ports
              : FALLBACK_UART_PORTS
          );
        } else {
          setError(json.msg || 'Failed to fetch GPIO status');
        }
      } catch (e) {
        console.error('Failed to fetch GPIO status:', e);
        setError('Failed to fetch GPIO status');
      } finally {
        setLoading(false);
      }
    };
    fetchGpioStatus();
  }, []);

  const sendGpioCmd = async (command, value) => {
    setError('');
    try {
      const res = await fetch('/api/gpio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, value }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('GPIO command failed:', json.msg);
        setError(json.msg || 'GPIO command failed');
      } else {
        const statusRes = await fetch('/api/gpio');
        const statusJson = await statusRes.json();
        if (statusJson.success) {
          setPinStatus(statusJson.pins || statusJson.status || {});
          setI2cBuses(
            Array.isArray(statusJson.i2c_buses || statusJson.i2c)
              ? statusJson.i2c_buses || statusJson.i2c
              : FALLBACK_I2C_BUSES
          );
          setUartPorts(
            Array.isArray(statusJson.uart || statusJson.uart_ports)
              ? statusJson.uart || statusJson.uart_ports
              : FALLBACK_UART_PORTS
          );
        } else {
          setError(statusJson.msg || 'Failed to refresh GPIO status');
        }
      }
    } catch (e) {
      console.error('Failed to send GPIO command:', e);
      setError('Failed to send GPIO command');
    }
  };

  const sendControlCmd = async (command, value) => {
    setError('');
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, value }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Control command failed:', json.msg);
        setError(json.msg || 'Control command failed');
      } else {
        // Refresh GPIO status as names might have changed
        const statusRes = await fetch('/api/gpio');
        const statusJson = await statusRes.json();
        if (statusJson.success) {
          setPinStatus(statusJson.pins || statusJson.status || {});
          setI2cBuses(
            Array.isArray(statusJson.i2c_buses || statusJson.i2c)
              ? statusJson.i2c_buses || statusJson.i2c
              : FALLBACK_I2C_BUSES
          );
          setUartPorts(
            Array.isArray(statusJson.uart || statusJson.uart_ports)
              ? statusJson.uart || statusJson.uart_ports
              : FALLBACK_UART_PORTS
          );
        }
      }
    } catch (e) {
      console.error('Failed to send control command:', e);
      setError('Failed to send control command');
    }
  };

  const handlePinModeChange = (pin, mode, pullUpDown) => {
    sendGpioCmd('SET_GPIO_MODE', { pin, mode, pull_up_down: pullUpDown });
  };

  const handlePinValueChange = (pin, value) => {
    sendGpioCmd('SET_GPIO_VALUE', { pin, value: parseInt(value, 10) });
  };

  const sortedPins = useMemo(
    () =>
      Object.entries(pinStatus).sort(
        ([pinA], [pinB]) => parseInt(pinA, 10) - parseInt(pinB, 10)
      ),
    [pinStatus]
  );

  const addressIsAssigned = (bus, address) =>
    bus.modules?.some((m) => m.address === address);

  const handleAssignModule = (busId, address, moduleType) => {
    const moduleDefinition = MODULE_LIBRARY.find((m) => m.type === moduleType);
    if (!moduleDefinition) return;

    setI2cBuses((prev) =>
      prev.map((bus) => {
        if (bus.id !== busId) return bus;
        const newModule = {
          address,
          type: moduleDefinition.type,
          role: moduleDefinition.role,
          channels: moduleDefinition.channels,
          settings: { ...moduleDefinition.defaultSettings },
        };
        return {
          ...bus,
          modules: [...(bus.modules || []), newModule],
        };
      })
    );
  };

  const handleModuleSettingChange = (busId, address, key, value) => {
    setI2cBuses((prev) =>
      prev.map((bus) => {
        if (bus.id !== busId) return bus;
        return {
          ...bus,
          modules: bus.modules?.map((m) =>
            m.address === address
              ? {
                  ...m,
                  settings: { ...m.settings, [key]: value },
                }
              : m
          ),
        };
      })
    );
  };

  const formatAddress = (addr) => `0x${Number(addr).toString(16).padStart(2, '0')}`;

  const setDraftForBus = (busId, key, value) => {
    setAssignmentDrafts((prev) => ({
      ...prev,
      [busId]: { ...prev[busId], [key]: value },
    }));
  };

  const renderModuleSettings = (busId, module) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
      {Object.entries(module.settings || {}).map(([key, value]) => (
        <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={styles.label}>{key}</span>
          <input
            type={typeof value === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) =>
              handleModuleSettingChange(
                busId,
                module.address,
                key,
                typeof value === 'number' ? Number(e.target.value) : e.target.value
              )
            }
            style={{
              background: '#0f141a',
              color: '#ecf0f1',
              border: '1px solid #2c3e50',
              borderRadius: 6,
              padding: '8px 10px',
              outlineColor: '#3498db',
            }}
          />
        </label>
      ))}
    </div>
  );

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>GPIO Control</h2>
      <div style={{ color: '#8c9fb1', marginBottom: 8 }}>
        Pins are shown in <strong>BCM numbering</strong>, not physical header positions
        (e.g., BCM6 is on physical pin 31; physical pin 6 is ground).
      </div>
      <div style={styles.panel}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
              gap: '10px',
              paddingBottom: '8px',
              borderBottom: '1px solid #2c3e50',
              color: '#8c9fb1',
              fontSize: '0.9em',
            }}
          >
            <span>Pin (BCM)</span>
            <span>Assigned Name</span>
            <span>Mode</span>
            <span>Pull-up/down</span>
            <span>Value</span>
          </div>

          {loading && <div style={{ color: '#8c9fb1' }}>Loading GPIO status…</div>}

          {!loading && error && (
            <div
              style={{
                background: '#3c1f1f',
                border: '1px solid #c0392b',
                color: '#e74c3c',
                padding: '10px 12px',
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && sortedPins.length === 0 && (
            <div style={{ color: '#8c9fb1' }}>No GPIO data available.</div>
          )}

          {!loading &&
            !error &&
            sortedPins.map(([pin, status]) => {
              const isInput = status.mode === 'IN';
              const isOutput = status.mode === 'OUT';
              return (
                <div
                  key={pin}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: '#161b22',
                    border: '1px solid #1f2a36',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ color: '#ecf0f1', fontWeight: 'bold' }}>GPIO {pin}</div>

                  <input
                    type="text"
                    key={`${pin}-${status.name || ''}`}
                    defaultValue={status.name || ''}
                    placeholder="Unassigned"
                    onBlur={(e) => {
                      const newName = e.target.value.trim();
                      if (newName !== (status.name || '')) {
                        sendControlCmd('SET_PIN_NAME', {
                          pin: parseInt(pin, 10),
                          name: newName,
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                      }
                    }}
                    style={{
                      background: '#0f141a',
                      color: '#ecf0f1',
                      border: '1px solid #2c3e50',
                      borderRadius: 6,
                      padding: '8px 10px',
                      outlineColor: '#3498db',
                    }}
                  />

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={styles.label}>Mode</span>
                    <select
                      aria-label={`Mode for GPIO ${pin}`}
                      value={status.mode}
                      onChange={(e) =>
                        handlePinModeChange(pin, e.target.value, status.pull_up_down)
                      }
                      style={{
                        background: '#0f141a',
                        color: '#ecf0f1',
                        border: '1px solid #2c3e50',
                        borderRadius: 6,
                        padding: '8px 10px',
                        outlineColor: '#3498db',
                      }}
                    >
                      <option value="IN">IN</option>
                      <option value="OUT">OUT</option>
                    </select>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={styles.label}>Pull-up/down</span>
                    <select
                      aria-label={`Pull-up/down for GPIO ${pin}`}
                      value={status.pull_up_down}
                      onChange={(e) =>
                        handlePinModeChange(pin, status.mode, e.target.value)
                      }
                      disabled={!isInput}
                      style={{
                        background: isInput ? '#0f141a' : '#111',
                        color: isInput ? '#ecf0f1' : '#6c7a89',
                        border: '1px solid #2c3e50',
                        borderRadius: 6,
                        padding: '8px 10px',
                        outlineColor: '#3498db',
                        opacity: isInput ? 1 : 0.6,
                        cursor: isInput ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <option value="up">Up</option>
                      <option value="down">Down</option>
                      <option value="off">Off</option>
                    </select>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={styles.label}>Value</span>
                    {isOutput ? (
                      <select
                        aria-label={`Value for GPIO ${pin}`}
                        value={status.value}
                        onChange={(e) => handlePinValueChange(pin, e.target.value)}
                        style={{
                          background: '#0f141a',
                          color: '#ecf0f1',
                          border: '1px solid #2c3e50',
                          borderRadius: 6,
                          padding: '8px 10px',
                          outlineColor: '#3498db',
                        }}
                      >
                        <option value="0">0</option>
                        <option value="1">1</option>
                      </select>
                    ) : (
                      <div
                        style={{
                          background: '#0f141a',
                          border: '1px solid #2c3e50',
                          borderRadius: 6,
                          padding: '10px 12px',
                          color: '#ecf0f1',
                        }}
                      >
                        {status.value}
                      </div>
                    )}
                  </label>
                </div>
              );
            })}
        </div>
      </div>
      <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
        <div style={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ color: '#ecf0f1', fontSize: '1.1em', fontWeight: 'bold' }}>I2C buses & connected modules</div>
              <div style={{ color: '#8c9fb1' }}>
                SDA/SCL mapping, live scan addresses, module assignment, and per-module settings.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={styles.pill}>SDA ↔️ SCL schematic</div>
              <div style={styles.pill}>Live address map</div>
            </div>
          </div>

          {i2cBuses.map((bus) => {
            const unassigned = (bus.addresses || []).filter((addr) => !addressIsAssigned(bus, addr));
            const draft = assignmentDrafts[bus.id] || {
              address: unassigned[0],
              module: MODULE_LIBRARY[0]?.type,
            };

            return (
              <div
                key={bus.id}
                style={{
                  border: '1px solid #1f2a36',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 12,
                  background: '#0f141a',
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#ecf0f1', fontWeight: 'bold' }}>{bus.label}</div>
                    <div style={{ color: '#8c9fb1' }}>Clock: {bus.speed || '—'} · Last scan: {bus.lastScan || 'n/a'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: '#1b2633', padding: '10px 12px', borderRadius: 8, border: '1px solid #2c3e50', flex: 1 }}>
                      <div style={{ color: '#8c9fb1', fontSize: '0.8em' }}>SDA → Device → SCL</div>
                      <div style={{ color: '#ecf0f1', fontWeight: 'bold', marginTop: 4 }}>
                        {bus.sda} ↔️ {bus.scl}
                      </div>
                    </div>
                    <div style={{ background: '#1b2633', padding: '10px 12px', borderRadius: 8, border: '1px solid #2c3e50' }}>
                      <div style={{ color: '#8c9fb1', fontSize: '0.8em' }}>Detected addresses</div>
                      <div style={{ color: '#ecf0f1', marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(bus.addresses || []).map((addr) => (
                          <span
                            key={addr}
                            style={{
                              background: addressIsAssigned(bus, addr) ? '#2ecc71' : '#34495e',
                              color: '#ecf0f1',
                              padding: '6px 10px',
                              borderRadius: 6,
                              fontWeight: 'bold',
                              fontSize: '0.9em',
                            }}
                          >
                            {formatAddress(addr)} {addressIsAssigned(bus, addr) ? '• in use' : ''}
                          </span>
                        ))}
                        {(bus.addresses || []).length === 0 && <span style={{ color: '#8c9fb1' }}>No devices detected</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#111721', padding: 12, borderRadius: 8, border: '1px dashed #2c3e50' }}>
                  <div style={{ color: '#ecf0f1', fontWeight: 'bold', marginBottom: 6 }}>Assign module to address</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'center' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={styles.label}>I2C address</span>
                      <select
                        value={draft.address || ''}
                        onChange={(e) => setDraftForBus(bus.id, 'address', Number(e.target.value))}
                        style={{
                          background: '#0f141a',
                          color: '#ecf0f1',
                          border: '1px solid #2c3e50',
                          borderRadius: 6,
                          padding: '8px 10px',
                          outlineColor: '#3498db',
                        }}
                      >
                        {unassigned.map((addr) => (
                          <option key={addr} value={addr}>
                            {formatAddress(addr)}
                          </option>
                        ))}
                        {unassigned.length === 0 && <option value="">No free address</option>}
                      </select>
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={styles.label}>Module template</span>
                      <select
                        value={draft.module || ''}
                        onChange={(e) => setDraftForBus(bus.id, 'module', e.target.value)}
                        style={{
                          background: '#0f141a',
                          color: '#ecf0f1',
                          border: '1px solid #2c3e50',
                          borderRadius: 6,
                          padding: '8px 10px',
                          outlineColor: '#3498db',
                        }}
                      >
                        {MODULE_LIBRARY.map((template) => (
                          <option key={template.type} value={template.type}>
                            {template.type} · {template.role}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', height: '100%' }}>
                      <button
                        style={{
                          ...styles.button,
                          opacity: unassigned.length === 0 ? 0.6 : 1,
                          cursor: unassigned.length === 0 ? 'not-allowed' : 'pointer',
                        }}
                        disabled={unassigned.length === 0}
                        onClick={() => draft.address !== undefined && draft.module && handleAssignModule(bus.id, draft.address, draft.module)}
                      >
                        Add module
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {(bus.modules || []).map((module) => (
                    <div key={`${bus.id}-${module.address}-${module.type}`} style={{ background: '#141b27', border: '1px solid #2c3e50', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: '#ecf0f1', fontWeight: 'bold' }}>{module.type}</div>
                          <div style={{ color: '#8c9fb1' }}>
                            {formatAddress(module.address)} · {module.role} · {module.channels} channel{module.channels === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div style={{ ...styles.pill, background: module.role === 'sensor' ? '#234f32' : '#2c3e50', color: '#ecf0f1' }}>
                          {module.role === 'sensor' ? 'Sensor' : 'Effector'}
                        </div>
                      </div>
                      {renderModuleSettings(bus.id, module)}
                    </div>
                  ))}
                  {(bus.modules || []).length === 0 && (
                    <div style={{ color: '#8c9fb1' }}>No modules assigned on this bus.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.panel}>
          <div style={{ color: '#ecf0f1', fontSize: '1.1em', fontWeight: 'bold', marginBottom: 6 }}>UART routing (TX/RX)</div>
          <div style={{ color: '#8c9fb1', marginBottom: 8 }}>
            Map the serial pairs alongside GPIO so TX/RX omissions are obvious.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {uartPorts.map((port) => (
              <div key={port.id} style={{ background: '#141b27', border: '1px solid #2c3e50', borderRadius: 10, padding: 12 }}>
                <div style={{ color: '#ecf0f1', fontWeight: 'bold' }}>{port.label}</div>
                <div style={{ color: '#8c9fb1', marginTop: 4 }}>{port.usage || 'Unassigned use'}</div>
                <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, background: '#0f141a', padding: 10, borderRadius: 8, border: '1px solid #2c3e50' }}>
                    <div style={{ color: '#8c9fb1', fontSize: '0.8em' }}>TX</div>
                    <div style={{ color: '#ecf0f1', fontWeight: 'bold' }}>{port.tx}</div>
                  </div>
                  <div style={{ flex: 1, background: '#0f141a', padding: 10, borderRadius: 8, border: '1px solid #2c3e50' }}>
                    <div style={{ color: '#8c9fb1', fontSize: '0.8em' }}>RX</div>
                    <div style={{ color: '#ecf0f1', fontWeight: 'bold' }}>{port.rx}</div>
                  </div>
                </div>
                <div style={{ color: '#8c9fb1', marginTop: 8 }}>Baud: {port.baud || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GPIOControlScreen;
