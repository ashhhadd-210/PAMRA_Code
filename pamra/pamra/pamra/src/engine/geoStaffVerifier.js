// Layer 3: Geo + staff verification
// - Record GPS must lie within the market's geofence (simple radius check).
// - Staff must be on duty today (in attendance roster, not in absent set).

const { markets } = require('../data/markets');
const { staff, punchInTimes, absentToday } = require('../data/staff');

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function verify(record) {
  const findings = [];
  const market = markets.find(m => m.id === record.market_id);

  if (!market) {
    findings.push(`unknown market_id ${record.market_id}`);
  } else {
    const distance = haversineKm({ lat: market.lat, lng: market.lng }, record.geo);
    if (distance > market.radiusKm) {
      findings.push(`GPS ${distance.toFixed(1)}km from ${market.name} (geofence ${market.radiusKm}km)`);
    }
  }

  const inspector = staff.find(s => s.id === record.staff_id);
  if (!inspector) {
    findings.push(`staff_id ${record.staff_id} not in roster`);
  } else if (absentToday.has(record.staff_id)) {
    findings.push(`${record.staff_id} marked absent today (no biometric punch-in)`);
  } else if (inspector.marketId !== record.market_id) {
    findings.push(`${record.staff_id} assigned to ${inspector.marketId}, record from ${record.market_id}`);
  }

  if (findings.length === 0) {
    return { layer: 'geo_staff', verdict: 'pass', reason: 'GPS in geofence, staff on duty' };
  }
  return {
    layer: 'geo_staff',
    verdict: findings.some(f => f.includes('absent') || f.includes('not in roster')) ? 'fail' : 'warn',
    reason: findings.join('; ')
  };
}

module.exports = { verify };
