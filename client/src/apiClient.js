// Centralizes the X-App-Pin header and 401 handling so every API call in
// App.jsx doesn't need to repeat it. configureApiClient is called by the
// gate wrapper whenever the stored PIN changes.

let currentPin = null;
let onUnauthorized = () => {};

export function configureApiClient({ pin, onUnauthorizedCallback } = {}) {
  currentPin = pin || null;
  if (onUnauthorizedCallback) onUnauthorized = onUnauthorizedCallback;
}

async function handleAuthFailure(res) {
  if (res.status === 401) {
    onUnauthorized();
  }
}

export async function getJson(url) {
  const res = await fetch(url, { headers: { 'X-App-Pin': currentPin || '' } });
  await handleAuthFailure(res);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Pin': currentPin || '' },
    body: JSON.stringify(body),
  });
  await handleAuthFailure(res);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
