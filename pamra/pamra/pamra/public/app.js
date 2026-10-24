// PAMRA Unified Platform — dashboard client

const state = {
  records: [],
  marketFilter: null,
  filters: { CLEAN: true, SUSPECT: true, QUARANTINED: true },
  layerCounts: { cross_source: 0, statistical: 0, geo_staff: 0, ml_fraud: 0 },
  marketTotals: {} // market_id -> { CLEAN, SUSPECT, QUARANTINED }
};

const FEED_CAP = 80;

// ───────────────────────────── Map ─────────────────────────────
const map = L.map('map').setView([31.0, 72.5], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 18
}).addTo(map);

const markerByMarket = {};

PAMRA.api('/api/markets').then(markets => {
  markets.forEach(m => {
    const marker = L.circleMarker([m.lat, m.lng], {
      radius: 10,
      fillColor: '#186b34',
      color: 'white',
      weight: 2,
      fillOpacity: 0.9
    }).addTo(map);
    marker.bindTooltip(m.name, { permanent: false });
    marker.on('click', () => {
      state.marketFilter = state.marketFilter === m.id ? null : m.id;
      renderFeed();
      updateMarkerHighlights();
    });
    markerByMarket[m.id] = marker;
  });
});

function updateMarkerHighlights() {
  Object.entries(markerByMarket).forEach(([id, mk]) => {
    if (state.marketFilter && id !== state.marketFilter) {
      mk.setStyle({ fillOpacity: 0.3, radius: 8 });
    } else {
      const tot = state.marketTotals[id];
      const danger = tot ? (tot.QUARANTINED + tot.SUSPECT) / Math.max(tot.CLEAN + tot.SUSPECT + tot.QUARANTINED, 1) : 0;
      mk.setStyle({
        fillOpacity: 0.9,
        radius: 10 + Math.min((tot ? tot.QUARANTINED : 0) * 0.6, 12),
        fillColor: danger > 0.4 ? '#b8312f' : danger > 0.15 ? '#d98c1f' : '#186b34'
      });
    }
  });
}

// ───────────────────────────── Feed ─────────────────────────────
const feedEl = document.getElementById('feed');

function renderFeed() {
  const visible = state.records
    .filter(r => state.filters[r.disposition])
    .filter(r => !state.marketFilter || r.market_id === state.marketFilter)
    .slice(0, FEED_CAP);

  feedEl.innerHTML = visible.map(r => {
    const failedLayer = r.layers.find(l => l.verdict === 'fail');
    const warnLayer = !failedLayer && r.layers.find(l => l.verdict === 'warn');
    const reason = failedLayer ? failedLayer.reason : warnLayer ? warnLayer.reason : '';
    return `
      <div class="feed-item ${r.disposition}" data-id="${r.record_id}">
        <div class="row1">
          <span><span class="src">${r.source}</span>${r.commodity} · ${r.market_name}</span>
          <span>${r.price_per_kg} PKR/kg</span>
        </div>
        <div class="row2">
          ${r.lot_volume_kg.toLocaleString()} kg · staff ${r.staff_id} · score ${(r.fraud_score).toFixed(2)}
        </div>
        ${reason ? `<div class="reason">${reason}</div>` : ''}
      </div>`;
  }).join('');

  feedEl.querySelectorAll('.feed-item').forEach(el => {
    el.addEventListener('click', () => openDrawer(el.dataset.id));
  });
}

['clean', 'suspect', 'quarantined'].forEach(name => {
  document.getElementById(`f-${name}`).addEventListener('change', (e) => {
    state.filters[name.toUpperCase()] = e.target.checked;
    renderFeed();
  });
});

// ──────────────────────── Layer + market stats ─────────────────────
function updateLayerStats() {
  const max = Math.max(...Object.values(state.layerCounts), 1);
  Object.entries(state.layerCounts).forEach(([layer, count]) => {
    const row = document.querySelector(`.layer-row[data-layer="${layer}"]`);
    if (!row) return;
    row.querySelector('.layer-count').textContent = count;
    row.querySelector('.layer-fill').style.width = `${(count / max) * 100}%`;
  });
}

function updateMarketStats() {
  const rows = Object.entries(state.marketTotals)
    .map(([id, t]) => ({
      id,
      ...t,
      total: t.CLEAN + t.SUSPECT + t.QUARANTINED,
      bad: t.SUSPECT + t.QUARANTINED
    }))
    .sort((a, b) => b.bad - a.bad)
    .slice(0, 10);

  const html = rows.map(r => `
    <div class="market-row">
      <span>${r.name}</span>
      <span class="badge c">${r.CLEAN}</span>
      <span class="badge s">${r.SUSPECT}</span>
      <span class="badge q">${r.QUARANTINED}</span>
    </div>
  `).join('');
  document.getElementById('market-stats').innerHTML = html || '<div style="color:#94a3b8;font-size:12px;padding:8px">no records yet</div>';
}

