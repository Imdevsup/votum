// DOM + string utilities for the Votum content script. Pure functions only;
// nothing here mutates state or talks to the network.
(function () {
  'use strict';

  const NON_REPO_OWNERS = new Set([
    'login', 'signup', 'sponsors', 'orgs', 'topics', 'trending',
    'collections', 'events', 'marketplace', 'pulls', 'issues',
    'notifications', 'settings', 'codespaces', 'new',
  ]);

  // GitHub keeps reshaping its repo header. We try the most stable
  // attribute-based selectors first, then fall back to scanning the page
  // header for a button whose visible text is literally "Star" / "Starred"
  // / "Unstar" — the rendered text is the longest-lived signal across
  // their redesigns.
  const STAR_SELECTORS = [
    'form[action$="/star"] button',
    'form[action$="/unstar"] button',
    'form[action*="/star"] button',
    'button[data-testid*="star-button"]',
    'button[data-testid*="StarButton"]',
    'button[aria-label*="Star this repository"]',
    'button[aria-label*="Unstar this repository"]',
    'button[aria-label^="Star "]',
    'button[aria-label^="Unstar "]',
    'button[aria-label*="Star"]',
    'button[aria-label*="star"]',
  ];

  // Containers we'll scan if the attribute selectors miss.
  const ACTION_BAR_SELECTORS = [
    'ul.pagehead-actions',
    '[data-testid="repository-actions"]',
    'header',
    'nav',
    'main',
  ];

  function findStarButton() {
    for (const sel of STAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Text-content sweep: any <button> whose visible text equals one of the
    // star verbs, scoped to the page header so we don't snag a button
    // somewhere in the body.
    for (const containerSel of ACTION_BAR_SELECTORS) {
      const container = document.querySelector(containerSel);
      if (!container) continue;
      for (const btn of container.querySelectorAll('button')) {
        const t = (btn.textContent || '').trim().toLowerCase();
        if (t === 'star' || t === 'starred' || t === 'unstar') return btn;
      }
    }
    return null;
  }

  function findInsertionAnchor() {
    const star = findStarButton();
    if (!star) return null;
    let node = star;
    // Walk upward looking for the row of buttons (ul.pagehead-actions or
    // any flex/inline container that has Watch + Fork + Star siblings).
    for (let i = 0; i < 8 && node && node.parentElement; i++) {
      const parent = node.parentElement;
      if (parent.matches?.('ul.pagehead-actions')) {
        return { container: parent, sibling: node };
      }
      node = parent;
    }
    // Fall back to the star button's nearest form, then to its parent.
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
    // Visible debug log in DevTools, on by default while we're still
    // catching up to GitHub's redesigns. Flip cfg.DEBUG=false to silence.
    if (cfg?.DEBUG !== false) {
      // eslint-disable-next-line no-console
      console.info(`%c[votum] ${kind}`, 'color:#6B1818;font-weight:600', detail || '');
    }
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
