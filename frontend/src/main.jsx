import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Simple global style reset
const style = document.createElement('style');
style.innerHTML = `
  body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #1a1a1a; color: white; }
  button { cursor: pointer; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

