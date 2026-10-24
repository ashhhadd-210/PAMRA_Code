// Integrity Ledger client — renders the hash-chained ledger, live-appends new
// sealed blocks over WebSocket, and drives the verify + tamper-demo actions.

let chain = [];        // newest-first
let stats = null;
let brokenSeqs = new Set();

(async function init() {
  const me = await PAMRA.requireAuth();
  if (!me) return;
  PAMRA.renderHeader('ledger');

  const data = await PAMRA.api('/api/ledger?limit=50').catch(() => ({ stats: null, entries: [] }));
  stats = data.stats;
  chain = data.entries || [];
  renderStats();
  renderChain();

  // Live updates (in-browser bus)
  window.PAMRA_RUNTIME.subscribe((m) => {
    if (m.type === 'ledger_seal') {
      chain.unshift(m.entry);
      if (chain.length > 50) chain.pop();
      stats = m.stats;
      brokenSeqs.clear(); // a new genuine seal means the live chain is intact again
      renderStats();
      renderChain(m.entry.seq);
    }
  });

  document.getElementById('btn-verify').addEventListener('click', verifyChain);
  document.getElementById('btn-tamper').addEventListener('click', tamperDemo);
})();

function shortHash(h) { return h ? h.slice(0, 12) + '…' + h.slice(-6) : '—'; }

// Indicative commodity prices (₨/kg) for an at-a-glance value of each sealed load.
const PRICE = { Wheat: 55, Rice: 120, Cotton: 180, Potato: 45, Tomato: 90, Maize: 42, Onion: 70, Sugarcane: 12, Apple: 160, Banana: 140, Mango: 180, Kinnow: 120, Garlic: 320, Carrot: 55, Dates: 400 };
function estValue(p) { return (p.net_kg || 0) * (PRICE[p.commodity] || 60); }
function fmtPkr(v) { return v >= 1e7 ? `₨${(v / 1e7).toFixed(2)}cr` : v >= 1e5 ? `₨${(v / 1e5).toFixed(1)}L` : `₨${Math.round(v).toLocaleString()}`; }
function relTime(ts) { const s = Math.floor((Date.now() - new Date(ts)) / 1000); if (s < 5) return 'just now'; if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; return Math.floor(s / 3600) + 'h ago'; }

function renderStats() {
  const el = document.getElementById('stats');
  const s = stats || { count: 0, head_hash: '', sealed_net_kg: 0 };
  const intact = brokenSeqs.size === 0;
  el.innerHTML = `
    <div class="stat-tile status ${intact ? '' : 'broken'}">
      <div class="label">Chain status</div>
      <div class="value"><span class="chain-badge ${intact ? 'ok' : 'broken'}"><span class="dot"></span>${intact ? 'SEALED' : 'BROKEN'}</span></div>
      <div class="sub">${intact ? 'append-only · verified' : brokenSeqs.size + ' block(s) altered'}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Blocks sealed</div>
      <div class="value">${s.count.toLocaleString()}</div>
      <div class="sub">one per verified truck</div>
    </div>
    <div class="stat-tile">
      <div class="label">Net weight sealed</div>
      <div class="value">${Math.round(s.sealed_net_kg / 1000).toLocaleString()}<span style="font-size:13px;color:var(--slate-500)"> t</span></div>
      <div class="sub">${s.sealed_net_kg.toLocaleString()} kg total</div>
    </div>
    <div class="stat-tile">
      <div class="label">Avg load / truck</div>
      <div class="value">${s.count ? Math.round(s.sealed_net_kg / s.count).toLocaleString() : 0}<span style="font-size:13px;color:var(--slate-500)"> kg</span></div>
      <div class="sub">net, two-weighment</div>
    </div>
    <div class="stat-tile">
      <div class="label">Last sealed</div>
      <div class="value" style="font-size:18px">${chain[0] ? relTime(chain[0].sealed_at) : '—'}</div>
      <div class="sub">${chain[0] ? chain[0].payload.plate : 'awaiting trucks'}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Head hash</div>
      <div class="value" style="font-size:14px;font-family:'SF Mono',Monaco,monospace">${shortHash(s.head_hash)}</div>
      <div class="sub">SHA-256 of latest block</div>
    </div>
  `;
}

