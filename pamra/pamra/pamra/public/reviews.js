// PAMRA Reviews page — Supabase REST client (no SDK needed).
// Reads and writes to the `reviews` table over HTTPS using the anon key.

(() => {
  const cfg = window.SUPABASE_CONFIG || {};
  const isConfigured = cfg.url && cfg.anonKey && !cfg.url.includes('YOUR-') && !cfg.anonKey.includes('YOUR-');

  // ─── Render the public site chrome first ───
  SitePublic.render('reviews');

  // ─── Config banner if Supabase isn't wired up yet ───
  if (!isConfigured) {
    document.getElementById('config-banner').innerHTML = `
      <div class="config-warning">
        <strong>Demo not yet connected.</strong> Edit <code>public/supabase-config.js</code> with your Supabase URL and anon key, then refresh. See <code>SUPABASE_SETUP.md</code> for the full setup including the SQL.
      </div>
    `;
  }

  // ─── State + filter chips ───
  const state = { reviews: [], filter: 'all' };
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter;
      renderList();
    });
  });

  // ─── Star rating UI ───
  let selectedRating = 0;
  const starEls = document.querySelectorAll('#r-stars .s');
  function paintStars(n) {
    starEls.forEach((s, i) => s.classList.toggle('on', i < n));
  }
  starEls.forEach((s, i) => {
    s.addEventListener('mouseenter', () => paintStars(i + 1));
    s.addEventListener('click', () => {
      selectedRating = i + 1;
      paintStars(selectedRating);
    });
  });
  document.getElementById('r-stars').addEventListener('mouseleave', () => paintStars(selectedRating));

  // ─── Supabase REST helpers ───
  async function supaFetch(path, init = {}) {
    if (!isConfigured) throw new Error('Supabase not configured');
    const url = `${cfg.url}/rest/v1${path}`;
    const headers = {
      'apikey': cfg.anonKey,
      'Authorization': `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    };
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch {}
      throw new Error(`Supabase ${res.status}: ${detail || res.statusText}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function fetchReviews() {
    return supaFetch('/reviews?select=*&order=created_at.desc&limit=200');
  }

  async function postReview(payload) {
    return supaFetch('/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Prefer': 'return=representation' }
    });
  }

  // ─── Rendering ───
  function roleBadgeClass(role) {
    return ({
      'Farmer': 'farmer',
      'Trader': 'trader',
      'Government Official': 'official',
      'Committee Member': 'committee',
      'Other': 'other'
    })[role] || 'other';
  }

  function renderSummary() {
    const all = state.reviews;
    const container = document.getElementById('review-summary');
    if (all.length === 0) { container.innerHTML = ''; return; }
    const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
    const breakdown = [5, 4, 3, 2, 1].map(n => ({
      n, count: all.filter(r => r.rating === n).length
    }));
    container.innerHTML = `
      <div class="review-summary">
        <div>
          <div class="big-rating">${avg.toFixed(1)}<span class="out"> / 5</span></div>
          <div class="star-line">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</div>
          <div class="count">${all.length} review${all.length === 1 ? '' : 's'}</div>
        </div>
        <div class="breakdown">
          ${breakdown.map(b => `
            <div class="row">
              <span>${b.n}★</span>
              <span class="bar"><span class="fill" style="width:${all.length ? (b.count / all.length) * 100 : 0}%"></span></span>
              <span>${b.count}</span>
            </div>`).join('')}
        </div>
      </div>
    `;
  }

  function renderList() {
    const filtered = state.filter === 'all'
      ? state.reviews
      : state.reviews.filter(r => r.role === state.filter);

    const el = document.getElementById('review-list');
    if (filtered.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="icon">★</div>
          <h3>${state.reviews.length === 0 ? 'Be the first to review PAMRA' : 'No reviews in this category yet'}</h3>
          <p style="margin:0;font-size:13px">${state.reviews.length === 0 ? 'Use the form on the right to share your experience.' : 'Try another filter or be the first in this category.'}</p>
        </div>
      `;
      return;
    }

    el.innerHTML = filtered.map(r => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `
        <div class="review-card">
          <div class="head">
            <div>
              <span class="name">${escapeHtml(r.name)}</span>
              <span class="role-badge ${roleBadgeClass(r.role)}">${escapeHtml(r.role)}</span>
            </div>
            <span class="date">${date}</span>
          </div>
          <div class="rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
          <div class="comment">${escapeHtml(r.comment)}</div>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ─── Submit handler ───
  document.getElementById('review-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('r-msg');
    msgEl.className = 'form-msg';
    msgEl.textContent = '';

    const name = document.getElementById('r-name').value.trim();
    const role = document.getElementById('r-role').value;
    const comment = document.getElementById('r-comment').value.trim();
    const rating = selectedRating;

    if (!name || !role || !comment || !rating) {
      msgEl.className = 'form-msg err';
      msgEl.textContent = rating ? 'Please fill in all fields.' : 'Please give a star rating.';
      return;
    }
    if (!isConfigured) {
      msgEl.className = 'form-msg err';
      msgEl.textContent = 'Supabase is not configured. See SUPABASE_SETUP.md.';
      return;
    }

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const inserted = await postReview({ name, role, rating, comment });
      // postReview returns an array of inserted rows when Prefer:return=representation
      const newRow = Array.isArray(inserted) ? inserted[0] : inserted;
      state.reviews.unshift(newRow);
      renderSummary();
      renderList();
      msgEl.className = 'form-msg ok';
      msgEl.textContent = 'Thank you! Your review has been published.';
      e.target.reset();
      selectedRating = 0;
      paintStars(0);
    } catch (err) {
      msgEl.className = 'form-msg err';
      msgEl.textContent = 'Could not submit: ' + (err.message || 'unknown error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit review';
    }
  });

  // ─── Initial load ───
  (async () => {
    if (!isConfigured) {
      document.getElementById('review-list').innerHTML = `
        <div class="empty-state">
          <div class="icon">⚙</div>
          <h3>Supabase not configured</h3>
          <p style="margin:0;font-size:13px">Add your Supabase project URL and anon key to <code>public/supabase-config.js</code> and refresh this page.</p>
        </div>
      `;
      return;
    }
    try {
      state.reviews = await fetchReviews() || [];
      renderSummary();
      renderList();
    } catch (err) {
      document.getElementById('review-list').innerHTML = `
        <div class="empty-state">
          <div class="icon">⚠</div>
          <h3>Could not load reviews</h3>
          <p style="margin:0;font-size:13px">${escapeHtml(err.message || 'Check that the Supabase URL/key in supabase-config.js are correct and that the reviews table exists.')}</p>
        </div>
      `;
    }
  })();
})();
