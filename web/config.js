// Tiny shared config for the web pages. Only needs to know where the
// API lives — everything else is direct GitHub OAuth via the backend.
//
// Override at runtime by setting `window.VOTUM_API_BASE` before this
// module loads.
function resolveApiBase() {
  if (typeof window === 'undefined') return 'https://votum-backend.vercel.app';
  if (window.VOTUM_API_BASE) return window.VOTUM_API_BASE;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
  return 'https://votum-backend.vercel.app';
}

export const API_BASE = resolveApiBase();
