// Shared-secret app-open gate, same pattern used across Nathan's other
// projects (Nexus, Coastal Elder Connect). This protects the whole app —
// nobody without the PIN can hit any /api/* route.

function checkAppPin(providedPin) {
  const expected = process.env.APP_PIN;
  if (!expected) return { ok: false, reason: 'not_configured' };
  if (!providedPin || providedPin !== expected) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

module.exports = { checkAppPin };
