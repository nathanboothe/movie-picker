import { useState } from 'react';

export default function AppGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError('');
    fetch('/api/app-gate/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Incorrect PIN.');
        onUnlock(pin);
      })
      .catch((err) => setError(err.message || 'Incorrect PIN.'))
      .finally(() => setBusy(false));
  }

  return (
    <div className="app">
      <header className="marquee">
        <span className="marquee__eyebrow">Movie Night</span>
        <h1 className="marquee__title">Enter the PIN</h1>
      </header>
      <section className="result">
        <form className="result-card" onSubmit={handleSubmit}>
          <p className="question">This app is just for the family — enter the PIN to get in.</p>
          <div className="year-range" style={{ justifyContent: 'center' }}>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              aria-label="PIN"
              style={{ width: '10rem', textAlign: 'center', fontSize: '1.1rem' }}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="action-row">
            <button type="submit" className="action-button action-button--watch" disabled={busy || !pin}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
