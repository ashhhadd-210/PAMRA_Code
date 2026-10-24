// ─────────────────────────────────────────────────────────────────────────────
// PAMRA in-browser runtime (static / Vercel build).
//
// This file is appended to the bundled backend modules by build-bundle.js to
// produce public/pamra-backend.js. It is the browser-side replacement for
// server.js: it runs the same simulators + engine + ledger entirely client-side,
// overrides window.fetch for /api/* so every existing page works unchanged, and
// exposes a tiny pub/sub bus (PAMRA_RUNTIME.subscribe) in place of the WebSocket.
//
// State lives for the lifetime of the page (a reload restarts the simulation),
// which is the right model for a serverless static demo with no database.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  const B = window.PAMRA_BACKEND;
  if (!B) { console.error('PAMRA backend bundle missing'); return; }

  const { evaluate } = B.engine;
  const ledger = B.ledger;
  const gateSim = B.gateSim;
  const { generateBatch } = B.simulator;
  const auth = B.auth;
  const marketsMod = B.markets;
  const markets = marketsMod.markets;
  const amis = B.amis;
  const mcmis = B.mcmis;
  const news = B.news.news;
  const rosterStaff = B.staff.staff;

  // ───────── Record store + counters (mirrors server.js) ─────────
  const STORE_CAP = 500;
  const store = [];
  const counters = { CLEAN: 0, SUSPECT: 0, QUARANTINED: 0, total: 0 };
  function pushRecord(rec) {
    store.push(rec);
    if (store.length > STORE_CAP) store.shift();
    counters[rec.disposition] = (counters[rec.disposition] || 0) + 1;
    counters.total += 1;
  }

  // ───────── Pub/sub bus (replaces WebSocket broadcast) ─────────
  const subs = new Set();
  function broadcast(msg) {
    subs.forEach((fn) => { try { fn(msg); } catch (e) { /* ignore subscriber errors */ } });
  }

  // ───────── Simulators ─────────
  function tickRecords() {
    generateBatch().forEach((raw) => {
      const evaluated = evaluate(raw);
      pushRecord(evaluated);
      broadcast({ type: 'record', record: evaluated, counters });
    });
  }

  gateSim.start(broadcast, (gateGeneratedRecord) => {
    const evaluated = evaluate(gateGeneratedRecord);
    pushRecord(evaluated);
    broadcast({ type: 'record', record: evaluated, counters });
    const block = ledger.seal(evaluated);
    broadcast({ type: 'ledger_seal', entry: block, stats: ledger.stats() });
  });

  // ───────── Pre-seed so a freshly loaded page is not empty ─────────
  // The gate flow takes ~30s to produce its first sealed block, so we seed a
  // handful of records + ledger blocks synchronously at startup.
  function seed() {
    for (let i = 0; i < 8; i++) tickRecords();
    const commodities = marketsMod.commodities;
    const baseline = marketsMod.priceBaseline;
    const traders = auth.traders;
    for (let i = 0; i < 6; i++) {
      const mk = markets[i % markets.length];
      const tr = traders[i % traders.length];
      const commodity = commodities[i % commodities.length];
      const tare = 9000 + ((i * 137) % 3000);
      const net = 8000 + ((i * 523) % 18000);
      const gross = tare + net;
      const now = new Date().toISOString();
      const rec = {
        record_id: 'SEED-' + i,
        source: 'GATE_AUTO',
        market_id: mk.id,
        market_name: mk.name,
        commodity,
        lot_volume_kg: net,
        price_per_kg: +(baseline[commodity].mean).toFixed(2),
        auction_timestamp: now,
        staff_id: 'GATE-AUTO-01',
        geo: { lat: mk.lat, lng: mk.lng },
        external_ref: 'SEED',
        submitted_at: now,
        _gate_meta: {
          plate: tr.vehicles[0], cnic: tr.cnic, driver: tr.name,
          gross_kg: gross, tare_kg: tare,
          flags: { plateRegistered: true, driverRegistered: true, cnicMatchesPlate: true, commodityMatchesDeclared: true }
        }
      };
      const ev = evaluate(rec);
      pushRecord(ev);
      ledger.seal(ev);
    }
  }
  seed();
  setInterval(tickRecords, 1500);

  // ───────── Auth helpers (stateless; backed by localStorage) ─────────
  function currentUser() {
    try {
      if (!localStorage.getItem('pamra_token')) return null;
      return JSON.parse(localStorage.getItem('pamra_user') || 'null');
    } catch (e) { return null; }
  }

  // ───────── Report helpers (mirror server.js) ─────────
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  // ───────── API router — returns { status, data } ─────────
  function route(pathname, query, body) {
    const ok = (data) => ({ status: 200, data });
    const err = (status, data) => ({ status, data });

    // Public (no auth)
    if (pathname === '/api/public/markets') return ok(markets.map((m) => ({ id: m.id, name: m.name, lat: m.lat, lng: m.lng })));
    if (pathname === '/api/public/prices') return ok(amis.todaySnapshot());
    if (pathname === '/api/public/news') return ok(news);

    // Auth
    if (pathname === '/api/auth/staff-login') {
      const result = auth.staffLogin(body.username, body.password);
      if (!result) return err(401, { error: 'Invalid credentials' });
      return ok(result);
    }
    if (pathname === '/api/auth/logout') return ok({ ok: true });
    if (pathname === '/api/auth/me') {
      const user = currentUser();
      if (!user) return err(401, { error: 'unauthorized' });
      return ok({ user, modules: auth.moduleAccess[user.role] || [] });
    }

    // Everything below requires auth
    const user = currentUser();
    if (!user) return err(401, { error: 'unauthorized' });

    if (pathname === '/api/markets') return ok(markets);
    if (pathname === '/api/staff') return ok(rosterStaff);

    if (pathname === '/api/records') {
      const limit = Math.min(parseInt(query.limit, 10) || 100, STORE_CAP);
      return ok({ counters, records: store.slice(-limit).reverse() });
    }
    if (pathname.startsWith('/api/records/')) {
      const id = decodeURIComponent(pathname.slice('/api/records/'.length));
      const rec = store.find((r) => r.record_id === id);
      if (!rec) return err(404, { error: 'not found' });
      return ok(rec);
    }
    if (pathname === '/api/analytics/by-market') {
      const summary = {};
      store.forEach((r) => {
        const k = r.market_id;
        if (!summary[k]) summary[k] = { market_id: k, market_name: r.market_name, CLEAN: 0, SUSPECT: 0, QUARANTINED: 0, total: 0 };
        summary[k][r.disposition] += 1;
        summary[k].total += 1;
      });
      return ok(Object.values(summary));
    }

    // Gate
    if (pathname === '/api/gate/trucks') return ok(gateSim.listActiveTrucks());
    if (pathname === '/api/gate/events') {
      const limit = Math.min(parseInt(query.limit, 10) || 50, 300);
      return ok(gateSim.listRecentEvents(limit));
    }

    // Integrity Ledger
    if (pathname === '/api/ledger') {
      const limit = Math.min(parseInt(query.limit, 10) || 25, 200);
      return ok({ stats: ledger.stats(), entries: ledger.getChain(limit).reverse() });
    }
    if (pathname === '/api/ledger/verify') return ok(ledger.verifyChain());
    if (pathname === '/api/ledger/tamper-demo') return ok(ledger.tamperDemo(body || {}));

    // MCMIS
    if (pathname === '/api/mcmis/staff') {
      let list = mcmis.staff;
      if (query.market) list = list.filter((s) => s.market_id === query.market);
      return ok(list);
    }
    if (pathname === '/api/mcmis/finances') return ok(mcmis.finances);
    if (pathname === '/api/mcmis/infra-issues') return ok(mcmis.infraIssues);
    if (pathname === '/api/mcmis/summary') {
      const total_staff = mcmis.staff.length;
      const present_today = mcmis.staff.filter((s) => s.present_today).length;
      const total_revenue = mcmis.finances.reduce((s, f) => s + f.revenue_monthly_pkr, 0);
      const total_pending = mcmis.finances.reduce((s, f) => s + f.pending_dues_pkr, 0);
      const open_issues = mcmis.infraIssues.filter((i) => i.status !== 'resolved').length;
      return ok({ total_staff, present_today, total_revenue, total_pending, open_issues, markets: markets.length, ...mcmis.extendedSummary() });
    }
    if (pathname === '/api/mcmis/licenses') return ok({ by_market: mcmis.licenses, by_type: mcmis.licenseTypeSummary() });
    if (pathname === '/api/mcmis/auctions') return ok(mcmis.auctions);
    if (pathname === '/api/mcmis/fees') return ok(mcmis.fees);
    if (pathname === '/api/mcmis/revenue-trend') return ok(mcmis.revenueTrend);
    if (pathname === '/api/mcmis/districts') return ok(mcmis.districtSummary());

    // AMIS
    if (pathname === '/api/amis/today') return ok(amis.todaySnapshot());
    if (pathname === '/api/amis/history') return ok(amis.commodityHistory(query.market, query.commodity));
    if (pathname === '/api/amis/leaderboard') return ok(amis.priceLeaderboard(query.commodity || 'WHEAT'));
    if (pathname === '/api/amis/commodities') return ok(amis.commodities);
    if (pathname === '/api/amis/meta') return ok(amis.commodityMeta);
    if (pathname === '/api/amis/dates') return ok(amis.availableDates());
    if (pathname === '/api/amis/snapshot') return ok(amis.snapshotForDate(query.date));
    if (pathname === '/api/amis/international') return ok(amis.internationalPrices());

    // Reports
    if (pathname === '/api/reports/list') {
      return ok([
        { id: 'R-001', title: 'Daily Market Activity Summary',        frequency: 'daily',   last_run: today(),    format: 'PDF' },
        { id: 'R-002', title: 'Weekly Commodity Price Trends',        frequency: 'weekly',  last_run: daysAgo(2), format: 'XLSX' },
        { id: 'R-003', title: 'Monthly Revenue Collection by Market', frequency: 'monthly', last_run: daysAgo(5), format: 'PDF' },
        { id: 'R-004', title: 'Authenticity Engine Quarantine Log',   frequency: 'daily',   last_run: today(),    format: 'CSV' },
        { id: 'R-005', title: 'Staff Attendance & Performance',        frequency: 'monthly', last_run: daysAgo(7), format: 'PDF' },
        { id: 'R-006', title: 'Infrastructure Issue Tracker',         frequency: 'weekly',  last_run: daysAgo(1), format: 'PDF' },
        { id: 'R-007', title: 'Trader / Vehicle Registration Audit',  frequency: 'monthly', last_run: daysAgo(12), format: 'XLSX' },
        { id: 'R-008', title: 'Surplus / Shortage Forecast',          frequency: 'daily',   last_run: today(),    format: 'PDF' }
      ]);
    }
    if (pathname === '/api/reports/kpis') {
      return ok({
        total_records_today: store.length,
        quarantined_today: counters.QUARANTINED,
        revenue_collected_pkr: mcmis.finances.reduce((s, f) => s + f.revenue_monthly_pkr, 0),
        active_markets: markets.length,
        staff_on_duty: mcmis.staff.filter((s) => s.present_today).length,
        trucks_processed: gateSim.listRecentEvents(300).filter((e) => e.event_type === 'EXITED').length
      });
    }

    // Admin (admin role only)
    if (pathname.startsWith('/api/admin/')) {
      if (user.role !== 'admin') return err(403, { error: 'forbidden', required: ['admin'] });
      if (pathname === '/api/admin/users') return ok(auth.staffUsers.map((u) => ({ username: u.username, role: u.role, name: u.name, title: u.title })));
      if (pathname === '/api/admin/traders') return ok(auth.traders);
      if (pathname === '/api/admin/system-health') {
        return ok({
          uptime_seconds: Math.round((Date.now() - START_TS) / 1000),
          memory_mb: 0,
          record_store_size: store.length,
          active_trucks: gateSim.listActiveTrucks().length,
          ws_clients: subs.size,
          adapters: [
            { source: 'MCMIS', status: 'healthy', last_sync: 'just now' },
            { source: 'AMIS', status: 'healthy', last_sync: 'just now' },
            { source: 'MANDI_APP', status: 'healthy', last_sync: 'just now' },
            { source: 'GATE_AUTO', status: 'healthy', last_sync: 'just now' }
          ]
        });
      }
    }

    return err(404, { error: 'not found', path: pathname });
  }
  const START_TS = Date.now();

  // ───────── fetch() override for /api/* ─────────
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    let parsed;
    try { parsed = new URL(url, location.origin); } catch (e) { parsed = null; }
    if (parsed && parsed.pathname.startsWith('/api/')) {
      const query = {};
      parsed.searchParams.forEach((v, k) => { query[k] = v; });
      let body = {};
      if (init && init.body) { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }
      const res = route(parsed.pathname, query, body);
      return Promise.resolve(new Response(JSON.stringify(res.data), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    if (!nativeFetch) return Promise.reject(new Error('fetch unavailable'));
    return nativeFetch(input, init);
  };

  // ───────── subscribe() — WebSocket replacement ─────────
  function subscribe(handler) {
    subs.add(handler);
    // Immediately deliver the init snapshot, exactly like the server's WS on-connect.
    try {
      handler({
        type: 'init',
        counters,
        records: store.slice(-50).reverse(),
        trucks: gateSim.listActiveTrucks(),
        events: gateSim.listRecentEvents(30),
        ledger: { stats: ledger.stats(), entries: ledger.getChain(12).reverse() }
      });
    } catch (e) { /* ignore */ }
    return () => subs.delete(handler);
  }

  window.PAMRA_RUNTIME = { subscribe, route };
})();
