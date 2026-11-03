import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(name, email, password);
      const pending = sessionStorage.getItem('ridesync_join');
      navigate(pending ? `/join/${pending}` : '/app', { replace: true });
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
      <form className="card" onSubmit={onSubmit}>
        <h1>Create your RideSync ID</h1>
        <p>Register with your email to plan and share group rides.</p>
        {error && <div className="alert">{error}</div>}
        <label>Full name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} />
        <label>Email ID</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
        <p className="muted">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}
