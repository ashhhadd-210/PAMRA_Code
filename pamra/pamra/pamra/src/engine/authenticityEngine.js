// Orchestrator: runs all four layers and combines their verdicts into a final disposition.

const crossSource = require('./crossSourceValidator');
const statistical = require('./statisticalAnomaly');
const geoStaff = require('./geoStaffVerifier');
const fraudScorer = require('./fraudScorer');

const FRAUD_QUARANTINE = 0.70;
const FRAUD_SUSPECT = 0.40;

// State held in memory for the prototype. In production these would be Redis-backed.
const recentByKey = {};   // market|commodity -> [records]
const recentByStaff = {}; // staff_id -> [records]
const RECENT_LIMIT = 100;

function pushRecent(map, key, record) {
  const arr = map[key] || [];
  arr.push(record);
  if (arr.length > RECENT_LIMIT) arr.shift();
  map[key] = arr;
}

function evaluate(record) {
  const layers = [];

  layers.push(crossSource.validate(record, recentByKey));
  layers.push(statistical.check(record));
  layers.push(geoStaff.verify(record));

  const ml = fraudScorer.score(record, recentByStaff);
  layers.push({
    layer: 'ml_fraud',
    verdict: ml.fraud_score > FRAUD_QUARANTINE ? 'fail'
           : ml.fraud_score > FRAUD_SUSPECT ? 'warn'
           : 'pass',
    reason: `fraud score ${ml.fraud_score.toFixed(3)}`,
    fraud_score: ml.fraud_score,
    features: ml.features
  });

  // Combine
  const hasFail = layers.some(l => l.verdict === 'fail');
  const hasWarn = layers.some(l => l.verdict === 'warn');
  let disposition;
  if (hasFail) disposition = 'QUARANTINED';
  else if (hasWarn) disposition = 'SUSPECT';
  else disposition = 'CLEAN';

  // Update state after evaluation so layers above used the *prior* window.
  pushRecent(recentByKey, `${record.market_id}|${record.commodity}`, record);
  pushRecent(recentByStaff, record.staff_id, record);

  return {
    ...record,
    disposition,
    layers,
    fraud_score: ml.fraud_score,
    evaluated_at: new Date().toISOString()
  };
}

module.exports = { evaluate };
