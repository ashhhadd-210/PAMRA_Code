// Mock attendance roster: which inspector is on duty at which market today.
// In the real system this is fed by MCMIS biometric punch-in.
const staff = [
  { id: 'INSP-4421', name: 'M. Tariq Mahmood',  marketId: 'LHR-01', priorDisputeRate: 0.02 },
  { id: 'INSP-4422', name: 'A. Khan Niazi',     marketId: 'FSD-01', priorDisputeRate: 0.04 },
  { id: 'INSP-4423', name: 'S. Bashir Ahmed',   marketId: 'MUL-01', priorDisputeRate: 0.31 }, // history of disputed entries
  { id: 'INSP-4424', name: 'R. Yousaf Butt',    marketId: 'RWP-01', priorDisputeRate: 0.05 },
  { id: 'INSP-4425', name: 'N. Iqbal Shah',     marketId: 'GUJ-01', priorDisputeRate: 0.03 },
  { id: 'INSP-4426', name: 'F. Hussain Gilani', marketId: 'SLK-01', priorDisputeRate: 0.06 },
  { id: 'INSP-4427', name: 'K. Anwar Cheema',   marketId: 'SGD-01', priorDisputeRate: 0.08 },
  { id: 'INSP-4428', name: 'I. Sattar Khokhar', marketId: 'BWP-01', priorDisputeRate: 0.04 },
  { id: 'INSP-4429', name: 'Z. Asif Mazari',    marketId: 'DGK-01', priorDisputeRate: 0.07 },
  { id: 'INSP-4430', name: 'W. Akhtar Sial',    marketId: 'SHW-01', priorDisputeRate: 0.05 }
];

// Today's attendance: each staff member punched in within their market's range.
const punchInTimes = {};
const now = Date.now();
staff.forEach(s => {
  punchInTimes[s.id] = now - (3 + Math.random() * 2) * 3600 * 1000; // 3-5 hours ago
});

// One inspector deliberately absent today — any record under their ID is a red flag.
const absentToday = new Set(['INSP-4428']);

module.exports = { staff, punchInTimes, absentToday };
