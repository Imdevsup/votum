// Shared Firebase init for the marketing site, the sign-in page, and any
// future authed page on votum.dev. Loaded as an ES module from gstatic so
// no bundler is required. Keep imports trimmed to the SDK products we
// actually use — every line here ships to the browser.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth,
  GithubAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getAnalytics, isSupported as analyticsSupported } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js';

// Firebase web config. The apiKey is a public client identifier — Firestore
// and Auth security rules are what actually protect data, not this string.
export const firebaseConfig = {
  apiKey: 'AIzaSyBcH9RFJxDP7IxpoSJCJS4nEvEPnZM68ug',
  authDomain: 'votum-43e98.firebaseapp.com',
  projectId: 'votum-43e98',
  storageBucket: 'votum-43e98.firebasestorage.app',
  messagingSenderId: '621856579422',
  appId: '1:621856579422:web:25668e95d515c7f9b9b9cf',
  measurementId: 'G-5LK3YM9FMH',
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const githubProvider = new GithubAuthProvider();
// Match the scopes the backend needs: profile + the viewer's follow list.
githubProvider.addScope('read:user');
githubProvider.addScope('user:follow');

// Analytics is best-effort — it fails silently in browsers that block it
// (e.g. private mode in some configs). Don't let it gate the rest of the
// page from loading.
analyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(app);
  })
  .catch(() => {
    /* noop */
  });

// API base resolution. We pick a sensible default per environment so the
// same firebase.js works across local dev, Vercel previews, and prod.
//   - localhost  → http://localhost:3000 (the local backend)
//   - anywhere else → the deployed backend
// Override at build/serve time by setting `window.VOTUM_API_BASE` before
// this module loads if you need to point somewhere else.
function resolveApiBase() {
  if (typeof window === 'undefined') return 'https://votum-backend.vercel.app';
  if (window.VOTUM_API_BASE) return window.VOTUM_API_BASE;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
  return 'https://votum-backend.vercel.app';
}
export const API_BASE = resolveApiBase();
