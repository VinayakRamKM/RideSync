import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function load() {
  try {
    const data = await api('/api/rides');
    setRides(data);
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function join(e) {
    e.preventDefault();
    setError('');
    try {
      const ride = await api('/api/rides/join', { method: 'POST', body: { code } });
      navigate(`/app/ride/${ride.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <Link to="/" className="brand compact">
          <span className="pin">📍</span> Ride<span>Sync</span>
        </Link>
        <div className="app-bar-user">
          <span>
            {user.emoji} {user.name}
          </span>
          <button className="btn btn-ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <main className="dash">
        <div className="dash-hero">
          <div>
            <h1>Your group rides</h1>
            <p>Create a ride, pick start and destination, then invite the pack.</p>
          </div>
          <Link className="btn btn-primary" to="/app/create">
            Create ride
          </Link>
        </div>
        {error && (
  <div className="alert" role="alert">
    {error}
  </div>
)}
        <form className="join-row" onSubmit={join}>
          <input
            placeholder="Enter ride code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn btn-primary" type="submit">
            Join ride
          </button>
        </form>
        {loading ? (
  <div className="dashboard-loading" role="status">
    <div className="loading-spinner" />
    <p>Loading your rides...</p>
  </div>
) : rides.length === 0 ? (
  <section className="empty-state">
    <div className="empty-state-icon">🏍️</div>
    <h2>No rides yet!</h2>
    <p>
      Your next adventure starts here.
      Create a ride and invite your friends to join.
    </p>
    <Link className="btn btn-primary" to="/app/create">
      Plan your first ride
    </Link>
  </section>
) : (
  <div className="ride-grid">
    {rides.map((ride) => (
      <Link
        key={ride.id}
        className="ride-card"
        to={`/app/ride/${ride.id}`}
      >
        <div className={`pill ${ride.status}`}>
          {ride.status}
        </div>
        <h3>{ride.name}</h3>
        <p>
          {ride.startName} → {ride.destName}
        </p>
        <small>
          {ride.members.length} riders · code {ride.code}
        </small>
      </Link>
    ))}
  </div>
)}
      </main>
    </div>
  );
}
