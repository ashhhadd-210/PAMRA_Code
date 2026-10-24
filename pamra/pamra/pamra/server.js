const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const { generateBatch } = require('./src/data/simulator');
const { evaluate } = require('./src/engine/authenticityEngine');
const ledger = require('./src/engine/integrityLedger');
const { markets } = require('./src/data/markets');
const { staff: rosterStaff } = require('./src/data/staff');
const gateSim = require('./src/data/gateSimulator');
const mcmis = require('./src/data/mcmisData');
const amis = require('./src/data/amisData');
const { news } = require('./src/data/newsData');
const auth = require('./src/auth');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// ───────── Page routing: serve specific HTML for each module path ─────────
const PUBLIC = path.join(__dirname, 'public');
const sendPage = (file) => (_req, res) => res.sendFile(path.join(PUBLIC, file));

// Public PAMRA website
app.get('/',         sendPage('home.html'));
app.get('/about',    sendPage('about.html'));
app.get('/mission',  sendPage('mission.html'));
app.get('/chairman', sendPage('chairman.html'));
app.get('/patmn',    sendPage('patmn.html'));
app.get('/careers',  sendPage('careers.html'));
app.get('/tenders',  sendPage('tenders.html'));
app.get('/services', sendPage('services.html'));
app.get('/markets',  sendPage('markets.html'));
app.get('/prices',   sendPage('prices.html'));
app.get('/news',     sendPage('news.html'));
app.get('/contact',  sendPage('contact.html'));
app.get('/reviews',  sendPage('reviews.html'));
app.get('/platform-guide', sendPage('platform-guide.html'));

// Unified Market Intelligence Platform (auth-gated)
app.get('/login',     sendPage('login.html'));
app.get('/portal',    sendPage('portal.html'));
app.get('/dashboard', sendPage('dashboard.html'));
app.get('/gate',      sendPage('gate.html'));
app.get('/mcmis',     sendPage('mcmis.html'));
app.get('/amis',      sendPage('amis.html'));
app.get('/reports',   sendPage('reports.html'));
app.get('/ledger',    sendPage('ledger.html'));
app.get('/admin',     sendPage('admin.html'));

// Static assets (CSS/JS) — served after the explicit page routes
app.use(express.static(PUBLIC));

// ───────────────────────── Public API (no auth) ─────────────────────────
// These power the public PAMRA website (homepage, prices page, markets page, news).
app.get('/api/public/markets', (_req, res) => {
  res.json(markets.map(m => ({ id: m.id, name: m.name, lat: m.lat, lng: m.lng })));
});
app.get('/api/public/prices', (_req, res) => {
  // Strip any internal fields — only commodity, market, price, change, arrivals
  res.json(amis.todaySnapshot());
});
app.get('/api/public/news', (_req, res) => res.json(news));

// ───────────────────────── Auth API ─────────────────────────
app.post('/api/auth/staff-login', (req, res) => {
  const { username, password } = req.body || {};
  const result = auth.staffLogin(username, password);
  if (!result) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(result);
});

app.post('/api/auth/logout', auth.requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  auth.logout(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json({ user: req.user, modules: auth.moduleAccess[req.user.role] || [] });
});

// ───────────────────────── Records & engine (Market Intelligence) ─────────────
const STORE_CAP = 500;
const store = [];
const counters = { CLEAN: 0, SUSPECT: 0, QUARANTINED: 0, total: 0 };

function pushRecord(rec) {
  store.push(rec);
  if (store.length > STORE_CAP) store.shift();
  counters[rec.disposition] = (counters[rec.disposition] || 0) + 1;
  counters.total += 1;
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
}

app.get('/api/markets', auth.requireAuth, (_req, res) => res.json(markets));
app.get('/api/staff',   auth.requireAuth, (_req, res) => res.json(rosterStaff));

app.get('/api/records', auth.requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, STORE_CAP);
  res.json({ counters, records: store.slice(-limit).reverse() });
});

app.get('/api/records/:id', auth.requireAuth, (req, res) => {
  const rec = store.find(r => r.record_id === req.params.id);
  if (!rec) return res.status(404).json({ error: 'not found' });
  res.json(rec);
});

