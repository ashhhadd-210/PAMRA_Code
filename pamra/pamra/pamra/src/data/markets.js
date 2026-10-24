// Pakistan Punjab markets with approximate centroids and a simple circular geofence radius (km).
const markets = [
  { id: 'LHR-01', name: 'Lahore',     lat: 31.5204, lng: 74.3587, radiusKm: 5 },
  { id: 'FSD-01', name: 'Faisalabad', lat: 31.4504, lng: 73.1350, radiusKm: 5 },
  { id: 'MUL-01', name: 'Multan',     lat: 30.1575, lng: 71.5249, radiusKm: 5 },
  { id: 'RWP-01', name: 'Rawalpindi', lat: 33.5651, lng: 73.0169, radiusKm: 5 },
  { id: 'GUJ-01', name: 'Gujranwala', lat: 32.1877, lng: 74.1945, radiusKm: 5 },
  { id: 'SLK-01', name: 'Sialkot',    lat: 32.4945, lng: 74.5229, radiusKm: 5 },
  { id: 'SGD-01', name: 'Sargodha',   lat: 32.0836, lng: 72.6711, radiusKm: 5 },
  { id: 'BWP-01', name: 'Bahawalpur', lat: 29.3956, lng: 71.6836, radiusKm: 5 },
  { id: 'DGK-01', name: 'D.G. Khan',  lat: 30.0489, lng: 70.6455, radiusKm: 5 },
  { id: 'SHW-01', name: 'Sahiwal',    lat: 30.6682, lng: 73.1114, radiusKm: 5 }
];

const commodities = ['WHEAT', 'RICE', 'COTTON', 'SUGARCANE', 'POTATO', 'ONION', 'TOMATO', 'MAIZE'];

// Realistic baseline prices (PKR/kg) used by the simulator and the anomaly detector's priors.
const priceBaseline = {
  WHEAT:     { mean: 95,   sd: 6  },
  RICE:      { mean: 220,  sd: 18 },
  COTTON:    { mean: 410,  sd: 30 },
  SUGARCANE: { mean: 12,   sd: 1.5 },
  POTATO:    { mean: 55,   sd: 8  },
  ONION:     { mean: 80,   sd: 12 },
  TOMATO:    { mean: 110,  sd: 22 },
  MAIZE:     { mean: 78,   sd: 6  }
};

module.exports = { markets, commodities, priceBaseline };
