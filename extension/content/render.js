// All DOM construction for the Votum button + panel. Pure builders — they
// produce elements, attach event listeners that delegate to the lifecycle
// module's `vouch`/`withdraw` handlers, but they do not mutate `STATE`
// themselves. That separation keeps the render layer testable in isolation.
(function () {
  'use strict';

  const { formatCount, escapeHtml, relationLabel, relationProse } =
    window.__VOTUM__.util;

  function buildButton(data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'votum-action';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'votum-button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `
      <span class="votum-seal-mini" aria-hidden="true"></span>
      <span class="votum-label">Votum</span>
      <span class="votum-count" data-count></span>
    `;
    btn.querySelector('[data-count]').textContent = formatCount(data.count);
    wrapper.appendChild(btn);
    return { wrapper, btn };
  }

  function buildPanel(data, repo, handlers) {
    const panel = document.createElement('div');
    panel.className = 'votum-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Votum endorsements');

    const header = document.createElement('div');
    header.className = 'votum-panel-header';
    header.innerHTML = `
      <div class="votum-count-display">
        <div class="votum-panel-count">${escapeHtml(formatCount(data.count))}</div>
        <div class="votum-panel-count-label">Vows · Witnessed</div>
      </div>
      <div class="votum-seal-large" aria-hidden="true">VOTUM</div>
    `;
    panel.appendChild(header);

    panel.appendChild(buildVoucherList(data));
    panel.appendChild(buildFooter(data, repo, handlers));
    return panel;
  }

  function buildVoucherList(data) {
    const list = document.createElement('ul');
    list.className = 'votum-voucher-list';
    if (data.vouchers.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'votum-empty';
      empty.textContent = 'No vouches yet. Be the first to take the vow.';
      list.appendChild(empty);
      return list;
    }
    for (const v of data.vouchers) {
      list.appendChild(buildVoucherRow(v));
    }
    return list;
  }

  function buildVoucherRow(v) {
    const li = document.createElement('li');
    li.className = 'votum-voucher';
    const pill = relationLabel(v.relation);
    const prose = relationProse(v.relation);
    li.innerHTML = `
      <img class="votum-voucher-avatar" src="${encodeURI(v.avatar_url)}" alt=""
           width="32" height="32" loading="lazy"/>
      <div class="votum-voucher-info">
        <div>
          <a class="votum-voucher-name"
             href="https://github.com/${encodeURIComponent(v.login)}"
             target="_blank" rel="noopener">@${escapeHtml(v.login)}</a>
          ${pill ? `<span class="votum-pill votum-pill-${v.relation}">${pill}</span>` : ''}
        </div>
        ${prose ? `<div class="votum-voucher-relation">${prose}</div>` : ''}
      </div>
    `;
    return li;
  }

  function buildFooter(data, repo, handlers) {
    const footer = document.createElement('div');
    footer.className = 'votum-panel-footer';

    const rest = Math.max(0, data.count - data.vouchers.length);
    const left = document.createElement('span');
    left.className = 'votum-panel-footer-rest';
    if (rest > 0) {
      left.textContent = `+ ${rest} other developer${rest === 1 ? '' : 's'}.`;
    }
    footer.appendChild(left);

    footer.appendChild(buildAction(data, repo, footer, handlers));
    return footer;
  }

  function buildAction(data, repo, footer, handlers) {
    const cfg = window.VOTUM_CONFIG;
    const elig = data.viewer_eligibility;

    if (elig === null) {
      const returnTo = encodeURIComponent(`${cfg.WEB_BASE}/auth-done.html`);
      return makeLink('Take the vow yourself', `${cfg.API_BASE}/v1/auth/github/start?return_to=${returnTo}`);
    }
    if (elig === 'pending' || elig === 'rejected') {
      return makeLink('Apply for review', `${cfg.WEB_BASE}/apply.html`);
    }
    if (elig === 'suspended') {
      return makeHint('Account suspended.');
    }
    if (data.viewer_has_vouched) {
      return makeAction('Withdraw your vow', () => handlers.onWithdraw(repo, footer));
    }
    if (!data.viewer_can_vouch) {
      return makeHint('All ten slots are spent.');
    }
    return makeAction('Take the vow yourself', () => handlers.onVouch(repo, footer));
  }

  function makeLink(text, href) {
    const a = document.createElement('a');
    a.className = 'votum-cta-link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  }

  function makeAction(text, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'votum-cta-link';
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
  }

  function makeHint(text) {
    const span = document.createElement('span');
    span.className = 'votum-cta-hint';
    span.textContent = text;
    return span;
  }

  function setFooterMessage(footer, text, kind) {
    const action = footer.querySelector('.votum-cta-link, .votum-cta-hint');
    const msg = document.createElement('span');
    let cls = 'votum-cta-hint';
    if (kind === 'success') cls += ' votum-success';
    else if (kind === 'error') cls += ' votum-error';
    msg.className = cls;
    msg.textContent = text;
    if (action) action.replaceWith(msg);
    else footer.appendChild(msg);
  }

  window.__VOTUM__ = window.__VOTUM__ || {};
  window.__VOTUM__.render = { buildButton, buildPanel, setFooterMessage };
})();
