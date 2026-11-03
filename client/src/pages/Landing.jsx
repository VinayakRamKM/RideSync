import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

function Phone({ image, alt }) {
  return (
    <div className="phone-shot">
      <img src={image} alt={alt} loading="lazy" />
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <header className="hero">
        <div className="hero-copy">
          <div className="landing-brand">
            <span className="landing-brand-mark" aria-hidden="true">📍</span>
            <span>Ride<span>Sync</span></span>
          </div>
          <h1>Same Roads. Same Vibes. Always Together.</h1>
          <p className="lede">
            Real-time group ride coordination and rejoin system for a safer, smoother, and more
            connected journey.
          </p>
          <div className="hero-actions">
            {user ? (
              <Link className="btn btn-primary" to="/app">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link className="btn btn-primary" to="/register">
                  Create account
                </Link>
                <Link className="btn btn-ghost" to="/login">
                  Login
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="hero-note">
          <span>Group rides</span>
          <strong>made easier</strong>
        </div>
      </header>

      <main>
      <section className="landing-steps" aria-label="How RideSync works">
        <article className="step-card">
          <h2><span>1</span>Create / Join Ride</h2>
          <p>Plan your trip, set the route, and invite your friends.</p>
          <Phone image="/landing/create-ride.png" alt="Ride creation screen showing the Weekend Getaway route form" />
        </article>
        <article className="step-card">
          <h2><span>2</span>Live Group Map</h2>
          <p>See all group members on a live map with their status.</p>
          <Phone image="/landing/live-map.png" alt="Live group map screen showing rider locations and statuses" />
        </article>
        <article className="step-card">
          <h2><span>3</span>Get Notified</h2>
          <p>If a member stops or falls behind, the group gets an instant alert.</p>
          <Phone image="/landing/rider-alert.png" alt="Rider alert screen with an option to navigate to Arjun" />
        </article>
        <article className="step-card">
          <h2><span>4</span>Rejoin the Group</h2>
          <p>Navigate to the separated rider and get back together.</p>
          <Phone image="/landing/rejoin-navigation.png" alt="Navigation screen guiding a rider back to the group" />
        </article>
        <article className="step-card">
          <h2><span>5</span>Continue the Journey</h2>
          <p>Once everyone is back together, resume your ride with ease.</p>
          <Phone image="/landing/ride-resume.png" alt="Ride complete screen confirming the group is reunited with a Resume Ride button" />
        </article>
      </section>

      <section className="features">
        <div>
          <h2>Key Features</h2>
          <p>More than just a map — it’s your ride companion.</p>
        </div>
        <ul>
          <li>
            <span aria-hidden="true">⌖</span>
            <strong>Live Location Tracking</strong>
            See every rider’s real-time location on the map.
          </li>
          <li>
            <span aria-hidden="true">♟</span>
            <strong>Group Status</strong>
            Know who’s riding, stopped, resting or needs help.
          </li>
          <li>
            <span aria-hidden="true">♧</span>
            <strong>Separation Alerts</strong>
            Get notified when someone falls behind or gets separated.
          </li>
          <li>
            <span aria-hidden="true">➤</span>
            <strong>Navigate to Rider</strong>
            Find and reach a separated member easily.
          </li>
          <li>
            <span aria-hidden="true">⬟</span>
            <strong>Roadside Alerts</strong>
            Let the group know about fuel stops, punctures, or breakdowns.
          </li>
        </ul>
      </section>
      </main>

      <footer className="site-foot">
        <div className="landing-brand footer-brand">
          <span className="landing-brand-mark" aria-hidden="true">⌖</span>
          <span>Ride<span>Sync</span></span>
        </div>
        <p>Stay Connected · Stay Safe · Ride Together</p>
        <div className="footer-mountains" aria-hidden="true">⌁</div>
      </footer>
    </div>
  );
}
