import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CreateRide from './pages/CreateRide.jsx';
import RideMap from './pages/RideMap.jsx';
import JoinRide from './pages/JoinRide.jsx';

function Guard({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="boot">Loading RideSync…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  const { ready } = useAuth();
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('ridesync-theme') === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ridesync-theme', theme);
  }, [theme]);

  return (
    <>
      {ready ? (
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/join/:token" element={<JoinRide />} />
          <Route
            path="/app"
            element={
              <Guard>
                <Dashboard />
              </Guard>
            }
          />
          <Route
            path="/app/create"
            element={
              <Guard>
                <CreateRide />
              </Guard>
            }
          />
          <Route
            path="/app/ride/:id"
            element={
              <Guard>
                <RideMap />
              </Guard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <div className="boot">Loading RideSync…</div>
      )}
      <button
        className="theme-toggle"
        type="button"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      >
        {theme === 'dark' ? '☀ Light' : '☾ Dark'}
      </button>
    </>
  );
}
