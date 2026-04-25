// Admin queue — token-gated review of manual eligibility applications.
import { API_BASE } from './firebase.js';

const queue = document.getElementById('queue');
const empty = document.getElementById('empty');
const errEl = document.getElementById('error');
const tokenInput = document.getElementById('token');
const loadBtn = document.getElementById('load');

// Persist the token in sessionStorage so admins don't re-paste on refresh.
const saved = sessionStorage.getItem('votum_admin_token');
if (saved) tokenInput.value = saved;

loadBtn.addEventListener('click', load);
tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') load();
});

function api(path, opts = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'X-Votum-Admin': tokenInput.value,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

async function load() {
  errEl.textContent = '';
  empty.classList.add('hidden');
  queue.innerHTML = '<p class="muted">Loading…</p>';
  sessionStorage.setItem('votum_admin_token', tokenInput.value);
  try {
    const res = await api('/v1/admin/queue');
    if (res.status === 401) {
      queue.innerHTML = '';
      errEl.textContent = 'Invalid token.';
      return;
    }
    const data = await res.json();
    queue.innerHTML = '';
    if (!Array.isArray(data) || data.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    data.forEach(renderCard);
  } catch (err) {
    queue.innerHTML = '';
    errEl.textContent = `Network error: ${err?.message ?? 'unknown'}`;
  }
}

function renderCard(app) {
  const card = document.createElement('div');
  card.className = 'admin-card';
  const linksHtml = (app.links || [])
    .map(
      (l) => `<a href="${escape(l)}" target="_blank" rel="noopener">${escape(l)}</a>`,
    )
    .join(' ');
  card.innerHTML = `
    <div class="who">
      <img src="${escape(app.applicant.avatar_url)}" alt="" />
      <div>
        <div><strong>${escape(app.applicant.login)}</strong></div>
        <div class="muted small">
          <a target="_blank" rel="noopener"
             href="https://github.com/${encodeURIComponent(app.applicant.login)}">github.com/${escape(app.applicant.login)}</a>
          · applied ${escape(new Date(app.created_at).toLocaleString())}
        </div>
      </div>
    </div>
    <p class="reason">${escape(app.reason_text)}</p>
    ${linksHtml ? `<div class="links">${linksHtml}</div>` : ''}
    <textarea data-note placeholder="Decision note (optional, shown to the applicant)"></textarea>
    <div class="row">
      <button class="approve" data-action="approve">Approve</button>
      <button class="reject" data-action="reject">Reject</button>
    </div>
  `;
  card.querySelector('[data-action="approve"]').addEventListener('click', () =>
    decide(card, app, 'approve'),
  );
  card.querySelector('[data-action="reject"]').addEventListener('click', () =>
    decide(card, app, 'reject'),
  );
  queue.appendChild(card);
}

async function decide(card, app, action) {
  const note = card.querySelector('[data-note]').value;
  const btns = card.querySelectorAll('button');
  btns.forEach((b) => (b.disabled = true));
  try {
    const res = await api(`/v1/admin/queue/${app.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ note: note || undefined }),
    });
    if (res.ok) {
      card.style.opacity = '0.45';
      card.style.pointerEvents = 'none';
    } else {
      const body = await res.json().catch(() => ({}));
      errEl.textContent = `${action} failed: ${body.error || res.status}`;
      btns.forEach((b) => (b.disabled = false));
    }
  } catch (err) {
    errEl.textContent = `Network error: ${err?.message ?? 'unknown'}`;
    btns.forEach((b) => (b.disabled = false));
  }
}
