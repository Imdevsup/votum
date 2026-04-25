// Single config surface for the extension.
//
// `API_BASE` is what the production CRX talks to. For local development:
//   - load the extension unpacked (chrome://extensions → Load unpacked)
//   - edit this file to point at http://localhost:3000
//   - hit the reload icon on the extension card
//
// `WEB_BASE` is the marketing/sign-in origin. The popup opens
// ${WEB_BASE}/sign-in.html when the user clicks "Sign in with GitHub".
window.VOTUM_CONFIG = Object.freeze({
  API_BASE: 'https://votum-backend.vercel.app',
  WEB_BASE: 'https://votum-app.vercel.app',
  CACHE_MS: 60 * 1000,
  TELEMETRY_ENDPOINT: null,
});
