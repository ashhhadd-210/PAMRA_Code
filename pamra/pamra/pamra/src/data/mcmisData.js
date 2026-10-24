// MCMIS — Market Committee Management Information System mock data.
// Tracks staff attendance, committee finances, infrastructure status, and revenue collection per market.

const { markets } = require('./markets');
const { staffUsers } = require('../auth');

const positions = ['Inspector', 'Auctioneer', 'Cashier', 'Weighbridge Op.', 'Security', 'Committee Sec.'];

function generateStaff() {
  const out = [];
  markets.forEach(m => {
    const count = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const present = Math.random() < 0.88;
      out.push({
        id: `${m.id}-EMP-${String(i + 1).padStart(3, '0')}`,
        market_id: m.id,
        market_name: m.name,
        name: pickName(),
        position: positions[Math.floor(Math.random() * positions.length)],
        cnic: randomCnic(),
        contact: `+92-3${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 9000000 + 1000000)}`,
        present_today: present,
        punch_in: present ? randomMorningTime() : null,
        attendance_30d_pct: Math.round(80 + Math.random() * 20)
      });
    }
  });
  return out;
}

function pickName() {
  const first = ['Muhammad', 'Ahmad', 'Ali', 'Hassan', 'Imran', 'Bilal', 'Usman', 'Tariq', 'Saqib', 'Rizwan', 'Waseem', 'Khalid'];
  const last = ['Khan', 'Ahmed', 'Butt', 'Cheema', 'Gilani', 'Iqbal', 'Mahmood', 'Rashid', 'Sheikh', 'Yousaf', 'Bashir'];
  return first[Math.floor(Math.random() * first.length)] + ' ' + last[Math.floor(Math.random() * last.length)];
}

function randomCnic() {
  return `${30 + Math.floor(Math.random() * 7)}${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000000 + 1000000)}-${Math.floor(Math.random() * 9)}`;
}

