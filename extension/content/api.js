// API + cache layer for the Votum content script. Owns the 60-second
// per-repo cache and the bare fetch wrappers. Always sends credentials so
// the session cookie travels with every call.
(function () {
  'use strict';

  const cfg = window.VOTUM_CONFIG;
  const cache = new Map();

  function fetchRaw(path, opts = {}) {
    return fetch(`${cfg.API_BASE}${path}`, {
      credentials: 'include',
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  }

  async function getRepoData(full_name, viewer_login) {
    const cached = cache.get(full_name);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const params = new URLSearchParams();
    if (viewer_login) params.set('viewer_login', viewer_login);
    const qs = params.toString();
    const res = await fetchRaw(`/v1/repos/${full_name}${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache.set(full_name, { data, expiresAt: Date.now() + cfg.CACHE_MS });
    return data;
  }

  function invalidate(full_name) {
    cache.delete(full_name);
  }

  async function vouch(repo_full_name) {
    return fetchRaw('/v1/vouch', {
      method: 'POST',
      body: JSON.stringify({ repo_full_name }),
    });
  }

  async function withdraw(owner, name) {
    return fetchRaw(`/v1/vouch/${owner}/${name}`, { method: 'DELETE' });
  }

  window.__VOTUM__ = window.__VOTUM__ || {};
  window.__VOTUM__.api = { getRepoData, invalidate, vouch, withdraw };
})();
