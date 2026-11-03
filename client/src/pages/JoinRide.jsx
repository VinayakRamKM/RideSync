import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';

export default function JoinRide() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/join/${token}`)
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [token]);

  async function accept() {
    if (!user) {
      sessionStorage.setItem('ridesync_join', token);
      navigate('/register');
      return;
    }
    setBusy(true);
    try {
      const ride = await api(`/api/join/${token}`, { method: 'POST' });
      sessionStorage.removeItem('ridesync_join');
      navigate(`/app/ride/${ride.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <Link to="/" className="brand">
        <span className="pin">📍</span> Ride<span>Sync</span>
      </Link>
      <div className="card">
        <h1>Join group ride</h1>
        {error && <div className="alert">{error}</div>}
        {invite && (
          <>
            <p>
              You’ve been invited to <strong>{invite.ride.name}</strong>
            </p>
            <p className="muted">
              {invite.ride.startName} → {invite.ride.destName}
              {invite.ride.routeLabel ? ` · ${invite.ride.routeLabel}` : ''}
            </p>
            <button className="btn btn-primary" onClick={accept} disabled={busy}>
              {user ? (busy ? 'Joining…' : 'Join ride') : 'Register & join'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
