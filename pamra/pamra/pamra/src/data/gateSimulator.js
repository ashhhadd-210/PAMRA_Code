// Gate Automation simulator — drives realistic truck flow through the AI-enabled gate.
//
// Lifecycle for each truck:
//   APPROACHING → ANPR_SCANNING → CNIC_KIOSK → COMMODITY_SCAN
//     → WEIGHBRIDGE_IN → AUCTION → WEIGHBRIDGE_OUT → EXITED
//
// At each stage we publish a "gate event" via the broadcast callback so the UI
// can render live activity. When a truck reaches EXITED we produce a canonical
// ArrivalRecord that flows into the same authenticity engine as MCMIS/AMIS/Mandi.

const { markets, commodities, priceBaseline } = require('./markets');
const { traders } = require('../auth');

const STAGES = [
  'APPROACHING',
  'ANPR_SCANNING',
  'CNIC_KIOSK',
  'COMMODITY_SCAN',
  'WEIGHBRIDGE_IN',
  'AUCTION',
  'WEIGHBRIDGE_OUT',
  'EXITED'
];

// Stage durations (ms). Total ~30s per truck for a brisk demo.
const STAGE_MS = {
  APPROACHING: 2000,
  ANPR_SCANNING: 2500,
  CNIC_KIOSK: 3000,
  COMMODITY_SCAN: 2500,
  WEIGHBRIDGE_IN: 2500,
  AUCTION: 8000,
  WEIGHBRIDGE_OUT: 2500,
  EXITED: 0
};

// Build a flat list of all registered (CNIC, plate) pairs for lookups.
const registry = [];
traders.forEach(t => t.vehicles.forEach(plate => registry.push({ ...t, plate })));

let truckSeq = 0;
const trucks = new Map(); // id -> truck
const recentEvents = [];  // for /api/gate/events
const EVENT_CAP = 300;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function nextId() {
  return `TRK-${Date.now().toString(36)}-${(truckSeq++).toString(36)}`;
}

function spawnTruck(broadcast, onArrivalRecord) {
  // 80% of the time the truck is in the registry (clean case).
  // 20% one or more anomalies are injected: unregistered plate, unknown CNIC,
  // declared commodity mismatches camera, or weight wildly off.
  const market = pick(markets);
  const useRegistered = Math.random() < 0.8;

  let plate, cnic, driverName;
  let plateIsRegistered = true;
  let cnicMatchesPlate = true;
  let driverRegistered = true;

  if (useRegistered) {
    const r = pick(registry);
    plate = r.plate;
    cnic = r.cnic;
    driverName = r.name;
  } else {
    // Anomaly cases
    const which = Math.random();
    if (which < 0.4) {
      plate = `UNK-${Math.floor(rand(1000, 9999))}`;
      plateIsRegistered = false;
      cnic = pick(traders).cnic;
      driverName = traders.find(t => t.cnic === cnic).name;
    } else if (which < 0.7) {
      const r = pick(registry);
      plate = r.plate;
      cnic = `99999-${Math.floor(rand(1000000, 9999999))}-9`;
      driverName = 'Unknown driver';
      driverRegistered = false;
    } else {
      // Plate belongs to one trader, CNIC to a different one
      const r1 = pick(registry);
      const r2 = pick(traders.filter(t => t.cnic !== r1.cnic));
      plate = r1.plate;
      cnic = r2.cnic;
      driverName = r2.name;
      cnicMatchesPlate = false;
    }
  }

  const declared_commodity = pick(commodities);
  const declared_kg = Math.round(rand(8000, 28000));

  // Captured commodity = declared, unless we inject a mismatch
  const commodityMismatch = !useRegistered && Math.random() < 0.4;
  const captured_commodity = commodityMismatch ? pick(commodities.filter(c => c !== declared_commodity)) : declared_commodity;

  // Weights
  const tare = Math.round(rand(9000, 12000));
  // Realistic gross vs declared — usually within 5%
  const gross = useRegistered
    ? tare + Math.round(declared_kg * rand(0.95, 1.05))
    : tare + Math.round(declared_kg * rand(0.6, 1.4)); // anomaly trucks have wider variance

  const truck = {
    id: nextId(),
    plate,
    cnic,
    driver_name: driverName,
    market_id: market.id,
    market_name: market.name,
    declared_commodity,
    captured_commodity,
    declared_kg,
    tare_kg: tare,
    gross_kg: gross,
    net_kg: gross - tare,
    flags: {
      plateRegistered: plateIsRegistered,
      driverRegistered,
      cnicMatchesPlate,
      commodityMatchesDeclared: !commodityMismatch
    },
    confidence: {
      anpr: +(plateIsRegistered ? rand(0.92, 0.99) : rand(0.65, 0.88)).toFixed(2),
      cnic: +(driverRegistered ? rand(0.95, 0.99) : rand(0.55, 0.80)).toFixed(2),
      commodity_cls: +(commodityMismatch ? rand(0.78, 0.92) : rand(0.88, 0.98)).toFixed(2)
    },
    stage: 'APPROACHING',
    stage_started_at: Date.now(),
    history: [{ stage: 'APPROACHING', at: new Date().toISOString() }],
    arrived_at: new Date().toISOString()
  };

  trucks.set(truck.id, truck);
  emit(broadcast, truck, 'TRUCK_ARRIVED', { plate, cnic, market: market.name });

  scheduleAdvance(truck, broadcast, onArrivalRecord);
}

