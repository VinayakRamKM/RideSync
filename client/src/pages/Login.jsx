import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(location.state?.from || '/app', { replace: true });
  }, [user, location.state, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/app', { replace: true });
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
        <h1>Welcome back</h1>
        <p>Login with the email you registered.</p>
        {error && <div className="alert">{error}</div>}
        <label>Email ID</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
        <p className="muted">
          New rider? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
