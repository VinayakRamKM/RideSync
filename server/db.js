const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "db.json");
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    })
  : null;

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
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return empty();
  }
}

function save(db) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

let cache = pool ? empty() : load();
let writeQueue = Promise.resolve();
let initialized = false;

const tableSpecs = [
  {
    key: "users",
    id: (row) => row.id,
    upsert: (row) => ({
      text: `INSERT INTO ridesync_users (id, name, email, password_hash, emoji, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash, emoji = EXCLUDED.emoji,
          created_at = EXCLUDED.created_at`,
      values: [row.id, row.name, row.email, row.passwordHash, row.emoji, row.createdAt],
    }),
    remove: "DELETE FROM ridesync_users WHERE id = $1",
  },
  {
    key: "rides",
    id: (row) => row.id,
    upsert: (row) => ({
      text: `INSERT INTO ridesync_rides
        (id, name, start_name, dest_name, start_lat, start_lng, dest_lat, dest_lng,
         route_label, leader_id, status, code, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, start_name = EXCLUDED.start_name,
          dest_name = EXCLUDED.dest_name, start_lat = EXCLUDED.start_lat,
          start_lng = EXCLUDED.start_lng, dest_lat = EXCLUDED.dest_lat,
          dest_lng = EXCLUDED.dest_lng, route_label = EXCLUDED.route_label,
          leader_id = EXCLUDED.leader_id, status = EXCLUDED.status,
          code = EXCLUDED.code, created_at = EXCLUDED.created_at`,
      values: [
        row.id,
        row.name,
        row.startName,
        row.destName,
        row.start.lat,
        row.start.lng,
        row.dest.lat,
        row.dest.lng,
        row.routeLabel,
        row.leaderId,
        row.status,
        row.code,
        row.createdAt,
      ],
    }),
    remove: "DELETE FROM ridesync_rides WHERE id = $1",
  },
  {
    key: "members",
    id: (row) => `${row.rideId}:${row.userId}`,
    upsert: (row) => ({
      text: `INSERT INTO ridesync_members
        (ride_id, user_id, status, lat, lng, heading, speed, last_seen, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (ride_id, user_id) DO UPDATE SET
          status = EXCLUDED.status, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
          heading = EXCLUDED.heading, speed = EXCLUDED.speed,
          last_seen = EXCLUDED.last_seen, role = EXCLUDED.role`,
      values: [
        row.rideId,
        row.userId,
        row.status,
        row.lat,
        row.lng,
        row.heading,
        row.speed,
        row.lastSeen,
        row.role,
      ],
    }),
    remove: "DELETE FROM ridesync_members WHERE ride_id = $1 AND user_id = $2",
    removeValues: (row) => [row.rideId, row.userId],
  },
  {
    key: "invites",
    id: (row) => row.id,
    upsert: (row) => ({
      text: `INSERT INTO ridesync_invites (id, token, ride_id, email, invited_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          token = EXCLUDED.token, ride_id = EXCLUDED.ride_id,
          email = EXCLUDED.email, invited_by = EXCLUDED.invited_by,
          created_at = EXCLUDED.created_at`,
      values: [row.id, row.token, row.rideId, row.email, row.invitedBy, row.createdAt],
    }),
    remove: "DELETE FROM ridesync_invites WHERE id = $1",
  },
  {
    key: "outbox",
    id: (row) => row.id,
    upsert: (row) => ({
      text: `INSERT INTO ridesync_outbox
        (id, recipient, subject, body, join_url, delivered, error, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          recipient = EXCLUDED.recipient, subject = EXCLUDED.subject,
          body = EXCLUDED.body, join_url = EXCLUDED.join_url,
          delivered = EXCLUDED.delivered, error = EXCLUDED.error,
          created_at = EXCLUDED.created_at`,
      values: [
        row.id,
        row.to,
        row.subject,
        row.text,
        row.joinUrl,
        row.delivered,
        row.error,
        row.createdAt,
      ],
    }),
    remove: "DELETE FROM ridesync_outbox WHERE id = $1",
  },
];

