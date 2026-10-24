// Layer 2: Statistical anomaly detection
// Rolling-window Z-score on price, IQR check on volume, entry-velocity check per staff member.

const HISTORY_LIMIT = 200;
const Z_THRESHOLD = 3;
const VELOCITY_WINDOW_MS = 60 * 1000;
const VELOCITY_MAX = 10; // more than 10 entries from one staff in 60s is suspicious

const priceHistory = {};   // key: market|commodity -> [price...]
const volumeHistory = {};
const staffEntryLog = {};  // staff_id -> [timestamp...]

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function sd(arr, m) { return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length); }
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base] + (sorted[base + 1] !== undefined ? rest * (sorted[base + 1] - sorted[base]) : 0);
}

function check(record) {
  const key = `${record.market_id}|${record.commodity}`;
  const findings = [];

  // Price Z-score
  const prices = priceHistory[key] || [];
  if (prices.length >= 20) {
    const m = mean(prices);
    const s = sd(prices, m) || 1;
    const z = (record.price_per_kg - m) / s;
    if (Math.abs(z) > Z_THRESHOLD) {
      findings.push(`price z-score ${z.toFixed(2)} (mean ${m.toFixed(2)}, sd ${s.toFixed(2)})`);
    }
  }

  // Volume IQR fence
  const volumes = volumeHistory[key] || [];
  if (volumes.length >= 20) {
    const sorted = [...volumes].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const upper = q3 + 1.5 * iqr;
    const lower = Math.max(0, q1 - 1.5 * iqr);
    if (record.lot_volume_kg > upper || record.lot_volume_kg < lower) {
      findings.push(`volume ${record.lot_volume_kg}kg outside IQR fence [${lower.toFixed(0)}, ${upper.toFixed(0)}]`);
    }
  }

  // Staff entry velocity
  const log = staffEntryLog[record.staff_id] || [];
  const now = Date.now();
  const recent = log.filter(t => now - t < VELOCITY_WINDOW_MS);
  if (recent.length > VELOCITY_MAX) {
    findings.push(`${recent.length} entries from ${record.staff_id} in last 60s`);
  }

  // Update history (only after evaluation, so the current record doesn't bias its own check).
  prices.push(record.price_per_kg);
  if (prices.length > HISTORY_LIMIT) prices.shift();
  priceHistory[key] = prices;

  volumes.push(record.lot_volume_kg);
  if (volumes.length > HISTORY_LIMIT) volumes.shift();
  volumeHistory[key] = volumes;

  recent.push(now);
  staffEntryLog[record.staff_id] = recent;

  if (findings.length === 0) {
    return { layer: 'statistical', verdict: 'pass', reason: 'within normal distribution' };
  }
  return {
    layer: 'statistical',
    verdict: findings.length > 1 ? 'fail' : 'warn',
    reason: findings.join('; ')
  };
}

module.exports = { check };
