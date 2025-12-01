import React, { createContext, useContext, useState, useCallback } from 'react';
import { styles } from '../styles';

const ErrorContext = createContext(null);

export function ErrorProvider({ children }) {
  const [error, setError] = useState(null);

  const showError = useCallback((msg) => {
    setError(msg);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <ErrorContext.Provider value={{ error, showError, clearError }}>
      {children}
      {error && <ErrorDisplay message={error} onClose={clearError} />}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useError must be used within an ErrorProvider");
  }
  return context;
}

function ErrorDisplay({ message, onClose }) {
  return (
    <div style={styles.errorToast}>
      <span>{message}</span>
      <button onClick={onClose} style={styles.errorToastClose}>×</button>
    </div>
  );
}