// ──────────────────────── Drawer ──────────────────────────────────
async function openDrawer(id) {
  let r;
  try { r = await PAMRA.api(`/api/records/${id}`); } catch { return; }
  const html = `
    <h3>Record audit · ${r.record_id}</h3>
    <div class="disposition-banner ${r.disposition}">${r.disposition}</div>
    <dl class="kv">
      <dt>Source</dt><dd>${r.source}</dd>
      <dt>Market</dt><dd>${r.market_name} (${r.market_id})</dd>
      <dt>Commodity</dt><dd>${r.commodity}</dd>
      <dt>Volume</dt><dd>${r.lot_volume_kg.toLocaleString()} kg</dd>
      <dt>Price</dt><dd>${r.price_per_kg} PKR/kg</dd>
      <dt>Auction time</dt><dd>${new Date(r.auction_timestamp).toLocaleString()}</dd>
      <dt>Staff</dt><dd>${r.staff_id}</dd>
      <dt>GPS</dt><dd>${r.geo.lat.toFixed(4)}, ${r.geo.lng.toFixed(4)}</dd>
      <dt>External ref</dt><dd>${r.external_ref}</dd>
      <dt>Fraud score</dt><dd>${r.fraud_score.toFixed(3)}</dd>
      ${r._truth ? `<dt>Ground truth*</dt><dd style="color:#b8312f">${r._truth}</dd>` : ''}
    </dl>
    <h4 style="margin-bottom:6px">Engine layers</h4>
    ${r.layers.map(l => `
      <div class="layer-card ${l.verdict}">
        <div class="lh"><span>${prettyLayer(l.layer)}</span><span>${l.verdict.toUpperCase()}</span></div>
        <div class="lr">${l.reason}</div>
        ${l.features ? `<div class="lr" style="font-family:monospace;font-size:11px;color:#64748b;margin-top:6px">${formatFeatures(l.features)}</div>` : ''}
      </div>
    `).join('')}
    ${r._truth ? '<p style="font-size:11px;color:#94a3b8;margin-top:14px">* Ground-truth label is shown for demo only — in production this is what the engine is trying to predict.</p>' : ''}
  `;
  document.getElementById('drawer-content').innerHTML = html;
  document.getElementById('drawer').classList.remove('hidden');
}
function closeDrawer() { document.getElementById('drawer').classList.add('hidden'); }
window.closeDrawer = closeDrawer;

function prettyLayer(l) {
  return ({ cross_source: 'Layer 1 · Cross-source', statistical: 'Layer 2 · Statistical', geo_staff: 'Layer 3 · Geo + staff', ml_fraud: 'Layer 4 · ML fraud' })[l] || l;
}
function formatFeatures(f) {
  return Object.entries(f).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`).join(' · ');
}

// ──────────────────────── Counters + ingest ─────────────────────
function applyCounters(c) {
  document.getElementById('count-clean').textContent = c.CLEAN || 0;
  document.getElementById('count-suspect').textContent = c.SUSPECT || 0;
  document.getElementById('count-quarantined').textContent = c.QUARANTINED || 0;
  document.getElementById('count-total').textContent = c.total || 0;
}

function ingest(rec) {
  state.records.unshift(rec);
  if (state.records.length > FEED_CAP * 3) state.records.pop();

  // Layer counts (count records that triggered each layer with warn/fail)
  rec.layers.forEach(l => {
    if (l.verdict === 'warn' || l.verdict === 'fail') {
      state.layerCounts[l.layer] = (state.layerCounts[l.layer] || 0) + 1;
    }
  });

  // Market totals
  const m = state.marketTotals[rec.market_id] || { name: rec.market_name, CLEAN: 0, SUSPECT: 0, QUARANTINED: 0 };
  m[rec.disposition] += 1;
  state.marketTotals[rec.market_id] = m;
}

// ──────────────────────── Live stream (in-browser bus) ─────────────────────
const wsStatus = document.getElementById('ws-status');
wsStatus.textContent = 'live';
wsStatus.style.background = 'rgba(74,222,128,0.3)';

window.PAMRA_RUNTIME.subscribe((msg) => {
  if (msg.type === 'init') {
    msg.records.forEach(ingest);
    applyCounters(msg.counters);
    renderFeed(); updateLayerStats(); updateMarketStats(); updateMarkerHighlights();
  } else if (msg.type === 'record') {
    ingest(msg.record);
    applyCounters(msg.counters);
    renderFeed(); updateLayerStats(); updateMarketStats(); updateMarkerHighlights();
  }
});