function scheduleAdvance(truck, broadcast, onArrivalRecord) {
  const dur = STAGE_MS[truck.stage] || 2000;
  setTimeout(() => advance(truck, broadcast, onArrivalRecord), dur);
}

function advance(truck, broadcast, onArrivalRecord) {
  if (!trucks.has(truck.id)) return;
  const idx = STAGES.indexOf(truck.stage);
  const next = STAGES[idx + 1];
  if (!next) return;

  truck.stage = next;
  truck.stage_started_at = Date.now();
  truck.history.push({ stage: next, at: new Date().toISOString() });

  // Emit stage-specific event with relevant payload
  switch (next) {
    case 'ANPR_SCANNING':
      emit(broadcast, truck, 'ANPR_CAPTURE', {
        plate: truck.plate,
        confidence: truck.confidence.anpr,
        registered: truck.flags.plateRegistered,
        verdict: truck.flags.plateRegistered ? 'MATCH' : 'UNREGISTERED'
      });
      break;
    case 'CNIC_KIOSK':
      emit(broadcast, truck, 'CNIC_SCAN', {
        cnic: truck.cnic,
        driver_name: truck.driver_name,
        confidence: truck.confidence.cnic,
        registered: truck.flags.driverRegistered,
        plate_match: truck.flags.cnicMatchesPlate,
        verdict: truck.flags.driverRegistered && truck.flags.cnicMatchesPlate ? 'VERIFIED'
              : !truck.flags.driverRegistered ? 'UNKNOWN_DRIVER'
              : 'CNIC_PLATE_MISMATCH'
      });
      break;
    case 'COMMODITY_SCAN':
      emit(broadcast, truck, 'COMMODITY_CLS', {
        declared: truck.declared_commodity,
        captured: truck.captured_commodity,
        confidence: truck.confidence.commodity_cls,
        verdict: truck.flags.commodityMatchesDeclared ? 'MATCH' : 'MISMATCH'
      });
      break;
    case 'WEIGHBRIDGE_IN':
      emit(broadcast, truck, 'WEIGH_IN', {
        gross_kg: truck.gross_kg,
        declared_kg: truck.declared_kg
      });
      break;
    case 'AUCTION':
      emit(broadcast, truck, 'AT_AUCTION', { market: truck.market_name });
      break;
    case 'WEIGHBRIDGE_OUT':
      emit(broadcast, truck, 'WEIGH_OUT', {
        tare_kg: truck.tare_kg,
        net_kg: truck.net_kg,
        gross_kg: truck.gross_kg
      });
      break;
    case 'EXITED':
      emit(broadcast, truck, 'EXITED', { net_kg: truck.net_kg });
      // Auto-create a canonical ArrivalRecord from the system-captured data
      if (onArrivalRecord) {
        const baseline = priceBaseline[truck.declared_commodity];
        const market = markets.find(m => m.id === truck.market_id);
        const record = {
          record_id: `GATE-${truck.id}`,
          source: 'GATE_AUTO',
          market_id: truck.market_id,
          market_name: truck.market_name,
          commodity: truck.declared_commodity,
          lot_volume_kg: truck.net_kg,
          price_per_kg: +(baseline.mean * (0.95 + Math.random() * 0.1)).toFixed(2),
          auction_timestamp: new Date().toISOString(),
          staff_id: 'GATE-AUTO-01',
          geo: { lat: market.lat, lng: market.lng },
          external_ref: truck.id,
          submitted_at: new Date().toISOString(),
          _gate_meta: {
            plate: truck.plate,
            cnic: truck.cnic,
            driver: truck.driver_name,
            gross_kg: truck.gross_kg,
            tare_kg: truck.tare_kg,
            flags: truck.flags
          }
        };
        onArrivalRecord(record);
      }
      // Remove from active set after a short delay so UI can show "EXITED" briefly
      setTimeout(() => trucks.delete(truck.id), 4000);
      return;
  }

  scheduleAdvance(truck, broadcast, onArrivalRecord);
}

function emit(broadcast, truck, event_type, payload) {
  const evt = {
    event_id: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    truck_id: truck.id,
    plate: truck.plate,
    market_id: truck.market_id,
    event_type,
    stage: truck.stage,
    payload
  };
  recentEvents.push(evt);
  if (recentEvents.length > EVENT_CAP) recentEvents.shift();
  if (broadcast) broadcast({ type: 'gate_event', event: evt, truck: snapshot(truck) });
}

function snapshot(truck) {
  return {
    id: truck.id,
    plate: truck.plate,
    cnic: truck.cnic,
    driver_name: truck.driver_name,
    market_id: truck.market_id,
    market_name: truck.market_name,
    declared_commodity: truck.declared_commodity,
    captured_commodity: truck.captured_commodity,
    declared_kg: truck.declared_kg,
    tare_kg: truck.tare_kg,
    gross_kg: truck.gross_kg,
    net_kg: truck.net_kg,
    stage: truck.stage,
    flags: truck.flags,
    confidence: truck.confidence,
    arrived_at: truck.arrived_at,
    history: truck.history
  };
}

function start(broadcast, onArrivalRecord) {
  // Spawn a new truck every 4-7s
  setInterval(() => spawnTruck(broadcast, onArrivalRecord), Math.round(rand(4000, 7000)));
}

function listActiveTrucks() {
  return Array.from(trucks.values()).map(snapshot);
}

function listRecentEvents(limit = 50) {
  return recentEvents.slice(-limit).reverse();
}

module.exports = { start, listActiveTrucks, listRecentEvents, STAGES };