function randomMorningTime() {
  const h = 7 + Math.floor(Math.random() * 3);
  const m = Math.floor(Math.random() * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function generateFinances() {
  return markets.map(m => {
    const revenue_monthly = Math.round((800_000 + Math.random() * 2_500_000));
    const expenses_monthly = Math.round(revenue_monthly * (0.55 + Math.random() * 0.2));
    return {
      market_id: m.id,
      market_name: m.name,
      revenue_monthly_pkr: revenue_monthly,
      expenses_monthly_pkr: expenses_monthly,
      net_monthly_pkr: revenue_monthly - expenses_monthly,
      fee_collection_rate_pct: Math.round(70 + Math.random() * 28),
      pending_dues_pkr: Math.round(Math.random() * 600_000),
      infrastructure_score: +(2 + Math.random() * 3).toFixed(1) // out of 5
    };
  });
}

function generateInfraIssues() {
  const types = [
    { type: 'Weighbridge calibration overdue', severity: 'high' },
    { type: 'CCTV camera offline', severity: 'medium' },
    { type: 'Boundary wall repair needed', severity: 'low' },
    { type: 'Auction shed roof leak', severity: 'medium' },
    { type: 'Drainage clogged', severity: 'low' },
    { type: 'Generator non-functional', severity: 'high' },
    { type: 'Cold storage unit faulty', severity: 'high' }
  ];
  const issues = [];
  markets.forEach(m => {
    const count = Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      issues.push({
        id: `INF-${m.id}-${i + 1}`,
        market_id: m.id,
        market_name: m.name,
        ...t,
        reported_at: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        status: Math.random() < 0.4 ? 'open' : Math.random() < 0.5 ? 'in_progress' : 'resolved'
      });
    }
  });
  return issues;
}

// ───────── District / division mapping ─────────
const districtOf = {
  'LHR-01': 'Lahore', 'FSD-01': 'Faisalabad', 'MUL-01': 'Multan', 'RWP-01': 'Rawalpindi',
  'GUJ-01': 'Gujranwala', 'SLK-01': 'Sialkot', 'SGD-01': 'Sargodha', 'BWP-01': 'Bahawalpur',
  'DGK-01': 'Dera Ghazi Khan', 'SHW-01': 'Sahiwal'
};
const divisionOf = {
  Lahore: 'Lahore', Faisalabad: 'Faisalabad', Multan: 'Multan', Rawalpindi: 'Rawalpindi',
  Gujranwala: 'Gujranwala', Sialkot: 'Gujranwala', Sargodha: 'Sargodha',
  Bahawalpur: 'Bahawalpur', 'Dera Ghazi Khan': 'Dera Ghazi Khan', Sahiwal: 'Sahiwal'
};

const rint = (a, b) => a + Math.floor(Math.random() * (b - a));

// ───────── Licensees (the people a market committee registers) ─────────
const licenseTypes = ['Commission Agent (Arhti)', 'Trader (Beopari)', 'Weighman (Tolaidar)', 'Contractor (Theka)', 'Broker (Dalal)'];

function generateLicenses() {
  return markets.map(m => {
    const by_type = licenseTypes.map(t => {
      const active = rint(15, 140);
      return {
        type: t,
        active,
        suspended: rint(0, 6),
        new_this_month: rint(0, 12),
        renewals_due: rint(0, 22)
      };
    });
    return {
      market_id: m.id, market_name: m.name, district: districtOf[m.id],
      total_licensees: by_type.reduce((s, x) => s + x.active + x.suspended, 0),
      new_this_month: by_type.reduce((s, x) => s + x.new_this_month, 0),
      renewals_due: by_type.reduce((s, x) => s + x.renewals_due, 0),
      by_type
    };
  });
}

// ───────── Daily auctions & commodity arrivals ─────────
const arrivalCommodities = ['Wheat', 'Potato', 'Onion', 'Tomato', 'Maize', 'Rice', 'Vegetables', 'Fruits'];

function generateAuctions() {
  return markets.map(m => {
    const arrivals_tons = rint(200, 1600);
    const by_commodity = arrivalCommodities.map(c => ({ commodity: c, tons: Math.round(arrivals_tons * (0.04 + Math.random() * 0.18)) }));
    return {
      market_id: m.id, market_name: m.name, district: districtOf[m.id],
      auction_lots: rint(40, 260),
      arrivals_tons,
      vehicles_in: rint(30, 190),
      gate_passes: rint(30, 210),
      by_commodity
    };
  });
}

// ───────── Fee / revenue collection (the core MCMIS function) ─────────
function generateFees() {
  return markets.map(m => {
    const fy_target = rint(30, 150) * 1_000_000;
    const fy_collected = Math.round(fy_target * (0.45 + Math.random() * 0.5));
    return {
      market_id: m.id, market_name: m.name, district: districtOf[m.id],
      fy_target_pkr: fy_target,
      fy_collected_pkr: fy_collected,
      collection_pct: Math.round((fy_collected / fy_target) * 100),
      today_collected_pkr: rint(80_000, 1_000_000),
      pending_pkr: rint(0, 4_000_000),
      gate_passes_today: rint(30, 210),
      challans_today: rint(20, 220)
    };
  });
}

// ───────── 12-month revenue trend (collected vs target) ─────────
function generateRevenueTrend() {
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  return months.map(mo => {
    const target = Math.round((150 + Math.random() * 90) * 1_000_000);
    const collected = Math.round(target * (0.68 + Math.random() * 0.34));
    return { month: mo, target_pkr: target, collected_pkr: collected };
  });
}

const staff = generateStaff();
const finances = generateFinances();
const infraIssues = generateInfraIssues();
const licenses = generateLicenses();
const auctions = generateAuctions();
const fees = generateFees();
const revenueTrend = generateRevenueTrend();

// Rollup helpers
function districtSummary() {
  const map = {};
  fees.forEach(f => {
    const d = f.district;
    if (!map[d]) map[d] = { district: d, division: divisionOf[d] || d, committees: 0, fy_target_pkr: 0, fy_collected_pkr: 0, today_collected_pkr: 0 };
    map[d].committees += 1;
    map[d].fy_target_pkr += f.fy_target_pkr;
    map[d].fy_collected_pkr += f.fy_collected_pkr;
    map[d].today_collected_pkr += f.today_collected_pkr;
  });
  return Object.values(map).map(d => ({ ...d, collection_pct: Math.round((d.fy_collected_pkr / d.fy_target_pkr) * 100) }))
    .sort((a, b) => b.fy_collected_pkr - a.fy_collected_pkr);
}

function licenseTypeSummary() {
  const map = {};
  licenses.forEach(l => l.by_type.forEach(t => {
    if (!map[t.type]) map[t.type] = { type: t.type, active: 0, suspended: 0, new_this_month: 0, renewals_due: 0 };
    map[t.type].active += t.active;
    map[t.type].suspended += t.suspended;
    map[t.type].new_this_month += t.new_this_month;
    map[t.type].renewals_due += t.renewals_due;
  }));
  return Object.values(map);
}

function extendedSummary() {
  const total_staff = staff.length;
  const present_today = staff.filter(s => s.present_today).length;
  return {
    committees: markets.length,
    total_staff, present_today,
    open_issues: infraIssues.filter(i => i.status !== 'resolved').length,
    total_licensees: licenses.reduce((s, l) => s + l.total_licensees, 0),
    new_licenses_month: licenses.reduce((s, l) => s + l.new_this_month, 0),
    renewals_due: licenses.reduce((s, l) => s + l.renewals_due, 0),
    fy_target_pkr: fees.reduce((s, f) => s + f.fy_target_pkr, 0),
    fy_collected_pkr: fees.reduce((s, f) => s + f.fy_collected_pkr, 0),
    fee_today_pkr: fees.reduce((s, f) => s + f.today_collected_pkr, 0),
    auction_lots_today: auctions.reduce((s, a) => s + a.auction_lots, 0),
    arrivals_today_tons: auctions.reduce((s, a) => s + a.arrivals_tons, 0),
    gate_passes_today: auctions.reduce((s, a) => s + a.gate_passes, 0),
    challans_today: fees.reduce((s, f) => s + f.challans_today, 0)
  };
}

module.exports = {
  staff, finances, infraIssues, licenses, auctions, fees, revenueTrend,
  districtSummary, licenseTypeSummary, extendedSummary
};
