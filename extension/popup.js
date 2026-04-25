// Popup logic. Loads /me, picks the right template, wires up sign-in,
// listing of active vouches, and withdraw buttons.
(() => {
  'use strict';
  const cfg = window.VOTUM_CONFIG;
  const main = document.getElementById('main');

  function $(sel, root = document) { return root.querySelector(sel); }

  function api(path, opts = {}) {
    return fetch(`${cfg.API_BASE}${path}`, {
      credentials: 'include',
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
    );
  }

  function fillWho(scope, me) {
    const who = $('[data-who]', scope);
    if (!who) return;
    const status = ({
      auto_eligible: 'Eligible',
      manually_eligible: 'Eligible (manual)',
      pending: 'Pending review',
      rejected: 'Not eligible',
      suspended: 'Suspended',
    })[me.eligibility] || me.eligibility;
    who.innerHTML = `
      <img src="${escape(me.avatar_url)}" alt="" />
      <div>
        <div class="who-login">${escape(me.login)}</div>
        <div class="who-status">${escape(status)}</div>
      </div>
    `;
  }

  function render(template, fill) {
    const tpl = document.getElementById(template);
    const node = tpl.content.firstElementChild.cloneNode(true);
    main.classList.remove('loading');
    main.innerHTML = '';
    main.appendChild(node);
    fill?.(node);
  }

  function openMarketing(e) {
    e.preventDefault();
    chrome.tabs.create({ url: cfg.WEB_BASE });
  }

  function bindMarketing(scope = document) {
    const link = $('[data-marketing]', scope);
    if (link) link.addEventListener('click', openMarketing);
  }

  function startSignIn() {
    // Hand off to the backend's redirect-style /auth/github/start, which
    // builds the GitHub authorise URL and bounces the user there. After
    // the user consents, GitHub returns to /v1/auth/github/callback,
    // which sets the session cookie and lands on /auth-done.html.
    // Re-opening the popup picks up the new cookie automatically.
    const returnTo = encodeURIComponent(cfg.WEB_BASE + '/auth-done.html');
    chrome.tabs.create({ url: `${cfg.API_BASE}/v1/auth/github/start?return_to=${returnTo}` });
    window.close();
  }

  async function signOut() {
    await api('/v1/auth/logout', { method: 'POST' });
    await load();
  }

  async function load() {
    main.classList.add('loading');
    main.innerHTML = '<p class="loading-msg">Loading…</p>';
    bindMarketing();
    let me;
    try {
      const res = await api('/v1/me');
      if (res.status === 401) {
        render('t-signed-out', (node) => {
          $('[data-signin]', node).addEventListener('click', startSignIn);
          bindMarketing(node);
        });
        return;
      }
      me = await res.json();
    } catch (err) {
      main.innerHTML = `<p class="loading-msg">Could not reach the Votum API.<br/><span class="small">${escape(
        cfg.API_BASE,
      )}</span></p>`;
      return;
    }

    const eligibility = me.eligibility;
    if (eligibility === 'pending') {
      render('t-pending', (node) => {
        fillWho(node, me);
        $('[data-reason]', node).textContent =
          me.eligibility_reason || 'Auto-eligibility checks did not pass.';
        $('[data-signout]', node).addEventListener('click', signOut);
      });
      return;
    }

    if (eligibility === 'rejected') {
      render('t-rejected', (node) => {
        fillWho(node, me);
        $('[data-reason]', node).textContent =
          me.eligibility_reason || 'Manual review rejected this application.';
        const apply = $('[data-apply]', node);
        apply.href = `${cfg.WEB_BASE}/apply.html`;
        $('[data-signout]', node).addEventListener('click', signOut);
      });
      return;
    }

    if (eligibility === 'suspended') {
      render('t-suspended', (node) => {
        fillWho(node, me);
        $('[data-reason]', node).textContent =
          me.eligibility_reason || 'This account has been suspended.';
        $('[data-signout]', node).addEventListener('click', signOut);
      });
      return;
    }

    // Eligible.
    render('t-eligible', async (node) => {
      fillWho(node, me);
      $('[data-slots-used]', node).textContent = String(me.slots_used);
      $('[data-slots-total]', node).textContent = String(me.slots_total);
      $('[data-slots-fill]', node).style.width =
        `${Math.min(100, (me.slots_used / me.slots_total) * 100)}%`;
      $('[data-signout]', node).addEventListener('click', signOut);

      const list = $('[data-vouches]', node);
      const empty = $('[data-empty]', node);
      try {
        const res = await api('/v1/me/vouches');
        const vouches = await res.json();
        if (!Array.isArray(vouches) || vouches.length === 0) {
          empty.classList.remove('hidden');
          return;
        }
        for (const v of vouches) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `https://github.com/${v.repo_full_name}`;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = v.repo_full_name;

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Withdraw';
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = '…';
            const r = await api(`/v1/vouch/${v.repo_full_name}`, { method: 'DELETE' });
            if (r.ok) {
              await load();
            } else {
              btn.disabled = false;
              btn.textContent = 'Retry';
            }
          });

          li.appendChild(a);
          li.appendChild(btn);
          list.appendChild(li);
        }
      } catch (err) {
        empty.classList.remove('hidden');
      }
    });
  }

  load();
})();
