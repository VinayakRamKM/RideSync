import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { API_BASE_URL, api, getToken } from '../api';
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

function turnGuidance(step, distance) {
  const instruction = turnText(step);
  if (distance == null) return instruction;
  return distance <= 20 ? `${instruction} now` : `${instruction} after ${formatKm(distance)}`;
}

function distanceMeters(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  const clampedValue = Math.min(1, value);
  return 6371000 * 2 * Math.atan2(Math.sqrt(clampedValue), Math.sqrt(1 - clampedValue));
}

export default function RideMap() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);
  const [route, setRoute] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToManeuver, setDistanceToManeuver] = useState(null);
  const [navigationFocus, setNavigationFocus] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(Boolean(location.state?.invite));
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState('');
  const [geolocationError, setGeolocationError] = useState('');
  const [followMe, setFollowMe] = useState(true);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [navTarget, setNavTarget] = useState(null);
  const [navRoute, setNavRoute] = useState(null);
  const socketRef = useRef(null);
  const posRef = useRef(null);
  const directionsRouteRef = useRef(null);
  const stepIndexRef = useRef(0);
  const progressOriginRef = useRef(null);
  const lastProgressPositionRef = useRef(null);
  const distanceTravelledRef = useRef(0);
  const previousManeuverDistanceRef = useRef(null);

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
  const directionsRoute = navTarget ? navRoute : route;
  directionsRouteRef.current = directionsRoute;
  const activeStepIndex = Math.min(currentStepIndex, Math.max(0, (directionsRoute?.steps?.length || 1) - 1));
  const currentStep = directionsRoute?.steps?.[activeStepIndex];
  const nextStep = directionsRoute?.steps?.[activeStepIndex + 1];
  const directionText = nextStep
    ? turnGuidance(nextStep, distanceToManeuver ?? directionsRoute.steps[activeStepIndex]?.distance)
    : turnText(currentStep);

  useEffect(() => {
    stepIndexRef.current = 0;
    setCurrentStepIndex(0);
    distanceTravelledRef.current = 0;
    lastProgressPositionRef.current = progressOriginRef.current;
    previousManeuverDistanceRef.current = null;
    const firstStepDistance = directionsRoute?.steps?.[0]?.distance;
    setDistanceToManeuver(Number.isFinite(firstStepDistance) ? firstStepDistance : null);
  }, [directionsRoute]);

  useEffect(() => {
    let cancelled = false;
    api(`/api/rides/${id}`)
      .then(async (data) => {
        if (cancelled) return;
        setRide(data);
        try {
          progressOriginRef.current = data.start;
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
    const socket = io(API_BASE_URL || undefined, { auth: { token: getToken() } });
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
    let cancelled = false;
    let routeRequested = false;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setGeolocationError('');
        const { latitude, longitude, heading, speed } = pos.coords;
        emitLocation(latitude, longitude, heading || 0, speed || 0);
        const activeRoute = directionsRouteRef.current;
        const currentPosition = { lat: latitude, lng: longitude };
        const activeIndex = stepIndexRef.current;
        const currentSegment = activeRoute?.steps?.[activeIndex];
        const nextStep = activeRoute?.steps?.[activeIndex + 1];
        if (
          ride.status === 'live' &&
          (ride.leaderId === user.id || navTarget?.userId) &&
          currentSegment &&
          nextStep
        ) {
          if (lastProgressPositionRef.current) {
            const movement = distanceMeters(lastProgressPositionRef.current, currentPosition);
            const movementThreshold = Math.max(3, Math.min(10, (pos.coords.accuracy || 0) * 0.1));
            if (movement > movementThreshold) distanceTravelledRef.current += movement;
          }
          lastProgressPositionRef.current = currentPosition;
          const remaining = Math.max(0, currentSegment.distance - distanceTravelledRef.current);
          setDistanceToManeuver(remaining);

          if (nextStep.location) {
            const distanceToTurn = distanceMeters(currentPosition, nextStep.location);
            const previousDistance = previousManeuverDistanceRef.current;
            const threshold = Math.max(25, Math.min(60, pos.coords.accuracy || 0));
            const minimumTravel = Math.min(20, (currentSegment.distance || 0) / 2);
            const hasPassedTurn =
              previousDistance !== null &&
              previousDistance <= threshold * 1.5 &&
              distanceToTurn > previousDistance + 8;
            if (
              distanceTravelledRef.current >= minimumTravel &&
              (distanceToTurn <= threshold || hasPassedTurn)
            ) {
              stepIndexRef.current += 1;
              setCurrentStepIndex(stepIndexRef.current);
              distanceTravelledRef.current = 0;
              previousManeuverDistanceRef.current = null;
              const nextSegment = activeRoute.steps[stepIndexRef.current];
              setDistanceToManeuver(Number.isFinite(nextSegment?.distance) ? nextSegment.distance : null);
            } else {
              previousManeuverDistanceRef.current = distanceToTurn;
            }
          }
        }
        if (ride.status === 'live' && ride.leaderId === user.id && !routeRequested) {
          routeRequested = true;
          progressOriginRef.current = currentPosition;
          setNavigationFocus(currentPosition);
          loadRoute(currentPosition, ride.dest)
            .then((r) => {
              if (!cancelled) {
                setRoute(r);
                setError('');
              }
            })
            .catch((err) => {
              if (!cancelled) setError(err.message);
            });
        }
      },
      (positionError) => {
       const messages = {
  // Error Code 1: Permission Denied
  1: 'Location access is blocked. Allow location access in your browser settings to share your live position.',

  // Error Code 2: Position Unavailable
  2: 'Your current location is unavailable. Check your device location services and try again.',

  // Error Code 3: Timeout
  3: 'Could not get your location in time. Keep location services enabled and try again.',
};
        setGeolocationError(messages[positionError.code] || 'Unable to access your live location.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watch);
    };
  }, [
    rideId,
    ride?.status,
    ride?.leaderId,
    ride?.dest.lat,
    ride?.dest.lng,
    user.id,
    navTarget?.userId,
    emitLocation,
    loadRoute,
  ]);

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
    progressOriginRef.current = from;
    setNavTarget(member);
    setNavRoute(r);
    setFollowMe(false);
  }

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
        {live ? (
          <div className="current-direction" aria-live="polite">
            <div>
              <strong>{directionsRoute?.steps?.length ? directionText : 'Getting directions…'}</strong>
              <span>
                {navTarget
                  ? `${formatKm(navRoute?.distance)} · ${formatEta(navRoute?.duration)}`
                  : `${formatKm(remaining?.distance ?? route?.distance)} · ${formatEta(remaining?.duration ?? route?.duration)}`}
              </span>
            </div>
          </div>
        ) : (
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
        )}
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
        navigationFocus={navigationFocus}
        recenterRequest={recenterRequest}
        target={navRoute}
        onSelectMember={navigateTo}
      />

      {locationError && (
        <div className="location-error" role="status">
          {locationError}
        </div>
      )}
      {error && (
        <div className="location-error" role="alert">
          {error}
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
              onClick={async () => {
                const member = ride.members.find((m) => m.userId === alert.userId) || alert;
                if (member) {
                  await navigateTo(member);
                  setAlert(null);
                }
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
          {ride.status === 'completed' && (
            <button className="btn btn-primary" onClick={() => navigate('/app')}>
              Close
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
          <button
            className="btn btn-ghost"
            onClick={() => {
              setFollowMe(true);
              setRecenterRequest((request) => request + 1);
            }}
          >
            Recenter on me
          </button>
        </div>
      </aside>

      {inviteOpen && <InviteModal ride={ride} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
