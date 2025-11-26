// file: frontend/src/components/GPIOControlScreen.jsx
import React, { useState, useEffect } from 'react';
import { styles } from '../App';

function GPIOControlScreen() {
  const [gpioStatus, setGpioStatus] = useState({});

  useEffect(() => {
    // Fetch initial GPIO status
    const fetchGpioStatus = async () => {
      try {
        const res = await fetch('/api/gpio');
        const json = await res.json();
        if (json.success) {
          setGpioStatus(json.status);
        }
      } catch (e) {
        console.error('Failed to fetch GPIO status:', e);
      }
    };
    fetchGpioStatus();
  }, []);

  const sendGpioCmd = async (command, value) => {
    try {
      const res = await fetch('/api/gpio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, value }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('GPIO command failed:', json.msg);
      } else {
        // Refresh GPIO status
        const res = await fetch('/api/gpio');
        const json = await res.json();
        if (json.success) {
          setGpioStatus(json.status);
        }
      }
    } catch (e) {
      console.error('Failed to send GPIO command:', e);
    }
  };

  const handlePinModeChange = (pin, mode, pullUpDown) => {
    sendGpioCmd('SET_GPIO_MODE', { pin, mode, pull_up_down: pullUpDown });
  };

  const handlePinValueChange = (pin, value) => {
    sendGpioCmd('SET_GPIO_VALUE', { pin, value: parseInt(value, 10) });
  };

  return (
    <div>
      <h2>GPIO Control</h2>
      <div style={styles.panel}>
        <table>
          <thead>
            <tr>
              <th>Pin</th>
              <th>Mode</th>
              <th>Pull-up/down</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(gpioStatus).map(([pin, status]) => (
              <tr key={pin}>
                <td>{pin}</td>
                <td>
                  <select
                    value={status.mode}
                    onChange={(e) => handlePinModeChange(pin, e.target.value, status.pull_up_down)}
                  >
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                  </select>
                </td>
                <td>
                  {status.mode === 'IN' ? (
                    <select
                      value={status.pull_up_down}
                      onChange={(e) => handlePinModeChange(pin, status.mode, e.target.value)}
                    >
                      <option value="up">Up</option>
                      <option value="down">Down</option>
                      <option value="off">Off</option>
                    </select>
                  ) : (
                    <span>N/A</span>
                  )}
                </td>
                <td>
                  {status.mode === 'IN' ? (
                    <span>{status.value}</span>
                  ) : (
                    <select
                      value={status.value}
                      onChange={(e) => handlePinValueChange(pin, e.target.value)}
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default GPIOControlScreen;
