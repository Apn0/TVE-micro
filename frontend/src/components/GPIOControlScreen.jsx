// file: frontend/src/components/GPIOControlScreen.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { styles } from '../App';

function GPIOControlScreen() {
  const [gpioStatus, setGpioStatus] = useState({});
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
          setGpioStatus(json.status || {});
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
          setGpioStatus(statusJson.status || {});
        } else {
          setError(statusJson.msg || 'Failed to refresh GPIO status');
        }
      }
    } catch (e) {
      console.error('Failed to send GPIO command:', e);
      setError('Failed to send GPIO command');
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
      Object.entries(gpioStatus).sort(
        ([pinA], [pinB]) => parseInt(pinA, 10) - parseInt(pinB, 10)
      ),
    [gpioStatus]
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

                  <div style={{ color: '#ecf0f1' }}>
                    {status.name || 'Unassigned'}
                  </div>

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
    </div>
  );
}

export default GPIOControlScreen;
