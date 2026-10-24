// Shared chrome (header + footer + language) for the public PAMRA website.
// Every public page calls SitePublic.render(activePage).

window.SitePublic = (() => {
  function render(activePage) {
    renderHeader(activePage);
    renderFooter();
    // After both are in the DOM, apply translations.
    if (window.PAMRA_LANG) window.PAMRA_LANG.apply();
  }

  function renderHeader(activePage) {
    const slot = document.getElementById('site-header-slot');
    if (!slot) return;
    const nav = [
      { id: 'home',     href: '/',         key: 'nav_home' },
      { id: 'about',    href: '/about',    key: 'nav_about' },
      { id: 'patmn',    href: '/patmn',    key: 'nav_patmn' },
      { id: 'services', href: '/services', key: 'nav_services' },
      { id: 'markets',  href: '/markets',  key: 'nav_markets' },
      { id: 'prices',   href: '/prices',   key: 'nav_prices' },
      { id: 'news',     href: '/news',     key: 'nav_news' },
      { id: 'reviews',  href: '/reviews',  key: 'nav_reviews' },
      { id: 'contact',  href: '/contact',  key: 'nav_contact' },
      { id: 'guide',    href: '/platform-guide', key: 'nav_guide' }
    ];

    const hasSession = !!localStorage.getItem('pamra_token');
    const portalKey = hasSession ? 'btn_my_portal' : 'btn_platform_login';
    const portalHref = hasSession ? '/portal' : '/login';

    slot.innerHTML = `
      <div class="gov-bar">
        <div class="container">
          <div class="left">
            <span data-i18n="gov_punjab">Government of Punjab</span>
            <span class="hide-mobile">·</span>
            <span class="hide-mobile" data-i18n="gov_dept">Department of Agriculture</span>
          </div>
          <div class="right">
            <div class="lang-toggle" role="group" aria-label="Language">
              <button data-lang="en" onclick="PAMRA_LANG.set('en')">EN</button>
              <button data-lang="ur" onclick="PAMRA_LANG.set('ur')">اردو</button>
            </div>
            <span>·</span>
            <a href="mailto:info@pamra.punjab.gov.pk">info@pamra.punjab.gov.pk</a>
            <span class="hide-mobile">·</span>
            <a href="tel:+924299231400" class="hide-mobile">+92-42-99231400</a>
          </div>
        </div>
      </div>
      <header class="site-header">
        <div class="container">
          <a href="/" class="brand-link">
            <div class="brand-mark">PAMRA<span class="sub">PUNJAB</span></div>
            <div class="brand-text">
              <div class="l1" data-i18n="brand_l1">Punjab Agricultural Marketing Regulatory Authority</div>
              <div class="l2" data-i18n="brand_l2">Regulator of agricultural produce markets in Punjab, Pakistan</div>
            </div>
          </a>
          <nav class="site-nav">
            ${nav.map(n => `<a href="${n.href}" class="${n.id === activePage ? 'active' : ''}" data-i18n="${n.key}">${n.key}</a>`).join('')}
          </nav>
          <a href="${portalHref}" class="portal-btn" data-i18n="${portalKey}">${portalKey}</a>
        </div>
      </header>
    `;
  }

  function renderFooter() {
    const slot = document.getElementById('site-footer-slot');
    if (!slot) return;
    slot.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="grid">
            <div class="brand-block">
              <div class="brand-mark">PAMRA<span class="sub">PUNJAB</span></div>
              <p data-i18n="brand_l1">Punjab Agricultural Marketing Regulatory Authority</p>
              <p style="margin-top:8px;font-size:12px;opacity:0.6">Established 2018 · PAMRA Act XII of 2018</p>
            </div>
            <div>
              <h4 data-i18n="foot_about">About</h4>
              <ul>
                <li><a href="/about" data-i18n="foot_mandate">Our Mandate</a></li>
                <li><a href="/mission" data-i18n="foot_mission">Mission &amp; Mandate</a></li>
                <li><a href="/chairman" data-i18n="foot_chairman">Chairman's Message</a></li>
                <li><a href="/careers" data-i18n="foot_careers">Careers</a></li>
                <li><a href="/tenders" data-i18n="foot_tenders">Tenders</a></li>
                <li><a href="/news" data-i18n="foot_notif">Notifications</a></li>
              </ul>
            </div>
            <div>
              <h4 data-i18n="foot_services">Services</h4>
              <ul>
                <li><a href="/services" data-i18n="foot_farmers">For Farmers</a></li>
                <li><a href="/services" data-i18n="foot_traders">For Traders</a></li>
                <li><a href="/services" data-i18n="foot_committees">For Committees</a></li>
                <li><a href="/prices" data-i18n="foot_dailyp">Daily Prices</a></li>
                <li><a href="/markets" data-i18n="foot_dir">Market Directory</a></li>
              </ul>
            </div>
            <div>
              <h4 data-i18n="foot_platform">Platform</h4>
              <ul>
                <li><a href="/login" data-i18n="foot_signin">Sign in</a></li>
                <li><a href="/platform-guide" data-i18n="foot_guide">Platform Guide</a></li>
                <li><a href="/services#platform" data-i18n="foot_intel">Market Intelligence</a></li>
                <li><a href="/services#gate" data-i18n="foot_gate">Gate Automation</a></li>
                <li><a href="/contact" data-i18n="foot_support">Support</a></li>
              </ul>
            </div>
          </div>
          <div class="copyright">
            © ${new Date().getFullYear()} <span data-i18n="foot_copy">Government of Punjab · Punjab Agricultural Marketing Regulatory Authority. All rights reserved.</span>
          </div>
        </div>
      </footer>
    `;
  }

  function formatPkr(n) {
    if (n >= 1e7) return `Rs ${(n / 1e7).toFixed(2)}cr`;
    if (n >= 1e5) return `Rs ${(n / 1e5).toFixed(2)}L`;
    return `Rs ${n.toLocaleString()}`;
  }

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('fetch failed: ' + path);
    return res.json();
  }

  return { render, formatPkr, fetchJson };
})();
