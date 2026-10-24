// AMIS — Agricultural Marketing Information System mock data.
// Daily commodity prices, arrivals, and 30-day price history per market.

const { markets, commodities, priceBaseline } = require('./markets');

function gaussian(mean, sd) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * sd;
}

// 30-day price history per (market, commodity)
function generateHistory() {
  const series = {};
  const today = new Date();
  markets.forEach(m => {
    commodities.forEach(c => {
      const base = priceBaseline[c];
      const points = [];
      let last = base.mean;
      for (let d = 29; d >= 0; d--) {
        // Random walk with mean reversion
        last = last + gaussian(0, base.sd * 0.4) + (base.mean - last) * 0.2;
        const date = new Date(today.getTime() - d * 24 * 3600 * 1000);
        points.push({
          date: date.toISOString().slice(0, 10),
          min: +(last * 0.95).toFixed(2),
          max: +(last * 1.06).toFixed(2),
          modal: +last.toFixed(2),
          arrivals_kg: Math.round(15_000 + Math.random() * 80_000)
        });
      }
      series[`${m.id}|${c}`] = points;
    });
  });
  return series;
}

const history = generateHistory();

// Commodity metadata in the style of amis.pk — Urdu name, the wholesale unit
// (Pakistani mandis quote per 40 kg = 1 "maund"), and common grades/varieties.
const commodityMeta = {
  WHEAT:     { urdu: 'گندم',  unit: '40 kg', varieties: ['Irri', 'Desi'] },
  RICE:      { urdu: 'چاول',  unit: '40 kg', varieties: ['Basmati', 'Super Kernel', 'Irri-6'] },
  COTTON:    { urdu: 'کپاس',  unit: '40 kg', varieties: ['Phutti', 'Lint'] },
  SUGARCANE: { urdu: 'گنا',   unit: '40 kg', varieties: ['Mill', 'Gur'] },
  POTATO:    { urdu: 'آلو',   unit: '40 kg', varieties: ['Fresh', 'Store', 'Lal'] },
  ONION:     { urdu: 'پیاز',  unit: '40 kg', varieties: ['Desi', 'Imported'] },
  TOMATO:    { urdu: 'ٹماٹر', unit: '40 kg', varieties: ['A-Grade', 'B-Grade'] },
  MAIZE:     { urdu: 'مکئی',  unit: '40 kg', varieties: ['Hybrid', 'Desi'] }
};

function availableDates() {
  const any = history[`${markets[0].id}|${commodities[0]}`];
  return any.map(p => p.date); // oldest → newest, 30 entries
}

// Generalised snapshot for any date in the 30-day window (falls back to latest).
function snapshotForDate(dateStr) {
  const out = [];
  markets.forEach(m => {
    commodities.forEach(c => {
      const series = history[`${m.id}|${c}`];
      let idx = dateStr ? series.findIndex(p => p.date === dateStr) : series.length - 1;
      if (idx < 0) idx = series.length - 1;
      const cur = series[idx];
      const prev = series[idx - 1] || cur;
      const meta = commodityMeta[c] || {};
      out.push({
        market_id: m.id,
        market_name: m.name,
        commodity: c,
        commodity_urdu: meta.urdu || '',
        variety: (meta.varieties && meta.varieties[0]) || '—',
        unit: meta.unit || '40 kg',
        date: cur.date,
        modal_pkr: cur.modal,
        min_pkr: cur.min,
        max_pkr: cur.max,
        per_40kg: Math.round(cur.modal * 40),
        arrivals_kg: cur.arrivals_kg,
        change_pct: +(((cur.modal - prev.modal) / prev.modal) * 100).toFixed(2)
      });
    });
  });
  return out;
}

// International reference prices, converted to PKR like amis.pk does
// (USD from CBOT/NYMEX, INR from NCDEX India). Approximate June-2026 levels.
function internationalPrices() {
  const USD_PKR = 278.5;
  const INR_PKR = 3.34;
  const jitter = (v, p) => +(v * (1 + (Math.random() - 0.5) * p)).toFixed(2);
  const usdTon = (c, usdPerTon, exch) => ({
    commodity: c, urdu: (commodityMeta[c] || {}).urdu || '',
    exchange: exch, source_ccy: 'USD',
    intl_price: `$${Math.round(usdPerTon)}/ton`,
    pkr_per_40kg: Math.round((jitter(usdPerTon, 0.03) * USD_PKR / 1000) * 40)
  });
  const inrQtl = (c, inrPerQtl, exch) => ({
    commodity: c, urdu: (commodityMeta[c] || {}).urdu || '',
    exchange: exch, source_ccy: 'INR',
    intl_price: `₹${Math.round(inrPerQtl)}/qtl`,
    pkr_per_40kg: Math.round((jitter(inrPerQtl, 0.03) * INR_PKR / 100) * 40)
  });
  return [
    usdTon('WHEAT', 232, 'CBOT'),
    usdTon('MAIZE', 188, 'CBOT'),
    usdTon('RICE', 585, 'CBOT'),
    usdTon('SUGARCANE', 445, 'NYMEX'),   // sugar No.11 proxy
    usdTon('COTTON', 1585, 'NYMEX'),
    inrQtl('WHEAT', 2620, 'NCDEX'),
    inrQtl('ONION', 2150, 'NCDEX')
  ];
}

function todaySnapshot() {
  const out = [];
  markets.forEach(m => {
    commodities.forEach(c => {
      const series = history[`${m.id}|${c}`];
      const today = series[series.length - 1];
      const yest = series[series.length - 2];
      out.push({
        market_id: m.id,
        market_name: m.name,
        commodity: c,
        modal_pkr: today.modal,
        min_pkr: today.min,
        max_pkr: today.max,
        arrivals_kg: today.arrivals_kg,
        change_pct: +(((today.modal - yest.modal) / yest.modal) * 100).toFixed(2)
      });
    });
  });
  return out;
}

function commodityHistory(marketId, commodity) {
  return history[`${marketId}|${commodity}`] || [];
}

function priceLeaderboard(commodity) {
  return markets.map(m => {
    const series = history[`${m.id}|${commodity}`];
    return { market_id: m.id, market_name: m.name, modal_pkr: series[series.length - 1].modal };
  }).sort((a, b) => a.modal_pkr - b.modal_pkr);
}

module.exports = {
  todaySnapshot, commodityHistory, priceLeaderboard, commodities,
  commodityMeta, availableDates, snapshotForDate, internationalPrices
};
