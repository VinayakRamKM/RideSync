import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, getToken } from '../api';
import { useAuth } from '../AuthContext.jsx';
import InviteModal from '../components/InviteModal.jsx';
import RideMapView from '../components/RideMapView.jsx';

function formatKm(m) {
  if (m == null) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatEta(seconds) {
  if (seconds == null) return '—';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr ${min % 60} min`;
}

function turnText(step) {
  if (!step) return 'Continue';
  const t = `${step.instruction || ''} ${step.name || ''}`.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function RideMap() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [ride, setRide] = useState(null);
  const [route, setRoute] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(Boolean(location.state?.invite));
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState('');
  const [geolocationError, setGeolocationError] = useState('');
  const [followMe, setFollowMe] = useState(true);
  const [navTarget, setNavTarget] = useState(null);
  const [navRoute, setNavRoute] = useState(null);
  const socketRef = useRef(null);
  const posRef = useRef(null);

  const me = ride?.members.find((m) => m.userId === user.id);
  const rideId = ride?.id;
  const locationError = !ride
    ? ''
    : !window.isSecureContext
      ? 'Live location requires a secure (HTTPS) connection.'
      : !navigator.geolocation
        ? 'This browser does not support live location.'
        : geolocationError;

  const loadRoute = useCallback(async (from, to) => {
    return api(`/api/geo/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api(`/api/rides/${id}`)
      .then(async (data) => {
        if (cancelled) return;
        setRide(data);
        try {
          const r = await loadRoute(data.start, data.dest);
          if (!cancelled) setRoute(r);
        } catch (err) {
          if (!cancelled) setError(err.message);
        }
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, loadRoute]);

  useEffect(() => {
    const socket = io({ auth: { token: getToken() } });
    socketRef.current = socket;
    socket.emit('ride:join', id);
    socket.on('ride:update', setRide);
    socket.on('ride:locations', (payload) => {
      setRide((prev) => (prev ? { ...prev, members: payload.members } : prev));
    });
    socket.on('ride:alert', (payload) => {
      if (payload.userId !== user.id) setAlert(payload);
    });
    return () => socket.disconnect();
  }, [id, user.id]);

  const emitLocation = useCallback(
    (lat, lng, heading = 0, speed = 0) => {
      posRef.current = { lat, lng, heading };
      socketRef.current?.emit('ride:location', { rideId: id, lat, lng, heading, speed });
    },
    [id]
  );

  useEffect(() => {
    if (!rideId || !window.isSecureContext || !navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setGeolocationError('');
        const { latitude, longitude, heading, speed } = pos.coords;
        emitLocation(latitude, longitude, heading || 0, speed || 0);
      },
      (positionError) => {
        const messages = {
          1: 'Location access is blocked. Allow location access in your browser settings to share your live position.',
          2: 'Your current location is unavailable. Check your device location services and try again.',
          3: 'Could not get your location in time. Keep location services enabled and try again.',
        };
        setGeolocationError(messages[positionError.code] || 'Unable to access your live location.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [rideId, emitLocation]);

  async function changeRideStatus(status) {
    const updated = await api(`/api/rides/${id}/status`, { method: 'POST', body: { status } });
    setRide(updated);
  }

  async function changeMine(status) {
    const updated = await api(`/api/rides/${id}/member-status`, { method: 'POST', body: { status } });
    setRide(updated);
  }

  async function navigateTo(member) {
    const from = posRef.current || me || ride.start;
    const to = { lat: member.lat, lng: member.lng };
    const r = await loadRoute(from, to);
    setNavTarget(member);
    setNavRoute(r);
    setFollowMe(false);
  }

  const currentStep = route?.steps?.[0];
  const remaining = route
    ? {
        distance: route.steps?.reduce((sum, step) => sum + step.distance, 0) || 0,
        duration: route.steps?.reduce((sum, step) => sum + step.duration, 0) || 0,
      }
    : null;

  if (error && !ride) {
    return (
      <div className="app-shell">
        <div className="card">{error}</div>
      </div>
    );
  }
  if (!ride) return <div className="boot">Loading map…</div>;

  const live = ride.status === 'live';

  return (
    <div className="map-page">
      <header className="nav-banner">
        <div>
          <strong>
            {navTarget
              ? `${formatKm(navRoute?.distance)} · Navigate to ${navTarget.name}`
              : currentStep
                ? turnText(currentStep)
                : `${ride.startName} → ${ride.destName}`}
          </strong>
          <span>
            {navTarget
              ? formatEta(navRoute?.duration)
              : `${formatKm(remaining?.distance ?? route?.distance)} · ${formatEta(remaining?.duration ?? route?.duration)}`}
          </span>
        </div>
        <Link to="/app" className="back">
          Dashboard
        </Link>
      </header>

      <RideMapView
        ride={ride}
        members={ride.members}
        meId={user.id}
        route={route}
        followId={followMe ? user.id : navTarget?.userId}
        target={navRoute}
        onSelectMember={navigateTo}
      />

      {locationError && (
        <div className="location-error" role="status">
          {locationError}
        </div>
      )}

      {alert && (
        <div className="float-alert">
          <p>
            {alert.emoji} {alert.message}
          </p>
          {alert.userId && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const member = ride.members.find((m) => m.userId === alert.userId) || alert;
                if (member) navigateTo(member);
              }}
            >
              Navigate to {alert.name}
            </button>
          )}
          <button className="linkish" onClick={() => setAlert(null)}>
            Dismiss
          </button>
        </div>
      )}

      <aside className="map-sheet">
        <div className="sheet-head">
          <div>
            <h2>{ride.name}</h2>
            <p className="muted">
              {ride.startName} → {ride.destName}
              {ride.routeLabel ? ` · ${ride.routeLabel}` : ''}
            </p>
          </div>
          <div className={`pill ${ride.status}`}>{ride.status}</div>
        </div>
        <ul className="rider-list">
          {ride.members.map((m) => (
            <li key={m.userId}>
              <span className="emoji">{m.emoji}</span>
              <div>
                <strong>
                  {m.name}
                  {m.userId === ride.leaderId ? ' (Group Leader)' : ''}
                  {m.userId === user.id ? ' · You' : ''}
                </strong>
                <small className={m.status}>{m.status === 'fuel' ? 'Fuel Stop' : m.status}</small>
              </div>
              {m.userId !== user.id && (
                <button className="linkish" onClick={() => navigateTo(m)}>
                  Navigate
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="sheet-actions">
          {ride.leaderId === user.id && ride.status === 'planned' && (
            <button className="btn btn-primary" onClick={() => changeRideStatus('live')}>
              Start ride
            </button>
          )}
          {ride.leaderId === user.id && live && (
            <button className="btn btn-primary" onClick={() => changeRideStatus('planned')}>
              Pause / Regroup
            </button>
          )}
          {live && (
            <button className="btn danger" onClick={() => changeRideStatus('completed')}>
              Finish ride
            </button>
          )}
          {ride.status !== 'live' && ride.status !== 'completed' && (
            <button className="btn btn-ghost" onClick={() => setInviteOpen(true)}>
              Share / email invite
            </button>
          )}
          <button
            className="btn btn-ghost"
            aria-pressed={me?.status === 'fuel'}
            onClick={() => changeMine(me?.status === 'fuel' ? 'riding' : 'fuel')}
          >
            {me?.status === 'fuel' ? 'Back on road' : 'Fuel stop'}
          </button>
          <button
            className="btn btn-ghost"
            aria-pressed={me?.status === 'puncture'}
            onClick={() => changeMine(me?.status === 'puncture' ? 'riding' : 'puncture')}
          >
            {me?.status === 'puncture' ? 'Clear puncture' : 'Puncture'}
          </button>
          <button
            className="btn btn-ghost"
            aria-pressed={me?.status === 'breakdown'}
            onClick={() => changeMine(me?.status === 'breakdown' ? 'riding' : 'breakdown')}
          >
            {me?.status === 'breakdown' ? 'Clear breakdown' : 'Breakdown'}
          </button>
          <button className="btn btn-ghost" onClick={() => setFollowMe(true)}>
            Recenter on me
          </button>
        </div>
      </aside>

      {inviteOpen && <InviteModal ride={ride} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
