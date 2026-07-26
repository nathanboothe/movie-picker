import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AppGate from './AppGate.jsx';
import { configureApiClient } from './apiClient.js';
import './App.css';

const STORAGE_KEY = 'moviePickerAppPin';

function Root() {
  const [pin, setPin] = useState(() => localStorage.getItem(STORAGE_KEY));

  const lockOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPin(null);
  }, []);

  // Keep the shared API client's PIN/callback in sync with whatever's
  // currently unlocked. A 401 from any request drops back to the gate
  // automatically — handles PIN rotation gracefully.
  configureApiClient({ pin, onUnauthorizedCallback: lockOut });

  function handleUnlock(enteredPin) {
    localStorage.setItem(STORAGE_KEY, enteredPin);
    setPin(enteredPin);
  }

  if (!pin) {
    return <AppGate onUnlock={handleUnlock} />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
