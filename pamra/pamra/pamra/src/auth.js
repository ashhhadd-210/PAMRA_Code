// Auth for the demo. Staff login only (username + password).
// Trader information is *stored* in PAMRA (registered traders database) but
// traders do NOT have a public login pathway. Admin staff manage their records.
// Tokens are issued as random hex strings and stored in memory.

const crypto = require('crypto');

const staffUsers = [
  { username: 'admin',     password: 'admin123',   role: 'admin',     name: 'Tariq Mehmood',  title: 'Director, PAMRA HQ' },
  { username: 'inspector', password: 'insp123',    role: 'inspector', name: 'Ali Raza Khan',  title: 'Senior Market Inspector' },
  { username: 'analyst',   password: 'analyst123', role: 'analyst',   name: 'Sara Bhutta',    title: 'HQ Data Analyst' },
  { username: 'committee', password: 'comm123',    role: 'committee', name: 'Imran Sheikh',   title: 'Market Committee Secretary' }
];

// Registered traders — kept in PAMRA's records so gate ANPR/CNIC verification
// and admin views work. Traders themselves do not sign in here.
const traders = [
  { cnic: '35202-1234567-1', name: 'Muhammad Asif',  village: 'Pattoki, Kasur',        registered_since: '2021-03-14', vehicles: ['LEB-4521'] },
  { cnic: '36302-9988776-3', name: 'Ghulam Mustafa', village: 'Chiniot',                registered_since: '2019-11-02', vehicles: ['FSD-2234', 'FSD-7720'] },
  { cnic: '32104-5566778-9', name: 'Rashid Iqbal',   village: 'Khanewal',               registered_since: '2022-07-08', vehicles: ['MUL-8810'] },
  { cnic: '31202-4433221-5', name: 'Abdul Sattar',   village: 'D.G. Khan, Vehari Rd',   registered_since: '2020-01-20', vehicles: ['DGK-1145'] },
  { cnic: '34603-1122334-7', name: 'Tariq Aziz',     village: 'Sahiwal',                registered_since: '2023-02-11', vehicles: ['SHW-3392'] },
  { cnic: '35501-9876543-2', name: 'Naveed Anjum',   village: 'Sargodha',               registered_since: '2018-06-30', vehicles: ['SGD-6611'] }
];

const tokens = new Map(); // token -> { user, issuedAt }

function issueToken(user) {
  const token = crypto.randomBytes(16).toString('hex');
  tokens.set(token, { user, issuedAt: Date.now() });
  return token;
}

function staffLogin(username, password) {
  const u = staffUsers.find(x => x.username === username && x.password === password);
  if (!u) return null;
  const user = { kind: 'staff', username: u.username, role: u.role, name: u.name, title: u.title };
  return { token: issueToken(user), user };
}

function verifyToken(token) {
  if (!token) return null;
  const entry = tokens.get(token);
  if (!entry) return null;
  if (Date.now() - entry.issuedAt > 24 * 3600 * 1000) {
    tokens.delete(token);
    return null;
  }
  return entry.user;
}

function logout(token) {
  tokens.delete(token);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', required: roles });
    }
    next();
  };
}

// What modules each role can see in the portal
const moduleAccess = {
  admin:     ['dashboard', 'gate', 'ledger', 'mcmis', 'amis', 'reports', 'admin'],
  inspector: ['dashboard', 'gate', 'ledger', 'mcmis', 'reports'],
  analyst:   ['dashboard', 'amis', 'reports'],
  committee: ['dashboard', 'mcmis', 'reports']
};

module.exports = {
  staffLogin, verifyToken, logout,
  requireAuth, requireRole, moduleAccess, traders, staffUsers
};
