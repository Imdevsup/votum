// Lifecycle: mount, unmount, panel open/close, vouch/withdraw orchestration.
// Owns the `STATE` singleton and the listeners that re-fire mount on
// GitHub's Turbo navigation. The actions here delegate the *what*
// (DOM construction) to render.js and the *where* (HTTP) to api.js.
(function () {
  'use strict';

  const cfg = window.VOTUM_CONFIG;
  const { findInsertionAnchor, findStarButton, parseRepoFromUrl, readViewerLogin, formatCount, logTelemetry } =
    window.__VOTUM__.util;
  const { getRepoData, invalidate, vouch, withdraw } = window.__VOTUM__.api;
  const { buildButton, buildPanel, setFooterMessage } = window.__VOTUM__.render;

  const STATE = {
    button: null,
    panel: null,
    lastFullName: null,
  };

  // ----- Vouch / withdraw handlers passed into the render layer -----

  async function onVouch(repo, footer) {
    setFooterMessage(footer, 'Sealing your vouch…');
    try {
      const res = await vouch(repo.full_name);
      if (res.status === 401) {
        window.open(`${cfg.WEB_BASE}/sign-in.html`, '_blank');
        setFooterMessage(footer, 'Sign in to continue.', 'error');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFooterMessage(footer, friendlyError(body.error, res.status), 'error');
        return;
      }
      invalidate(repo.full_name);
      await refreshButton(repo);
    } catch {
      setFooterMessage(footer, 'Network error. Try again.', 'error');
    }
  }

  async function onWithdraw(repo, footer) {
    setFooterMessage(footer, 'Withdrawing…');
    try {
      const res = await withdraw(repo.owner, repo.name);
      if (!res.ok) {
        setFooterMessage(footer, 'Could not withdraw. Try again.', 'error');
        return;
      }
      invalidate(repo.full_name);
      await refreshButton(repo);
    } catch {
      setFooterMessage(footer, 'Network error. Try again.', 'error');
    }
  }

  function friendlyError(code, status) {
    if (code === 'not_eligible') return 'Your account is not eligible to vouch yet.';
    if (code === 'slots_full') return 'All 10 slots are full. Withdraw one to free a slot.';
    if (code === 'already_vouched') return 'You already vouched for this repo.';
    if (code === 'rate_limited') return 'Slow down — too many vouches in the last hour.';
    if (status === 401) return 'Sign in with GitHub first.';
    return 'Something went wrong. Try again in a moment.';
  }

  // ----- Mount / unmount lifecycle -----

  function unmount() {
    closePanel();
    if (STATE.button) {
      STATE.button.remove();
      STATE.button = null;
    }
    STATE.lastFullName = null;
  }

  async function mount() {
    const repo = parseRepoFromUrl();
    if (!repo) {
      unmount();
      return;
    }
    if (
      STATE.lastFullName === repo.full_name &&
      STATE.button &&
      document.contains(STATE.button)
    ) {
      return;
    }
    unmount();

    const anchor = findInsertionAnchor();
    if (!anchor) {
      logTelemetry('no_anchor', { url: location.pathname });
      return;
    }

    let data;
    try {
      data = await getRepoData(repo.full_name, readViewerLogin());
    } catch (err) {
      logTelemetry('fetch_failed', { error: String(err) });
      return;
    }

    const { wrapper, btn } = buildButton(data);
    insertNextTo(anchor, wrapper);
    STATE.button = wrapper;
    STATE.lastFullName = repo.full_name;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (STATE.panel) closePanel();
      else openPanel(repo, data, btn);
    });
  }

  function insertNextTo(anchor, wrapper) {
    if (anchor.container.tagName === 'UL') {
      const li = document.createElement('li');
      li.appendChild(wrapper);
      anchor.container.insertBefore(li, anchor.sibling.nextSibling);
    } else {
      anchor.container.insertBefore(wrapper, anchor.sibling.nextSibling);
    }
  }

  // ----- Panel open / close / position -----

  function openPanel(repo, data, anchor) {
    closePanel();
    const panel = buildPanel(data, repo, { onVouch, onWithdraw });
    document.body.appendChild(panel);
    positionPanel(panel, anchor);
    STATE.panel = panel;
    anchor.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      document.addEventListener('mousedown', onOutsideClick, true);
      document.addEventListener('keydown', onEscape, true);
    }, 0);
    window.addEventListener('scroll', onWindowChange, true);
    window.addEventListener('resize', onWindowChange, true);
  }

  function closePanel() {
    if (!STATE.panel) return;
    STATE.panel.remove();
    STATE.panel = null;
    if (STATE.button) {
      const btn = STATE.button.querySelector('.votum-button');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onEscape, true);
    window.removeEventListener('scroll', onWindowChange, true);
    window.removeEventListener('resize', onWindowChange, true);
  }

  function onOutsideClick(e) {
    if (!STATE.panel) return;
    if (STATE.panel.contains(e.target)) return;
    if (STATE.button?.contains(e.target)) return;
    closePanel();
  }
  function onEscape(e) {
    if (e.key === 'Escape') closePanel();
  }
  function onWindowChange() {
    if (STATE.panel && STATE.button) {
      const btn = STATE.button.querySelector('.votum-button');
      if (btn) positionPanel(STATE.panel, btn);
    }
  }

  function positionPanel(panel, anchor) {
    const rect = anchor.getBoundingClientRect();
    const PANEL_W = 380;
    panel.style.top = `${rect.bottom + window.scrollY + 8}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - rect.right - window.scrollX)}px`;
    panel.style.width = `${PANEL_W}px`;
    panel.dataset.anchor = 'right';
  }

  async function refreshButton(repo) {
    let data;
    try {
      data = await getRepoData(repo.full_name, readViewerLogin());
    } catch (err) {
      logTelemetry('fetch_failed', { error: String(err) });
      return;
    }
    if (!STATE.button) return;
    const countEl = STATE.button.querySelector('[data-count]');
    if (countEl) countEl.textContent = formatCount(data.count);
    if (STATE.panel) {
      const fresh = buildPanel(data, repo, { onVouch, onWithdraw });
      STATE.panel.replaceWith(fresh);
      STATE.panel = fresh;
      const btn = STATE.button.querySelector('.votum-button');
      if (btn) positionPanel(fresh, btn);
    }
  }

  // ----- Bootstrap (called from content.js) -----

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mount().catch((err) => logTelemetry('mount_failed', { error: String(err) }));
    });
  }

  function start() {
    schedule();
    document.addEventListener('turbo:load', schedule);
    document.addEventListener('turbo:render', schedule);
    document.addEventListener('pjax:end', schedule);
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);

    new MutationObserver(() => {
      if (STATE.button && document.contains(STATE.button)) return;
      if (!findStarButton()) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.__VOTUM__ = window.__VOTUM__ || {};
  window.__VOTUM__.lifecycle = { start };
})();