function renderChain(freshSeq) {
  const el = document.getElementById('chain');
  if (!chain.length) {
    el.innerHTML = '<div class="empty">Waiting for the first truck to be sealed… (trucks flow through the gate every few seconds)</div>';
    return;
  }
  el.innerHTML = chain.map((b, i) => {
    const p = b.payload;
    const flagged = brokenSeqs.has(b.seq);
    const arrow = i < chain.length - 1
      ? `<div class="link-arrow ${flagged || brokenSeqs.has(chain[i + 1].seq) ? 'flagged' : ''}">⛓ prev_hash links to block #${chain[i + 1].seq}</div>`
      : '';
    return `
      <div class="block ${flagged ? 'flagged' : ''} ${b.seq === freshSeq ? 'fresh' : ''}">
        <div class="block-head">
          <span class="block-seq">Block #${b.seq}</span>
          <span class="sealed-badge">${flagged ? '✗ Altered — rejected' : '✓ Sealed'}</span>
        </div>
        <div class="block-grid">
          <div class="field"><div class="k">Truck plate (ANPR)</div><div class="v plate">${p.plate || '—'}</div></div>
          <div class="field"><div class="k">Net weight</div><div class="v net">${(p.net_kg || 0).toLocaleString()} kg</div></div>
          <div class="field"><div class="k">Gross / Tare</div><div class="v">${(p.gross_kg || 0).toLocaleString()} / ${(p.tare_kg || 0).toLocaleString()}</div></div>
          <div class="field"><div class="k">Commodity</div><div class="v">${p.commodity || '—'}</div></div>
          <div class="field"><div class="k">Est. value</div><div class="v val">${fmtPkr(estValue(p))}</div></div>
          <div class="field"><div class="k">Market</div><div class="v">${p.market_name || '—'}</div></div>
          <div class="field"><div class="k">Captured by</div><div class="v">${p.captured_by || '—'}</div></div>
        </div>
        <div class="hashes">
          <div class="h-row"><span class="k">prev_hash</span><span class="val">${shortHash(b.prev_hash)}</span></div>
          <div class="h-row entry"><span class="k">entry_hash</span><span class="val">${shortHash(b.entry_hash)}</span></div>
          <div class="h-row"><span class="k">sealed</span><span class="val">${new Date(b.sealed_at).toLocaleString()} · co-signed ${(b.co_sign || []).join(' + ')}</span></div>
        </div>
      </div>
      ${arrow}
    `;
  }).join('');
}

async function verifyChain() {
  const banner = document.getElementById('result');
  banner.className = 'result-banner ok show';
  banner.innerHTML = 'Re-walking the chain and recomputing every hash…';
  try {
    const r = await PAMRA.api('/api/ledger/verify');
    brokenSeqs = new Set((r.broken || []).map(b => b.seq));
    renderStats();
    renderChain();
    if (r.intact) {
      banner.className = 'result-banner ok show';
      banner.innerHTML = `<h4>✓ Chain intact — all ${r.count} block(s) verified</h4>
        Every block's recomputed SHA-256 matches what was sealed, and each block correctly links to the one before it. No truck number or weight has been altered since capture.`;
    } else {
      banner.className = 'result-banner alert show';
      banner.innerHTML = `<h4>✗ Chain broken at block #${r.first_broken}</h4>${r.broken.length} block(s) no longer match their sealed hash.`;
    }
  } catch (e) {
    banner.className = 'result-banner alert show';
    banner.innerHTML = '<h4>Verification failed</h4>' + (e.error || e.message || 'error');
  }
}

async function tamperDemo() {
  const field = document.getElementById('tamper-field').value;
  const banner = document.getElementById('result');
  banner.className = 'result-banner alert show';
  banner.innerHTML = 'Simulating an illicit edit on a copy of the ledger…';
  try {
    const r = await PAMRA.api('/api/ledger/tamper-demo', { method: 'POST', body: JSON.stringify({ field }) });
    if (r.error) {
      banner.innerHTML = '<h4>Cannot run demo</h4>' + r.error;
      return;
    }
    // Briefly flag the targeted block + everything after it (cascade) on the live view.
    brokenSeqs = new Set((r.detail || []).map(b => b.seq));
    renderStats();
    renderChain();
    banner.className = 'result-banner alert show';
    banner.innerHTML = `
      <h4>✗ Tamper attempt detected and rejected</h4>
      <p style="margin:4px 0">${r.message}</p>
      <table>
        <tr><td>Targeted block</td><td><strong>#${r.tampered_seq}</strong></td></tr>
        <tr><td>Field changed</td><td><strong>${r.field}</strong></td></tr>
        <tr><td>Sealed value</td><td>${fmt(r.original_value)}</td></tr>
        <tr><td>Attacker's value</td><td style="color:var(--red)"><strong>${fmt(r.attempted_value)}</strong></td></tr>
        <tr><td>Blocks invalidated</td><td>${r.blocks_invalidated} (block #${r.first_broken} + ${r.blocks_after_target_cascaded} downstream cascaded)</td></tr>
      </table>
      <p style="margin:8px 0 0;font-size:11px">The real ledger was never modified — this ran on a throwaway copy. Click <strong>Verify chain integrity</strong> to confirm the live chain is still sealed.</p>
    `;
  } catch (e) {
    banner.innerHTML = '<h4>Demo failed</h4>' + (e.error || e.message || 'error');
  }
}

function fmt(v) {
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
}
