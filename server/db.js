const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

function empty() {
  return { users: [], rides: [], members: [], invites: [], outbox: [] };
}

function load() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    const initial = empty();
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    return empty();
  }
}

function save(db) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

let cache = load();

function get() {
  return cache;
}

function update(mutator) {
  mutator(cache);
  save(cache);
  return cache;
}

module.exports = { get, update, dataDir };
