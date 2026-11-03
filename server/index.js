const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const db = require('./db');
const { sendInvite } = require('./email');

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'ridesync-dev-secret-change-me';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const EMOJIS = ['🏍️', '🛵', '🏁', '🟢', '🔵', '🟠', '🟣', '🟡', '🔴', '⚡'];

const PLACES = {
  bangalore: { lat: 12.9716, lng: 77.5946, name: 'Bangalore' },
  bengaluru: { lat: 12.9716, lng: 77.5946, name: 'Bangalore' },
  mysore: { lat: 12.2958, lng: 76.6394, name: 'Mysore' },
  mysuru: { lat: 12.2958, lng: 76.6394, name: 'Mysore' },
  mumbai: { lat: 19.076, lng: 72.8777, name: 'Mumbai' },
  pune: { lat: 18.5204, lng: 73.8567, name: 'Pune' },
  hyderabad: { lat: 17.385, lng: 78.4867, name: 'Hyderabad' },
  chennai: { lat: 13.0827, lng: 80.2707, name: 'Chennai' },
  delhi: { lat: 28.6139, lng: 77.209, name: 'Delhi' },
  goa: { lat: 15.4909, lng: 73.8278, name: 'Goa' },
  coorg: { lat: 12.3375, lng: 75.8069, name: 'Coorg' },
  ooty: { lat: 11.4064, lng: 76.6932, name: 'Ooty' },
};

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, emoji: user.emoji };
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!raw) return res.status(401).json({ error: 'Sign in required' });
  try {
    req.user = jwt.verify(raw, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

function rideBundle(ride) {
  const store = db.get();
  const members = store.members
    .filter((m) => m.rideId === ride.id)
    .map((m) => {
      const user = store.users.find((u) => u.id === m.userId);
      return {
        ...m,
        name: user?.name || 'Rider',
        email: user?.email,
        emoji: user?.emoji || '🏍️',
      };
    });
  const leader = store.users.find((u) => u.id === ride.leaderId);
  return { ...ride, members, leader: leader ? publicUser(leader) : null };
}

async function geocode(query) {
  const key = String(query || '').trim().toLowerCase();
  if (PLACES[key]) return PLACES[key];
  const hit = Object.values(PLACES).find((p) => key.includes(p.name.toLowerCase()));
  if (hit && key.length < 24) return hit;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RideSync/1.0 (group-ride coordinator)' },
  });
  if (!res.ok) throw new Error('Geocoding failed');
  const rows = await res.json();
  if (!rows.length) return null;
  return {
    lat: Number(rows[0].lat),
    lng: Number(rows[0].lon),
    name: rows[0].display_name.split(',').slice(0, 2).join(',').trim(),
  };
}

