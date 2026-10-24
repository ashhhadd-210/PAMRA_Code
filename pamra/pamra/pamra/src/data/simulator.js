const { markets, commodities, priceBaseline } = require('./markets');
const { staff, absentToday } = require('./staff');

const SOURCES = ['MCMIS', 'AMIS', 'MANDI_APP'];

let seq = 0;
const nextId = () => `REC-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function gaussian(mean, sd) {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * sd;
}

function clean(market, commodity, source) {
  const base = priceBaseline[commodity];
  const inspector = staff.find(s => s.marketId === market.id);
  return {
    record_id: nextId(),
    source,
    market_id: market.id,
    market_name: market.name,
    commodity,
    lot_volume_kg: Math.round(rand(500, 25000)),
    price_per_kg: +gaussian(base.mean, base.sd).toFixed(2),
    auction_timestamp: new Date().toISOString(),
    staff_id: inspector ? inspector.id : 'INSP-0000',
    geo: {
      lat: market.lat + rand(-0.01, 0.01),
      lng: market.lng + rand(-0.01, 0.01)
    },
    external_ref: `${source}-${Math.floor(Math.random() * 1e6)}`,
    submitted_at: new Date().toISOString()
  };
}

// Injects specific tampering patterns to demonstrate the engine catching them.
const tamperers = {
  priceManipulation(rec) {
    // Report price 35% under reality — looks like revenue leakage.
    rec.price_per_kg = +(rec.price_per_kg * 0.65).toFixed(2);
    rec._truth = 'price_manipulation_under_report';
    return rec;
  },
  ghostArrival(rec) {
    // Phantom inflow with implausibly large volume.
    rec.lot_volume_kg = Math.round(rec.lot_volume_kg * rand(8, 15));
    rec._truth = 'ghost_arrival_inflated_volume';
    return rec;
  },
  outOfGeofence(rec, market) {
    // Submission location 80km off — not in this market at all.
    rec.geo = { lat: market.lat + 0.8, lng: market.lng + 0.8 };
    rec._truth = 'outside_market_geofence';
    return rec;
  },
  absentStaff(rec) {
    // Entry submitted under an inspector who didn't punch in today.
    rec.staff_id = 'INSP-4428';
    rec._truth = 'staff_not_on_duty';
    return rec;
  },
  statisticalOutlier(rec, commodity) {
    // Price 4-5x normal — likely fat-finger or fraud.
    rec.price_per_kg = +(priceBaseline[commodity].mean * rand(4, 5.5)).toFixed(2);
    rec._truth = 'statistical_outlier_price';
    return rec;
  },
  crossSourceMismatch(rec) {
    // Same auction reported in another source at very different price.
    // Caller emits this rec then immediately emits a counterpart with skewed price.
    rec._mismatch_pair = true;
    return rec;
  }
};

function generateBatch() {
  const batch = [];
  const market = pick(markets);
  const commodity = pick(commodities);

  // Most auctions are reported by 2-3 sources. Emit those.
  const reportingSources = SOURCES.filter(() => Math.random() < 0.7);
  if (reportingSources.length === 0) reportingSources.push(pick(SOURCES));

  // Anchor timestamp shared across sources for this same real-world auction.
  const sharedTs = new Date().toISOString();
  const sharedVolume = Math.round(rand(500, 25000));
  const sharedPrice = +gaussian(priceBaseline[commodity].mean, priceBaseline[commodity].sd).toFixed(2);

  reportingSources.forEach(src => {
    const rec = clean(market, commodity, src);
    rec.auction_timestamp = sharedTs;
    // Most sources agree closely; small natural drift in price/volume.
    rec.lot_volume_kg = Math.round(sharedVolume * rand(0.97, 1.03));
    rec.price_per_kg = +(sharedPrice * rand(0.98, 1.02)).toFixed(2);
    batch.push(rec);
  });

  // ~25% chance of injecting a tampering pattern into this batch.
  if (Math.random() < 0.25 && batch.length > 0) {
    const target = batch[0];
    const pattern = pick(Object.keys(tamperers));
    if (pattern === 'crossSourceMismatch' && batch.length >= 2) {
      // Skew the second source's price to create a real cross-source mismatch.
      batch[1].price_per_kg = +(batch[1].price_per_kg * rand(1.3, 1.6)).toFixed(2);
      batch[1]._truth = 'cross_source_price_disagreement';
    } else if (pattern === 'outOfGeofence') {
      tamperers.outOfGeofence(target, market);
    } else if (pattern === 'statisticalOutlier') {
      tamperers.statisticalOutlier(target, commodity);
    } else if (pattern === 'priceManipulation') {
      tamperers.priceManipulation(target);
    } else if (pattern === 'ghostArrival') {
      tamperers.ghostArrival(target);
    } else if (pattern === 'absentStaff') {
      tamperers.absentStaff(target);
    }
  }

  return batch;
}

module.exports = { generateBatch };
