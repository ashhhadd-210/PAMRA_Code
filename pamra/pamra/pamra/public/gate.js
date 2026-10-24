// Gate Automation client — connects to WS, drives station viewports, renders trucks + events.

const STAGES = ['APPROACHING','ANPR_SCANNING','CNIC_KIOSK','COMMODITY_SCAN','WEIGHBRIDGE_IN','AUCTION','WEIGHBRIDGE_OUT','EXITED'];
const STAGE_LABEL = {
  APPROACHING:    'Approaching',
  ANPR_SCANNING:  'ANPR scan',
  CNIC_KIOSK:     'CNIC kiosk',
  COMMODITY_SCAN: 'Commodity AI',
  WEIGHBRIDGE_IN: 'Weigh-in',
  AUCTION:        'At auction',
  WEIGHBRIDGE_OUT:'Weigh-out',
  EXITED:         'Exited'
};

const trucks = new Map();
const events = [];
const EVENT_CAP = 40;

(async function init() {
  const me = await PAMRA.requireAuth();
  if (!me) return;
  PAMRA.renderHeader('gate');

  renderStageFlow();

  // Load initial state
  const [activeTrucks, recentEvents] = await Promise.all([
    PAMRA.api('/api/gate/trucks').catch(() => []),
    PAMRA.api('/api/gate/events?limit=30').catch(() => [])
  ]);
  activeTrucks.forEach(t => trucks.set(t.id, t));
  recentEvents.reverse().forEach(addEvent);
  renderTruckList();
  renderEvents();
  renderStageFlow();

  // Live stream (in-browser bus)
  window.PAMRA_RUNTIME.subscribe((m) => {
    if (m.type === 'gate_event') {
      onGateEvent(m.event, m.truck);
    }
  });
})();

function onGateEvent(evt, truck) {
  if (truck) {
    if (truck.stage === 'EXITED') {
      // Keep briefly for visibility, then remove
      trucks.set(truck.id, truck);
      setTimeout(() => { trucks.delete(truck.id); renderTruckList(); renderStageFlow(); }, 4500);
    } else {
      trucks.set(truck.id, truck);
    }
  }
  addEvent(evt);
  renderTruckList();
  renderEvents();
  renderStageFlow();

  // Animate the relevant station based on event type
  switch (evt.event_type) {
    case 'ANPR_CAPTURE':    animateANPR(evt.payload, truck); break;
    case 'CNIC_SCAN':       animateCNIC(evt.payload, truck); break;
    case 'COMMODITY_CLS':   animateCommodity(evt.payload, truck); break;
    case 'WEIGH_IN':        animateWeigh(evt.payload.gross_kg, 'in', evt.payload); break;
    case 'WEIGH_OUT':       animateWeigh(evt.payload.tare_kg, 'out', evt.payload); break;
  }
}

function addEvent(evt) {
  events.unshift(evt);
  if (events.length > EVENT_CAP) events.pop();
}

// ─────────────────────── Station animations ─────────────────────
function animateANPR(p, truck) {
  const view = document.getElementById('anpr-view');
  const station = document.getElementById('station-anpr');
  station.querySelector('.station-title').classList.add('live');
  const conf = Math.round(p.confidence * 100);
  view.innerHTML = `
    <div class="camera-overlay"><span class="rec">● REC</span> CAM-01 · scanning</div>
    <div class="scan-line"></div>
    <div class="camera-scene">
      <div class="plate-box">${p.plate}</div>
      <div style="color:#94a3b8;margin-top:8px">OCR confidence ${conf}% <span class="conf-bar"><span style="width:${conf}%"></span></span></div>
      <div style="color:${p.registered ? '#6ee7b7' : '#f87171'};margin-top:4px">${p.verdict.replace('_', ' ')}</div>
    </div>
  `;
  document.getElementById('anpr-verdict').innerHTML = `<div class="verdict ${p.registered ? 'ok' : 'fail'}">${p.registered ? '✓ Plate registered to ' + (truck ? truck.driver_name : '—') : '✗ Plate not in registry — manual review required'}</div>`;
  setTimeout(() => station.querySelector('.station-title').classList.remove('live'), 2400);
}

function animateCNIC(p, truck) {
  const view = document.getElementById('cnic-view');
  const station = document.getElementById('station-cnic');
  station.querySelector('.station-title').classList.add('live');
  const conf = Math.round(p.confidence * 100);
  const initials = p.driver_name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  view.innerHTML = `
    <div class="camera-overlay"><span class="rec">● REC</span> CAM-02 · NADRA verify</div>
    <div class="scan-line"></div>
    <div class="camera-scene" style="text-align:left;width:80%">
      <div class="cnic-card">
        <div class="face">${initials}</div>
        <div>
          <div class="field"><div class="label">Full Name</div><div class="value">${p.driver_name}</div></div>
          <div class="field"><div class="label">CNIC</div><div class="value">${p.cnic}</div></div>
        </div>
      </div>
      <div style="color:#94a3b8;text-align:center">OCR + face match ${conf}% <span class="conf-bar"><span style="width:${conf}%"></span></span></div>
    </div>
  `;
  const ok = p.verdict === 'VERIFIED';
  document.getElementById('cnic-verdict').innerHTML = `<div class="verdict ${ok ? 'ok' : 'fail'}">${ok ? '✓ Driver verified · linked to plate ' + (truck ? truck.plate : '—') : '✗ ' + p.verdict.replace(/_/g, ' ')}</div>`;
  setTimeout(() => station.querySelector('.station-title').classList.remove('live'), 2400);
}