function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371e3;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.get().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    emoji: EMOJIS[db.get().users.length % EMOJIS.length],
    createdAt: new Date().toISOString(),
  };
  db.update((store) => store.users.push(user));
  res.json({ token: tokenFor(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.get().users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: tokenFor(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.get().users.find((u) => u.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

app.get('/api/geo/search', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const local = Object.values(PLACES).filter((p) =>
      p.name.toLowerCase().includes(q.toLowerCase())
    );
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`;
    const remote = await fetch(url, {
      headers: { 'User-Agent': 'RideSync/1.0 (group-ride coordinator)' },
    });
    const rows = remote.ok ? await remote.json() : [];
    const mapped = rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      name: r.display_name,
    }));
    res.json([...local, ...mapped].slice(0, 8));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/geo/route', auth, async (req, res) => {
  try {
    const from = String(req.query.from || '').split(',').map(Number);
    const to = String(req.query.to || '').split(',').map(Number);
    if (from.length !== 2 || to.length !== 2 || from.some(Number.isNaN) || to.some(Number.isNaN)) {
      return res.status(400).json({ error: 'from and to must be lat,lng' });
    }
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`;
    const remote = await fetch(url);
    if (!remote.ok) return res.status(502).json({ error: 'Routing failed' });
    const data = await remote.json();
    const route = data.routes?.[0];
    if (!route) return res.status(404).json({ error: 'No route found' });
    res.json({
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      steps: route.legs.flatMap((leg) =>
        leg.steps.map((s) => ({
          instruction: s.maneuver?.modifier
            ? `${s.maneuver.type.replace(/_/g, ' ')} ${s.maneuver.modifier}`.trim()
            : s.maneuver?.type || 'Continue',
          name: s.name,
          distance: s.distance,
          duration: s.duration,
          location: s.maneuver?.location
            ? { lng: s.maneuver.location[0], lat: s.maneuver.location[1] }
            : null,
          type: s.maneuver?.type,
          modifier: s.maneuver?.modifier,
        }))
      ),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/rides', auth, (req, res) => {
  const mine = db
    .get()
    .rides.filter((r) =>
      db.get().members.some((m) => m.rideId === r.id && m.userId === req.user.id)
    )
    .map(rideBundle)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(mine);
});

app.post('/api/rides', auth, async (req, res) => {
  const { name, startName, startCoordinates, destName, routeLabel } = req.body || {};
  if (!name || (!startName && !startCoordinates) || !destName) {
    return res.status(400).json({ error: 'Ride name, start, and destination are required' });
  }
  if (startName === 'Current location' && !startCoordinates) {
    return res.status(400).json({ error: 'Current start coordinates are missing. Select “Use my current location” again.' });
  }
  try {
    let start;
    if (startCoordinates) {
      if (startCoordinates.lat == null || startCoordinates.lng == null) {
        return res.status(400).json({ error: 'Current start location must contain valid coordinates' });
      }
      const lat = Number(startCoordinates.lat);
      const lng = Number(startCoordinates.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Current start location must contain valid coordinates' });
      }
      start = { lat, lng, name: 'Current location' };
    } else {
      start = await geocode(startName);
    }
    const dest = await geocode(destName);
    if (!start) {
      return res.status(400).json({ error: 'Could not find the start point. Try another place or use your current location.' });
    }
    if (!dest) {
      return res.status(400).json({ error: 'Could not find the destination. Check its name or choose a suggested place.' });
    }
    const user = db.get().users.find((u) => u.id === req.user.id);
    const ride = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      startName: start.name,
      destName: dest.name,
      start: { lat: start.lat, lng: start.lng },
      dest: { lat: dest.lat, lng: dest.lng },
      routeLabel: String(routeLabel || '').trim(),
      leaderId: req.user.id,
      status: 'planned',
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    db.update((store) => {
      store.rides.push(ride);
      store.members.push({
        rideId: ride.id,
        userId: req.user.id,
        status: 'riding',
        lat: start.lat,
        lng: start.lng,
        heading: 0,
        speed: 0,
        lastSeen: new Date().toISOString(),
        role: 'leader',
      });
    });
    res.json(rideBundle(ride));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/rides/join', auth, (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const ride = db.get().rides.find((r) => r.code === code);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const already = db.get().members.find((m) => m.rideId === ride.id && m.userId === req.user.id);
  if (!already) {
    db.update((store) => {
      store.members.push({
        rideId: ride.id,
        userId: req.user.id,
        status: 'riding',
        lat: ride.start.lat,
        lng: ride.start.lng,
        heading: 0,
        speed: 0,
        lastSeen: new Date().toISOString(),
        role: 'rider',
      });
    });
  }
  io.to(`ride:${ride.id}`).emit('ride:update', rideBundle(db.get().rides.find((r) => r.id === ride.id)));
  res.json(rideBundle(db.get().rides.find((r) => r.id === ride.id)));
});

app.get('/api/rides/:id', auth, (req, res) => {
  const ride = db.get().rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const member = db.get().members.find((m) => m.rideId === ride.id && m.userId === req.user.id);
  if (!member) return res.status(403).json({ error: 'You are not on this ride' });
  res.json(rideBundle(ride));
});

app.post('/api/rides/:id/invite', auth, async (req, res) => {
  const ride = db.get().rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const member = db.get().members.find((m) => m.rideId === ride.id && m.userId === req.user.id);
  if (!member) return res.status(403).json({ error: 'You are not on this ride' });
  const emails = String(req.body?.emails || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return res.status(400).json({ error: 'Add at least one email' });
  const inviter = db.get().users.find((u) => u.id === req.user.id);
  const results = [];
  for (const email of emails) {
    const invite = {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      rideId: ride.id,
      email,
      invitedBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    db.update((store) => store.invites.push(invite));
    const joinUrl = `${CLIENT_ORIGIN}/join/${invite.token}`;
    const sent = await sendInvite({ to: email, ride, inviter, joinUrl });
    results.push({ email, joinUrl, delivered: sent.delivered, note: sent.delivered ? 'Email sent' : sent.error || 'Saved locally. Copy the link or use your mail app.' });
  }
  res.json({ results, code: ride.code });
});

app.get('/api/join/:token', (req, res) => {
  const invite = db.get().invites.find((i) => i.token === req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite expired or invalid' });
  const ride = db.get().rides.find((r) => r.id === invite.rideId);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  res.json({
    token: invite.token,
    email: invite.email,
    ride: {
      id: ride.id,
      name: ride.name,
      startName: ride.startName,
      destName: ride.destName,
      routeLabel: ride.routeLabel,
      code: ride.code,
    },
  });
});

app.post('/api/join/:token', auth, (req, res) => {
  const invite = db.get().invites.find((i) => i.token === req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite expired or invalid' });
  const ride = db.get().rides.find((r) => r.id === invite.rideId);
  const already = db.get().members.find((m) => m.rideId === ride.id && m.userId === req.user.id);
  if (!already) {
    db.update((store) => {
      store.members.push({
        rideId: ride.id,
        userId: req.user.id,
        status: 'riding',
        lat: ride.start.lat,
        lng: ride.start.lng,
        heading: 0,
        speed: 0,
        lastSeen: new Date().toISOString(),
        role: 'rider',
      });
    });
  }
  io.to(`ride:${ride.id}`).emit('ride:update', rideBundle(db.get().rides.find((r) => r.id === ride.id)));
  res.json(rideBundle(db.get().rides.find((r) => r.id === ride.id)));
});

app.post('/api/rides/:id/status', auth, (req, res) => {
  const { status } = req.body || {};
  const ride = db.get().rides.find((r) => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (status === 'completed') {
    const member = db.get().members.find((m) => m.rideId === ride.id && m.userId === req.user.id);
    if (!member) return res.status(403).json({ error: 'You are not on this ride' });
    if (ride.status !== 'live') return res.status(409).json({ error: 'Only a live ride can be finished' });
  } else {
    if (ride.leaderId !== req.user.id) return res.status(403).json({ error: 'Only the ride leader can change this' });
    if (!['planned', 'live', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
  }
  db.update((store) => {
    const row = store.rides.find((r) => r.id === ride.id);
    row.status = status;
  });
  const updated = rideBundle(db.get().rides.find((r) => r.id === ride.id));
  io.to(`ride:${ride.id}`).emit('ride:update', updated);
  res.json(updated);
});

app.post('/api/rides/:id/member-status', auth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['riding', 'fuel', 'rest', 'stopped', 'help', 'puncture', 'breakdown'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid member status' });
  const member = db.get().members.find((m) => m.rideId === req.params.id && m.userId === req.user.id);
  if (!member) return res.status(403).json({ error: 'You are not on this ride' });
  db.update((store) => {
    const row = store.members.find((m) => m.rideId === req.params.id && m.userId === req.user.id);
    row.status = status;
    row.lastSeen = new Date().toISOString();
  });
  const ride = rideBundle(db.get().rides.find((r) => r.id === req.params.id));
  const user = db.get().users.find((u) => u.id === req.user.id);
  io.to(`ride:${req.params.id}`).emit('ride:update', ride);
  if (status !== 'riding') {
    io.to(`ride:${req.params.id}`).emit('ride:alert', {
      type: 'stop',
      userId: req.user.id,
      name: user.name,
      emoji: user.emoji,
      lat: member.lat,
      lng: member.lng,
      status,
      message:
        status === 'fuel'
          ? `${user.name} has stopped for fuel`
          : status === 'puncture'
            ? `${user.name} has a puncture and needs assistance`
            : status === 'breakdown'
              ? `${user.name} has a breakdown and needs assistance`
          : status === 'help'
            ? `${user.name} needs help`
            : `${user.name} has stopped`,
    });
  }
  res.json(ride);
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.on('ride:join', (rideId) => {
    const member = db.get().members.find((m) => m.rideId === rideId && m.userId === socket.user.id);
    if (!member) return;
    socket.join(`ride:${rideId}`);
    socket.emit('ride:update', rideBundle(db.get().rides.find((r) => r.id === rideId)));
  });

  socket.on('ride:location', (payload) => {
    const { rideId, lat, lng, heading, speed } = payload || {};
    const member = db.get().members.find((m) => m.rideId === rideId && m.userId === socket.user.id);
    if (!member) return;
    db.update((store) => {
      const row = store.members.find((m) => m.rideId === rideId && m.userId === socket.user.id);
      row.lat = lat;
      row.lng = lng;
      row.heading = heading || 0;
      row.speed = speed || 0;
      row.lastSeen = new Date().toISOString();
    });
    const ride = db.get().rides.find((r) => r.id === rideId);
    const leader = db.get().members.find((m) => m.rideId === rideId && m.userId === ride.leaderId);
    const dist = haversine({ lat, lng }, leader);
    if (leader && socket.user.id !== ride.leaderId && dist > 2000) {
      const user = db.get().users.find((u) => u.id === socket.user.id);
      io.to(`ride:${rideId}`).emit('ride:alert', {
        type: 'separated',
        userId: socket.user.id,
        name: user.name,
        emoji: user.emoji,
        distanceKm: Math.round((dist / 1000) * 10) / 10,
        message: `${user.name} is ${(dist / 1000).toFixed(1)} km behind the group`,
        lat,
        lng,
      });
    }
    io.to(`ride:${rideId}`).emit('ride:locations', {
      members: rideBundle(ride).members,
    });
  });
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

server.listen(PORT, () => {
  console.log(`RideSync API on http://localhost:${PORT}`);
});