async function createSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ridesync_users (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    emoji text NOT NULL,
    created_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ridesync_rides (
    id text PRIMARY KEY,
    name text NOT NULL,
    start_name text NOT NULL,
    dest_name text NOT NULL,
    start_lat double precision NOT NULL,
    start_lng double precision NOT NULL,
    dest_lat double precision NOT NULL,
    dest_lng double precision NOT NULL,
    route_label text NOT NULL,
    leader_id text NOT NULL REFERENCES ridesync_users(id),
    status text NOT NULL,
    code text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ridesync_members (
    ride_id text NOT NULL REFERENCES ridesync_rides(id),
    user_id text NOT NULL REFERENCES ridesync_users(id),
    status text NOT NULL,
    lat double precision,
    lng double precision,
    heading double precision NOT NULL DEFAULT 0,
    speed double precision NOT NULL DEFAULT 0,
    last_seen timestamptz NOT NULL,
    role text NOT NULL,
    PRIMARY KEY (ride_id, user_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ridesync_invites (
    id text PRIMARY KEY,
    token text NOT NULL UNIQUE,
    ride_id text NOT NULL REFERENCES ridesync_rides(id),
    email text NOT NULL,
    invited_by text NOT NULL REFERENCES ridesync_users(id),
    created_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ridesync_outbox (
    id text PRIMARY KEY,
    recipient text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    join_url text NOT NULL,
    delivered boolean NOT NULL,
    error text,
    created_at timestamptz NOT NULL
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS ridesync_members_user_idx ON ridesync_members(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS ridesync_invites_ride_idx ON ridesync_invites(ride_id)");
}

async function loadFromPostgres() {
  const [users, rides, members, invites, outbox] = await Promise.all([
    pool.query("SELECT * FROM ridesync_users"),
    pool.query("SELECT * FROM ridesync_rides"),
    pool.query("SELECT * FROM ridesync_members"),
    pool.query("SELECT * FROM ridesync_invites"),
    pool.query("SELECT * FROM ridesync_outbox"),
  ]);
  return {
    users: users.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      emoji: row.emoji,
      createdAt: timestamp(row.created_at),
    })),
    rides: rides.rows.map((row) => ({
      id: row.id,
      name: row.name,
      startName: row.start_name,
      destName: row.dest_name,
      start: { lat: row.start_lat, lng: row.start_lng },
      dest: { lat: row.dest_lat, lng: row.dest_lng },
      routeLabel: row.route_label,
      leaderId: row.leader_id,
      status: row.status,
      code: row.code,
      createdAt: timestamp(row.created_at),
    })),
    members: members.rows.map((row) => ({
      rideId: row.ride_id,
      userId: row.user_id,
      status: row.status,
      lat: row.lat,
      lng: row.lng,
      heading: row.heading,
      speed: row.speed,
      lastSeen: timestamp(row.last_seen),
      role: row.role,
    })),
    invites: invites.rows.map((row) => ({
      id: row.id,
      token: row.token,
      rideId: row.ride_id,
      email: row.email,
      invitedBy: row.invited_by,
      createdAt: timestamp(row.created_at),
    })),
    outbox: outbox.rows.map((row) => ({
      id: row.id,
      to: row.recipient,
      subject: row.subject,
      text: row.body,
      joinUrl: row.join_url,
      delivered: row.delivered,
      error: row.error,
      createdAt: timestamp(row.created_at),
    })),
  };
}

async function persistChanges(client, before, after) {
  const changes = [];
  for (const spec of tableSpecs) {
    const oldRows = new Map(before[spec.key].map((row) => [spec.id(row), row]));
    const newRows = new Map(after[spec.key].map((row) => [spec.id(row), row]));
    for (const [id, row] of newRows) {
      if (JSON.stringify(oldRows.get(id)) !== JSON.stringify(row)) {
        const query = spec.upsert(row);
        changes.push(() => client.query(query.text, query.values));
      }
    }
    for (const [id, row] of oldRows) {
      if (!newRows.has(id)) {
        const values = spec.removeValues ? spec.removeValues(row) : [id];
        changes.push(() => client.query(spec.remove, values));
      }
    }
  }

  if (!changes.length) return;
  await client.query("BEGIN");
  try {
    for (const change of changes) await change();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function initialize() {
  if (initialized) return;
  if (!pool) {
    initialized = true;
    return;
  }
  await createSchema();
  cache = await loadFromPostgres();
  initialized = true;
}

function get() {
  return cache;
}

function update(mutator) {
  const operation = writeQueue.then(async () => {
    const before = cache;
    const next = clone(cache);
    mutator(next);
    if (pool) {
      const client = await pool.connect();
      try {
        await persistChanges(client, before, next);
      } finally {
        client.release();
      }
    } else {
      save(next);
    }
    cache = next;
    return cache;
  });
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { get, update, initialize, close, dataDir };
