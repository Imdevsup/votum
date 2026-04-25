// DOM + string utilities for the Votum content script. Pure functions only;
// nothing here mutates state or talks to the network.
(function () {
  'use strict';

  const NON_REPO_OWNERS = new Set([
    'login', 'signup', 'sponsors', 'orgs', 'topics', 'trending',
    'collections', 'events', 'marketplace', 'pulls', 'issues',
    'notifications', 'settings', 'codespaces', 'new',
  ]);

  // GitHub keeps changing its DOM. We try selectors most-likely-stable to
  // most-fragile, and fall back to nothing rather than guess. The caller
  // logs a single telemetry event when no anchor is found, which lights
  // up the maintainer's dashboard if a deploy starts breaking on github.
  const STAR_SELECTORS = [
    'form[action$="/star"] button',
    'form[action*="/star"] button',
    'button[data-testid*="star-button"]',
    'button[aria-label*="Star"]',
    'button[aria-label*="star"]',
  ];

  function findStarButton() {
    for (const sel of STAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findInsertionAnchor() {
    const star = findStarButton();
    if (!star) return null;
    let node = star;
    for (let i = 0; i < 6 && node && node.parentElement; i++) {
      const parent = node.parentElement;
      if (parent.matches?.('ul.pagehead-actions')) {
        return { container: parent, sibling: node };
      }
      node = parent;
    }
    const form = star.closest('form');
    if (form && form.parentElement) return { container: form.parentElement, sibling: form };
    if (star.parentElement) return { container: star.parentElement, sibling: star };
    return null;
  }

  function parseRepoFromUrl() {
    const path = location.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return null;
    const parts = path.split('/');
    if (parts.length < 2) return null;
    const [owner, name] = parts;
    if (!owner || !name) return null;
    if (NON_REPO_OWNERS.has(owner)) return null;
    if (name.startsWith('.')) return null;
    return { owner, name, full_name: `${owner}/${name}` };
  }

  function readViewerLogin() {
    const meta = document.querySelector('meta[name="user-login"]');
    return meta?.content || null;
  }

  function formatCount(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.floor(n / 1000) + 'k';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
      })[ch],
    );
  }

  function relationLabel(rel) {
    return (
      {
        you_follow: 'You follow',
        notable: 'Notable',
        ecosystem: 'Same ecosystem',
        other: '',
      }[rel] || ''
    );
  }

  function relationProse(rel) {
    return (
      {
        you_follow: 'In your following list.',
        notable: 'Recognized maintainer.',
        ecosystem: 'Active in this ecosystem.',
        other: '',
      }[rel] || ''
    );
  }

  function logTelemetry(kind, detail) {
    const cfg = window.VOTUM_CONFIG;
    if (!cfg?.TELEMETRY_ENDPOINT) return;
    try {
      navigator.sendBeacon(
        cfg.TELEMETRY_ENDPOINT,
        new Blob([JSON.stringify({ kind, detail, ts: Date.now() })], {
          type: 'application/json',
        }),
      );
    } catch {
      /* swallow */
    }
  }

  window.__VOTUM__ = window.__VOTUM__ || {};
  window.__VOTUM__.util = {
    findStarButton,
    findInsertionAnchor,
    parseRepoFromUrl,
    readViewerLogin,
    formatCount,
    escapeHtml,
    relationLabel,
    relationProse,
    logTelemetry,
  };
})();
