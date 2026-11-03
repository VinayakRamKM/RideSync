import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function CreateRide() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: 'Weekend Getaway',
    startName: 'Bangalore',
    destName: 'Mysore',
    routeLabel: 'Via NH 275',
  });
  const [hints, setHints] = useState({ startName: [], destName: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [startCoordinates, setStartCoordinates] = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setStartName(value) {
    setStartCoordinates(null);
    setField('startName', value);
  }

  const { startName, destName } = form;

  useEffect(() => {
    const t = setTimeout(async () => {
      for (const [key, query] of [['startName', startName], ['destName', destName]]) {
        if (key === 'startName' && startCoordinates) continue;
        if (query.length < 2) continue;
        try {
          const rows = await api(`/api/geo/search?q=${encodeURIComponent(query)}`);
          setHints((h) => ({ ...h, [key]: rows }));
        } catch {
          /* ignore */
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [startName, destName, startCoordinates]);

  async function useCurrentLocation() {
    if (!window.isSecureContext) {
      setError('Current location requires a secure (HTTPS) connection.');
      return;
    }
    if (!navigator.geolocation) {
      setError('This browser does not support location access.');
      return;
    }

    setLocating(true);
    setError('');
    const getPosition = (options) =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

    try {
      let position;
      try {
        position = await getPosition({
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 12000,
        });
      } catch (locationError) {
        if (locationError.code === 1) {
          throw new Error('Location permission is blocked. Allow location access in your browser settings and try again.');
        }
        position = await getPosition({
          enableHighAccuracy: false,
          maximumAge: 60000,
          timeout: 20000,
        });
      }
      setStartCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude });
      setField('startName', 'Current location');
    } catch (locationError) {
      const messages = {
        1: 'Location permission is blocked. Allow location access in your browser settings and try again.',
        2: 'Your device could not determine a location. Turn on device location services, check your internet connection, and try again.',
        3: 'Location lookup timed out. Check device location services and internet access, then try again.',
      };
      setError(messages[locationError.code] || locationError.message || 'Unable to access your current location.');
    } finally {
      setLocating(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (startName === 'Current location' && !startCoordinates) {
      setError('Your current location was not attached. Select “Use my current location” again before creating the ride.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ride = await api('/api/rides', {
        method: 'POST',
        body: { ...form, ...(startCoordinates ? { startCoordinates } : {}) },
      });
      navigate(`/app/ride/${ride.id}`, { state: { invite: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <Link to="/app" className="brand compact">
          <span className="pin">📍</span> Ride<span>Sync</span>
        </Link>
      </header>
      <main className="create-wrap">
        <form className="card phone-form" onSubmit={submit}>
          <h1>Create Ride</h1>
          {error && <div className="alert">{error}</div>}
          <label>Ride Name</label>
          <input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          <label htmlFor="start-point">Start Point</label>
          <input
            id="start-point"
            value={form.startName}
            onChange={(e) => setStartName(e.target.value)}
            required
          />
          <button className="btn btn-ghost" type="button" onClick={useCurrentLocation} disabled={locating || busy}>
            {locating ? 'Getting location…' : 'Use my current location'}
          </button>
          {startCoordinates && <p className="muted">Using your current browser location as the ride start.</p>}
          {!startCoordinates && (
            <div className="hints">
              {hints.startName.slice(0, 4).map((h) => (
                <button type="button" key={h.name + h.lat} onClick={() => setStartName(h.name)}>
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <label htmlFor="destination">Destination</label>
          <input id="destination" value={form.destName} onChange={(e) => setField('destName', e.target.value)} required />
          <div className="hints">
            {hints.destName.slice(0, 4).map((h) => (
              <button type="button" key={h.name + h.lat} onClick={() => setField('destName', h.name)}>
                {h.name}
              </button>
            ))}
          </div>
          <label>Route</label>
          <input value={form.routeLabel} onChange={(e) => setField('routeLabel', e.target.value)} />
          <button className="btn btn-primary" disabled={busy || locating}>
            {busy ? 'Creating…' : 'Create Ride'}
          </button>
        </form>
      </main>
    </div>
  );
}
