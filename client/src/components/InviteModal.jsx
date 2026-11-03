import { useState } from 'react';
import { api } from '../api';

export default function InviteModal({ ride, onClose }) {
  const [emails, setEmails] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const joinPath = `${window.location.origin}/app/ride/${ride.id}`;
  const shareText = `Join my RideSync group ride "${ride.name}" (${ride.startName} → ${ride.destName}). Code: ${ride.code}`;

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/rides/${ride.id}/invite`, {
        method: 'POST',
        body: { emails },
      });
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function mailto() {
    const first = emails.split(/[,;\s]+/).filter(Boolean)[0] || '';
    const link = results?.[0]?.joinUrl || `${window.location.origin}/app`;
    window.location.href = `mailto:${first}?subject=${encodeURIComponent('Join my RideSync ride')}&body=${encodeURIComponent(`${shareText}\n${link}`)}`;
  }

  async function copy(text) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Invite friends</h2>
        <p className="muted">Share ride details by email. Recipients get a join link.</p>
        {error && <div className="alert">{error}</div>}
        <form onSubmit={send}>
          <label>Email IDs (comma separated)</label>
          <textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} required />
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send invite email'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={mailto}>
              Open mail app
            </button>
          </div>
        </form>
        <p>
          Ride code <strong>{ride.code}</strong>{' '}
          <button className="linkish" type="button" onClick={() => copy(ride.code)}>
            copy
          </button>
        </p>
        {results && (
          <ul className="invite-results">
            {results.map((r) => (
              <li key={r.email}>
                <div>
                  <strong>{r.email}</strong>
                  <small>{r.note}</small>
                </div>
                <button type="button" className="linkish" onClick={() => copy(r.joinUrl)}>
                  Copy link
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">Dashboard link: {joinPath}</p>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