app.get('/api/analytics/by-market', auth.requireAuth, (_req, res) => {
  const summary = {};
  store.forEach(r => {
    const k = r.market_id;
    if (!summary[k]) summary[k] = { market_id: k, market_name: r.market_name, CLEAN: 0, SUSPECT: 0, QUARANTINED: 0, total: 0 };
    summary[k][r.disposition] += 1;
    summary[k].total += 1;
  });
  res.json(Object.values(summary));
});

// ───────────────────────── Gate Automation API ─────────────
app.get('/api/gate/trucks', auth.requireAuth, (_req, res) => res.json(gateSim.listActiveTrucks()));
app.get('/api/gate/events', auth.requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 300);
  res.json(gateSim.listRecentEvents(limit));
});

// ───────────────────────── Integrity Ledger API ─────────────
// Append-only, hash-chained record of every sensor-captured truck. Read-only by
// design — there is no edit or delete endpoint. The tamper-demo proves that any
// attempt to alter a sealed value is detected without ever modifying the real chain.
app.get('/api/ledger', auth.requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200);
  res.json({ stats: ledger.stats(), entries: ledger.getChain(limit).reverse() });
});
app.get('/api/ledger/verify', auth.requireAuth, (_req, res) => {
  res.json(ledger.verifyChain());
});
app.post('/api/ledger/tamper-demo', auth.requireAuth, (req, res) => {
  res.json(ledger.tamperDemo(req.body || {}));
});

// ───────────────────────── MCMIS API ─────────────────────
app.get('/api/mcmis/staff', auth.requireAuth, (req, res) => {
  let list = mcmis.staff;
  if (req.query.market) list = list.filter(s => s.market_id === req.query.market);
  res.json(list);
});
app.get('/api/mcmis/finances', auth.requireAuth, (_req, res) => res.json(mcmis.finances));
app.get('/api/mcmis/infra-issues', auth.requireAuth, (_req, res) => res.json(mcmis.infraIssues));
app.get('/api/mcmis/summary', auth.requireAuth, (_req, res) => {
  const total_staff = mcmis.staff.length;
  const present_today = mcmis.staff.filter(s => s.present_today).length;
  const total_revenue = mcmis.finances.reduce((s, f) => s + f.revenue_monthly_pkr, 0);
  const total_pending = mcmis.finances.reduce((s, f) => s + f.pending_dues_pkr, 0);
  const open_issues = mcmis.infraIssues.filter(i => i.status !== 'resolved').length;
  res.json({ total_staff, present_today, total_revenue, total_pending, open_issues, markets: markets.length, ...mcmis.extendedSummary() });
});
app.get('/api/mcmis/licenses', auth.requireAuth, (_req, res) => res.json({ by_market: mcmis.licenses, by_type: mcmis.licenseTypeSummary() }));
app.get('/api/mcmis/auctions', auth.requireAuth, (_req, res) => res.json(mcmis.auctions));
app.get('/api/mcmis/fees', auth.requireAuth, (_req, res) => res.json(mcmis.fees));
app.get('/api/mcmis/revenue-trend', auth.requireAuth, (_req, res) => res.json(mcmis.revenueTrend));
app.get('/api/mcmis/districts', auth.requireAuth, (_req, res) => res.json(mcmis.districtSummary()));

// ───────────────────────── AMIS API ──────────────────────
app.get('/api/amis/today', auth.requireAuth, (_req, res) => res.json(amis.todaySnapshot()));
app.get('/api/amis/history', auth.requireAuth, (req, res) => {
  const { market, commodity } = req.query;
  res.json(amis.commodityHistory(market, commodity));
});
app.get('/api/amis/leaderboard', auth.requireAuth, (req, res) => {
  res.json(amis.priceLeaderboard(req.query.commodity || 'WHEAT'));
});
app.get('/api/amis/commodities', auth.requireAuth, (_req, res) => res.json(amis.commodities));
app.get('/api/amis/meta', auth.requireAuth, (_req, res) => res.json(amis.commodityMeta));
app.get('/api/amis/dates', auth.requireAuth, (_req, res) => res.json(amis.availableDates()));
app.get('/api/amis/snapshot', auth.requireAuth, (req, res) => res.json(amis.snapshotForDate(req.query.date)));
app.get('/api/amis/international', auth.requireAuth, (_req, res) => res.json(amis.internationalPrices()));

