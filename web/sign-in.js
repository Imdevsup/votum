// Sign-in flow: Firebase Auth handles the GitHub OAuth dance, then we hand
// the resulting ID token + GitHub access token to the Votum backend, which
// runs eligibility and issues a session cookie.
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GithubAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { auth, githubProvider, API_BASE } from './firebase.js';

const button = document.getElementById('signin');
const status = document.getElementById('status');

function setStatus(msg, kind) {
  status.textContent = msg;
  status.style.color =
    kind === 'error' ? '#B33636' : kind === 'success' ? '#1A7F37' : '';
}

async function exchangeWithBackend(idToken, githubAccessToken) {
  const res = await fetch(`${API_BASE}/v1/auth/firebase-callback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_token: idToken,
      github_access_token: githubAccessToken,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`backend ${res.status}: ${body.error || 'unknown'}`);
  }
  return res.json();
}

async function handleResult(result) {
  const credential = GithubAuthProvider.credentialFromResult(result);
  if (!credential || !credential.accessToken) {
    throw new Error('Firebase did not return a GitHub access token. Re-authorise the app on GitHub.');
  }
  const idToken = await result.user.getIdToken(true);
  const data = await exchangeWithBackend(idToken, credential.accessToken);
  setStatus(`Signed in as ${data.login}. Redirecting…`, 'success');
  setTimeout(() => {
    window.location.href = '/auth-done.html?status=ok';
  }, 600);
}

button.addEventListener('click', async () => {
  setStatus('Opening GitHub…');
  button.disabled = true;
  try {
    const result = await signInWithPopup(auth, githubProvider);
    await handleResult(result);
  } catch (err) {
    if (err && err.code === 'auth/popup-blocked') {
      setStatus('Popup blocked. Falling back to redirect…');
      await signInWithRedirect(auth, githubProvider);
      return;
    }
    if (err && err.code === 'auth/popup-closed-by-user') {
      setStatus('Sign-in cancelled.');
      button.disabled = false;
      return;
    }
    console.error(err);
    setStatus(err.message || 'Sign-in failed. Try again.', 'error');
    button.disabled = false;
  }
});

// Handle the redirect path (popups blocked).
getRedirectResult(auth)
  .then((result) => {
    if (result) handleResult(result).catch((err) => setStatus(err.message, 'error'));
  })
  .catch((err) => {
    if (err && err.code !== 'auth/null-user') {
      console.warn(err);
    }
  });
