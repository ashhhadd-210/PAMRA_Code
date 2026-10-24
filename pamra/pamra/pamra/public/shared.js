// Shared client helpers: session management, header rendering, API wrappers.
// Every protected page calls await PAMRA.requireAuth() before doing anything.

window.PAMRA = (() => {
  const TOKEN_KEY = 'pamra_token';
  const USER_KEY = 'pamra_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      clearSession();
      if (location.pathname !== '/login') location.href = '/login';
      throw new Error('unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw err;
    }
    return res.json();
  }

  async function requireAuth() {
    if (!getToken()) { location.href = '/login'; return null; }
    try {
      const me = await api('/api/auth/me');
      setSession(getToken(), me.user); // refresh
      return me;
    } catch {
      location.href = '/login';
      return null;
    }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    clearSession();
    location.href = '/login';
  }

  // Render the shared header into <div id="pamra-header-slot"></div>.
  function renderHeader(activeModule) {
    const slot = document.getElementById('pamra-header-slot');
    if (!slot) return;
    const user = getUser();
    if (!user) return;

    // Nav items based on role
    const allModules = [
      { id: 'portal',    href: '/portal',    label: 'Portal',  roles: ['admin','inspector','analyst','committee','trader'] },
      { id: 'dashboard', href: '/dashboard', label: 'Market Intel', roles: ['admin','inspector','analyst','committee'] },
      { id: 'gate',      href: '/gate',      label: 'Gate Automation', roles: ['admin','inspector'] },
      { id: 'ledger',    href: '/ledger',    label: 'Integrity Ledger', roles: ['admin','inspector'] },
      { id: 'mcmis',     href: '/mcmis',     label: 'MCMIS',   roles: ['admin','inspector','committee'] },
      { id: 'amis',      href: '/amis',      label: 'AMIS',    roles: ['admin','analyst','trader'] },
      { id: 'reports',   href: '/reports',   label: 'Reports', roles: ['admin','inspector','analyst','committee'] },
      { id: 'admin',     href: '/admin',     label: 'Admin',   roles: ['admin'] }
    ];
    const visible = allModules.filter(m => m.roles.includes(user.role));

    const initials = (user.name || user.cnic || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const displayName = user.name || user.cnic;
    const sub = user.title || (user.kind === 'trader' ? `Registered Trader` : user.role);

    slot.innerHTML = `
      <header class="pamra-header">
        <div class="pamra-brand">
          <div class="pamra-mark">PAMRA<span class="tag">PUNJAB</span></div>
          <div class="pamra-titles">
            <div class="l1">Unified Market Intelligence Platform</div>
            <div class="l2">Government of Punjab · Agricultural Marketing Regulatory Authority</div>
          </div>
        </div>
        <nav class="pamra-nav">
          ${visible.map(m => `<a href="${m.href}" class="${m.id === activeModule ? 'active' : ''}">${m.label}</a>`).join('')}
        </nav>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="help-mode-hint" title="Hover any ⓘ for help"><span class="icon">i</span>Hover for help</span>
          <div class="pamra-user">
            <div class="avatar">${initials}</div>
            <div class="meta">
              <div class="name">${displayName}</div>
              <div class="role">${sub}</div>
            </div>
            <button onclick="PAMRA.logout()">Sign out</button>
          </div>
        </div>
      </header>
    `;
  }

  function formatPkr(n) {
    if (n >= 1e7) return `Rs ${(n / 1e7).toFixed(2)}cr`;
    if (n >= 1e5) return `Rs ${(n / 1e5).toFixed(2)}L`;
    return `Rs ${n.toLocaleString()}`;
  }

  function formatNumber(n) { return n.toLocaleString(); }

  // ─── Inline help tooltips ───
  // Any element with [data-help="message"] gets an auto-injected ⓘ icon
  // that shows the message on hover (or tap). Purpose: tell users what
  // a button/feature does without forcing them to read documentation.
  function setupHelp() {
    // Ensure the tooltip element exists
    let tip = document.getElementById('help-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'help-tooltip';
      tip.innerHTML = '<span class="help-purpose">Purpose</span><span class="help-text"></span>';
      document.body.appendChild(tip);
    }
    const tipText = tip.querySelector('.help-text');

    function showTip(target) {
      const msg = target.dataset.helpMessage;
      if (!msg) return;
      tipText.textContent = msg;
      tip.classList.add('visible');
      // Position: prefer below the icon
      const r = target.getBoundingClientRect();
      const margin = 12;
      const tipRect = tip.getBoundingClientRect();
      let top = r.bottom + 8;
      let arrow = 'up';
      // Flip above if there's no room below
      if (top + tipRect.height + margin > window.innerHeight) {
        top = r.top - tipRect.height - 8;
        arrow = 'down';
      }
      let left = r.left;
      if (left + tipRect.width + margin > window.innerWidth) {
        left = window.innerWidth - tipRect.width - margin;
      }
      if (left < margin) left = margin;
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
      tip.dataset.arrow = arrow;
    }
    function hideTip() {
      tip.classList.remove('visible');
    }

    // Auto-inject ⓘ icons for elements that have data-help
    function injectIcons() {
      document.querySelectorAll('[data-help]:not([data-help-bound])').forEach(el => {
        el.dataset.helpBound = '1';
        const icon = document.createElement('span');
        icon.className = 'help-icon';
        icon.textContent = 'i';
        icon.setAttribute('aria-label', 'Help');
        icon.dataset.helpMessage = el.dataset.help;
        // Insert at end so the icon trails the label
        el.appendChild(icon);
        icon.addEventListener('mouseenter', () => showTip(icon));
        icon.addEventListener('mouseleave', hideTip);
        icon.addEventListener('click', (e) => {
          e.stopPropagation();
          // Touch: toggle visibility for a short while
          if (tip.classList.contains('visible')) hideTip();
          else { showTip(icon); setTimeout(hideTip, 4000); }
        });
      });
    }

    injectIcons();
    // Watch for dynamically rendered content (dashboards, tables, etc.)
    const mo = new MutationObserver(() => injectIcons());
    mo.observe(document.body, { childList: true, subtree: true });

    // Hide tooltip when scrolling
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  // Auto-init on every platform page
  document.addEventListener('DOMContentLoaded', setupHelp);

  return { api, requireAuth, logout, renderHeader, getUser, getToken, setSession, clearSession, formatPkr, formatNumber, setupHelp };
})();