// ───────────────────────── Reports API ───────────────────
app.get('/api/reports/list', auth.requireAuth, (_req, res) => {
  res.json([
    { id: 'R-001', title: 'Daily Market Activity Summary',          frequency: 'daily',   last_run: today(),   format: 'PDF' },
    { id: 'R-002', title: 'Weekly Commodity Price Trends',          frequency: 'weekly',  last_run: daysAgo(2), format: 'XLSX' },
    { id: 'R-003', title: 'Monthly Revenue Collection by Market',   frequency: 'monthly', last_run: daysAgo(5), format: 'PDF' },
    { id: 'R-004', title: 'Authenticity Engine Quarantine Log',     frequency: 'daily',   last_run: today(),   format: 'CSV' },
    { id: 'R-005', title: 'Staff Attendance & Performance',          frequency: 'monthly', last_run: daysAgo(7), format: 'PDF' },
    { id: 'R-006', title: 'Infrastructure Issue Tracker',           frequency: 'weekly',  last_run: daysAgo(1), format: 'PDF' },
    { id: 'R-007', title: 'Trader / Vehicle Registration Audit',    frequency: 'monthly', last_run: daysAgo(12),format: 'XLSX'},
    { id: 'R-008', title: 'Surplus / Shortage Forecast',            frequency: 'daily',   last_run: today(),   format: 'PDF' }
  ]);
});
app.get('/api/reports/kpis', auth.requireAuth, (_req, res) => {
  res.json({
    total_records_today: store.length,
    quarantined_today: counters.QUARANTINED,
    revenue_collected_pkr: mcmis.finances.reduce((s, f) => s + f.revenue_monthly_pkr, 0),
    active_markets: markets.length,
    staff_on_duty: mcmis.staff.filter(s => s.present_today).length,
    trucks_processed: gateSim.listRecentEvents(300).filter(e => e.event_type === 'EXITED').length
  });
});
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// ───────────────────────── Admin API ──────────────────────
app.get('/api/admin/users', auth.requireAuth, auth.requireRole('admin'), (_req, res) => {
  res.json(auth.staffUsers.map(u => ({ username: u.username, role: u.role, name: u.name, title: u.title })));
});
app.get('/api/admin/traders', auth.requireAuth, auth.requireRole('admin'), (_req, res) => {
  res.json(auth.traders);
});
app.get('/api/admin/system-health', auth.requireAuth, auth.requireRole('admin'), (_req, res) => {
  res.json({
    uptime_seconds: Math.round(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    record_store_size: store.length,
    active_trucks: gateSim.listActiveTrucks().length,
    ws_clients: wss.clients.size,
    adapters: [
      { source: 'MCMIS',     status: 'healthy', last_sync: 'just now' },
      { source: 'AMIS',      status: 'healthy', last_sync: 'just now' },
      { source: 'MANDI_APP', status: 'healthy', last_sync: 'just now' },
      { source: 'GATE_AUTO', status: 'healthy', last_sync: 'just now' }
    ]
  });
});

// ───────────────────────── WebSocket ──────────────────────
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'init',
    counters,
    records: store.slice(-50).reverse(),
    trucks: gateSim.listActiveTrucks(),
    events: gateSim.listRecentEvents(30),
    ledger: { stats: ledger.stats(), entries: ledger.getChain(12).reverse() }
  }));
});

// ───────── Simulation tick: market records ─────────
function tickRecords() {
  const batch = generateBatch();
  batch.forEach(raw => {
    const evaluated = evaluate(raw);
    pushRecord(evaluated);
    broadcast({ type: 'record', record: evaluated, counters });
  });
}

// ───────── Start gate simulator: feeds arrival records into engine on EXITED ─────────
gateSim.start(broadcast, (gateGeneratedRecord) => {
  const evaluated = evaluate(gateGeneratedRecord);
  pushRecord(evaluated);
  broadcast({ type: 'record', record: evaluated, counters });
  // Seal the sensor-captured facts into the append-only integrity ledger.
  const block = ledger.seal(evaluated);
  broadcast({ type: 'ledger_seal', entry: block, stats: ledger.stats() });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`PAMRA Unified Platform running at http://localhost:${PORT}`);
  console.log('Staff accounts (only path into the platform):');
  console.log('  admin/admin123  ·  inspector/insp123  ·  analyst/analyst123  ·  committee/comm123');
  console.log('Trader records are stored in PAMRA but traders do not sign in.');
  setInterval(tickRecords, 1500);
});
