import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ErrorProvider } from './hooks/useError.jsx'

// Simple global style reset + shared animations
const style = document.createElement('style');
style.innerHTML = `
  body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #1a1a1a; color: white; }
  button { cursor: pointer; }

  /* Animations shared across the SVG schematic */
  .motor-active {
    animation: pulse 1.8s ease-in-out infinite;
  }

  .heater-on {
    animation: glow 1.6s ease-in-out infinite;
  }

  .fan-spin {
    transform-box: fill-box;
    transform-origin: center;
    animation: spin 2s linear infinite;
  }

  .flow-line {
    stroke-dasharray: 12 10;
    animation: flow 3s linear infinite;
  }

  .alarm-glow {
    animation: alarmPulse 0.9s ease-in-out infinite;
  }

  @keyframes pulse {
    0% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.04); opacity: 1; }
    100% { transform: scale(1); opacity: 0.9; }
  }

  @keyframes glow {
    0% { filter: drop-shadow(0 0 2px #e67e22); }
    50% { filter: drop-shadow(0 0 10px #e67e22); }
    100% { filter: drop-shadow(0 0 2px #e67e22); }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes flow {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -44; }
  }

  @keyframes alarmPulse {
    0% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(231, 76, 60, 0.15); }
    100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.4); }
  }
`;
document.head.appendChild(style);

/**
 * Main application entry point.
 * Mounts the root App component to the DOM.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ErrorProvider>
        <App />
      </ErrorProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
