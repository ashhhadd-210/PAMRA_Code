// Layer 1: Cross-source validation
// For records describing the same real-world auction (same market+commodity within a 15-min window),
// compare prices and volumes across MCMIS / AMIS / Mandi App.

const WINDOW_MS = 15 * 60 * 1000;
const PRICE_WARN = 0.08;
const PRICE_FAIL = 0.20;
const VOLUME_WARN = 0.15;

function validate(record, recentByKey) {
  const key = `${record.market_id}|${record.commodity}`;
  const peers = (recentByKey[key] || []).filter(p =>
    p.record_id !== record.record_id &&
    p.source !== record.source &&
    Math.abs(new Date(p.auction_timestamp) - new Date(record.auction_timestamp)) < WINDOW_MS
  );

  if (peers.length === 0) {
    return { layer: 'cross_source', verdict: 'pass', reason: 'no peer records yet' };
  }

  const otherPrices = peers.map(p => p.price_per_kg);
  const otherVolumes = peers.map(p => p.lot_volume_kg);
  const avgPrice = otherPrices.reduce((a, b) => a + b, 0) / otherPrices.length;
  const avgVolume = otherVolumes.reduce((a, b) => a + b, 0) / otherVolumes.length;

  const priceDelta = Math.abs(record.price_per_kg - avgPrice) / avgPrice;
  const volumeDelta = Math.abs(record.lot_volume_kg - avgVolume) / avgVolume;

  if (priceDelta > PRICE_FAIL) {
    return {
      layer: 'cross_source',
      verdict: 'fail',
      reason: `price disagrees with peers by ${(priceDelta * 100).toFixed(1)}% (this: ${record.price_per_kg}, peers avg: ${avgPrice.toFixed(2)})`,
      peers: peers.map(p => ({ source: p.source, price: p.price_per_kg }))
    };
  }
  if (priceDelta > PRICE_WARN) {
    return {
      layer: 'cross_source',
      verdict: 'warn',
      reason: `price drift ${(priceDelta * 100).toFixed(1)}% vs peers`,
      peers: peers.map(p => ({ source: p.source, price: p.price_per_kg }))
    };
  }
  if (volumeDelta > VOLUME_WARN) {
    return {
      layer: 'cross_source',
      verdict: 'warn',
      reason: `volume drift ${(volumeDelta * 100).toFixed(1)}% vs peers`
    };
  }

  return { layer: 'cross_source', verdict: 'pass', reason: 'agrees with peers' };
}

module.exports = { validate };
