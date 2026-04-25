// Single config surface for the extension.
//
// `API_BASE` is what the production CRX talks to. For local development:
//   - load the extension unpacked (chrome://extensions → Load unpacked)
//   - edit this file to point at http://localhost:3000
//   - hit the reload icon on the extension card
//
// `WEB_BASE` is the marketing origin. Used as the return target after
// GitHub OAuth completes; the actual sign-in is started by opening
// ${API_BASE}/v1/auth/github/start in a new tab.
window.VOTUM_CONFIG = Object.freeze({
  API_BASE: 'https://votum-backend.vercel.app',
  WEB_BASE: 'https://votum-app.vercel.app',
  CACHE_MS: 60 * 1000,
  TELEMETRY_ENDPOINT: null,
});
