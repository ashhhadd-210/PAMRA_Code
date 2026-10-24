// Layer 4: ML-style fraud scorer.
// In production this would be a trained gradient-boosted model. For the prototype
// we use a deterministic feature-weighted scorer that mirrors the same shape:
// each feature contributes a normalized risk delta; the sum is squashed into [0,1].
// Tuning is transparent so the audit drawer can show *why* a record scored high.

const { priceBaseline } = require('../data/markets');
const { staff } = require('../data/staff');

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function score(record, recentByStaff) {
  const features = {};

  // Feature 1: price deviation from baseline median (normalized).
  const base = priceBaseline[record.commodity];
  if (base) {
    const dev = Math.abs(record.price_per_kg - base.mean) / base.mean;
    features.price_deviation = dev;
  }

  // Feature 2: volume vs staff's typical entries.
  const staffHistory = recentByStaff[record.staff_id] || [];
  if (staffHistory.length >= 5) {
    const avg = staffHistory.reduce((s, r) => s + r.lot_volume_kg, 0) / staffHistory.length;
    features.volume_vs_staff_norm = Math.abs(record.lot_volume_kg - avg) / Math.max(avg, 1);
  } else {
    features.volume_vs_staff_norm = 0;
  }

  // Feature 3: staff's historical dispute rate (prior).
  const inspector = staff.find(s => s.id === record.staff_id);
  features.staff_dispute_prior = inspector ? inspector.priorDisputeRate : 0.5;

  // Feature 4: time of day. Most legitimate auctions cluster 6am-2pm local.
  const hour = new Date(record.auction_timestamp).getUTCHours();
  features.unusual_hour = (hour >= 1 && hour <= 12) ? 0 : 0.3; // crude; demo only

  // Feature 5: cardinality of recent entries — does this staff churn entries unusually fast?
  const lastMin = staffHistory.filter(r => Date.now() - new Date(r.submitted_at) < 60_000).length;
  features.entry_velocity = Math.min(lastMin / 15, 1);

  // Logistic combination — coefficients hand-tuned to mimic a trained model.
  const logit =
    -2.5 +
    3.2 * (features.price_deviation || 0) +
    1.4 * (features.volume_vs_staff_norm || 0) +
    2.8 * (features.staff_dispute_prior || 0) +
    1.0 * (features.unusual_hour || 0) +
    1.5 * (features.entry_velocity || 0);

  const fraud_score = sigmoid(logit);
  return { layer: 'ml_fraud', fraud_score, features };
}

module.exports = { score };