function animateCommodity(p, truck) {
  const view = document.getElementById('commodity-view');
  const station = document.getElementById('station-commodity');
  station.querySelector('.station-title').classList.add('live');
  const conf = Math.round(p.confidence * 100);
  view.innerHTML = `
    <div class="camera-overlay"><span class="rec">● REC</span> CAM-03 · classifying</div>
    <div class="scan-line"></div>
    <div class="commodity-result">
      <div class="name">${p.captured}</div>
      <div class="conf">classifier confidence ${conf}% <span class="conf-bar"><span style="width:${conf}%"></span></span></div>
      <div class="conf" style="margin-top:8px">declared: <strong style="color:#fbbf24">${p.declared}</strong></div>
    </div>
  `;
  const ok = p.verdict === 'MATCH';
  document.getElementById('commodity-verdict').innerHTML = `<div class="verdict ${ok ? 'ok' : 'warn'}">${ok ? '✓ Matches declared commodity' : '⚠ Captured ' + p.captured + ' but driver declared ' + p.declared}</div>`;
  setTimeout(() => station.querySelector('.station-title').classList.remove('live'), 2400);
}

function animateWeigh(target, phase, payload) {
  const disp = document.getElementById('weigh-display');
  const station = document.getElementById('station-weigh');
  station.querySelector('.station-title').classList.add('live');
  disp.classList.remove('idle');
  // Tick up to target over ~1.5s
  const start = Date.now();
  const duration = 1500;
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration);
    const v = Math.round(target * t);
    disp.innerHTML = `${v.toLocaleString()}<span class="unit">kg</span>`;
    if (t < 1) requestAnimationFrame(tick);
    else {
      if (phase === 'in') {
        document.getElementById('weigh-gross').textContent = target.toLocaleString() + ' kg';
      } else {
        document.getElementById('weigh-tare').textContent = target.toLocaleString() + ' kg';
        document.getElementById('weigh-net').innerHTML = `<strong style="color:var(--green-700)">${payload.net_kg.toLocaleString()} kg</strong>`;
      }
      setTimeout(() => {
        station.querySelector('.station-title').classList.remove('live');
        disp.classList.add('idle');
        disp.innerHTML = `0<span class="unit">kg</span>`;
      }, 1800);
    }
  };
  tick();
}

// ─────────────────────── Truck list ─────────────────────
function renderTruckList() {
  const list = document.getElementById('truck-list');
  const sorted = Array.from(trucks.values()).sort((a, b) => new Date(b.arrived_at) - new Date(a.arrived_at));
  document.getElementById('truck-count').textContent = sorted.length;
  if (sorted.length === 0) {
    list.innerHTML = '<div style="color:var(--slate-400);font-size:12px;text-align:center;padding:20px">No trucks at gate</div>';
    return;
  }
  list.innerHTML = sorted.map(t => {
    const anyFlag = !t.flags.plateRegistered || !t.flags.driverRegistered || !t.flags.cnicMatchesPlate || !t.flags.commodityMatchesDeclared;
    return `
      <div class="truck-row ${anyFlag ? 'flagged' : ''}">
        <div>
          <div class="plate">${t.plate}</div>
          <div class="meta">${t.driver_name} · ${t.declared_commodity} · ${t.market_name}</div>
        </div>
        <div class="stage-pill">${STAGE_LABEL[t.stage] || t.stage}</div>
      </div>
    `;
  }).join('');
}

// ─────────────────────── Event feed ─────────────────────
function renderEvents() {
  const feed = document.getElementById('event-feed');
  feed.innerHTML = events.slice(0, EVENT_CAP).map(e => {
    const flagged = isFlaggedEvent(e);
    return `
      <div class="event ${flagged ? 'flagged' : ''}">
        <span class="ts">${new Date(e.timestamp).toLocaleTimeString()}</span>
        <div class="et">${e.event_type.replace(/_/g, ' ')}</div>
        <div class="ed">${eventDescription(e)}</div>
      </div>
    `;
  }).join('');
}

function isFlaggedEvent(e) {
  if (!e.payload) return false;
  if (e.payload.verdict && ['UNREGISTERED', 'UNKNOWN_DRIVER', 'CNIC_PLATE_MISMATCH', 'MISMATCH'].includes(e.payload.verdict)) return true;
  return false;
}

function eventDescription(e) {
  const p = e.payload || {};
  switch (e.event_type) {
    case 'TRUCK_ARRIVED': return `${e.plate} arrived at ${p.market}`;
    case 'ANPR_CAPTURE':  return `Plate ${p.plate} · ${(p.confidence * 100).toFixed(0)}% · ${p.verdict}`;
    case 'CNIC_SCAN':     return `${p.driver_name} · ${p.cnic} · ${p.verdict}`;
    case 'COMMODITY_CLS': return `Captured ${p.captured} vs declared ${p.declared} · ${p.verdict}`;
    case 'WEIGH_IN':      return `Gross ${p.gross_kg.toLocaleString()}kg (declared ${p.declared_kg.toLocaleString()}kg)`;
    case 'AT_AUCTION':    return `Unloading at ${p.market}`;
    case 'WEIGH_OUT':     return `Tare ${p.tare_kg.toLocaleString()}kg · Net ${p.net_kg.toLocaleString()}kg`;
    case 'EXITED':        return `Truck ${e.plate} exited · ${p.net_kg.toLocaleString()}kg delivered`;
    default: return JSON.stringify(p);
  }
}

// ─────────────────────── Stage flow strip ─────────────────────
function renderStageFlow() {
  const counts = {};
  STAGES.forEach(s => counts[s] = 0);
  trucks.forEach(t => { counts[t.stage] = (counts[t.stage] || 0) + 1; });
  document.getElementById('stage-flow').innerHTML = STAGES.map(s => `
    <div class="stage-node ${counts[s] > 0 ? 'has-truck' : ''}">
      <span class="count">${counts[s]}</span>
      ${STAGE_LABEL[s]}
    </div>
  `).join('');
}
