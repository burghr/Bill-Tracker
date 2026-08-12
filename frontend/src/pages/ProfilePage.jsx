import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './AuthPage.css';

function HouseholdSection({ user }) {
  const [household, setHousehold] = useState(null);
  const [addUsername, setAddUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHousehold(await api.getHousehold());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    if (!addUsername.trim()) return;
    setBusy(true);
    try {
      await api.addHouseholdMember(addUsername.trim());
      setAddUsername('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(member) {
    if (!window.confirm(`Remove @${member.username} from the household? They go back to their own budget.`)) return;
    setError('');
    try {
      await api.removeHouseholdMember(member.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLeave() {
    if (!window.confirm('Leave this household? You go back to your own budget.')) return;
    setError('');
    try {
      await api.leaveHousehold();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!household) return null;

  return (
    <div className="auth-card" style={{ marginTop: '20px' }}>
      <h2>Budget Household</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Everyone in the household shares one budget: same categories, same transactions.
        Paychecks from all members count toward household income in budget reports.
      </p>

      <ul style={{ listStyle: 'none', marginBottom: '16px' }}>
        {household.members.map((m) => (
          <li
            key={m.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid var(--border)',
            }}
          >
            <span>
              @{m.username}
              {m.is_owner && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}> · owner</span>}
              {m.id === user.id && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}> · you</span>}
            </span>
            {household.is_owner && !m.is_owner && (
              <button className="btn-danger" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => handleRemove(m)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {household.is_owner ? (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Username to add"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy || !addUsername.trim()} style={{ whiteSpace: 'nowrap' }}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
      ) : (
        <button className="btn-danger-outline" onClick={handleLeave}>Leave household</button>
      )}
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}

export default function ProfilePage({ user, onProfileUpdate }) {
  const [form, setForm] = useState({
    username: user.username,
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.current_password) {
      return setError('Current password is required to make changes');
    }

    if (form.new_password && form.new_password !== form.confirm_password) {
      return setError('New passwords do not match');
    }

    if (form.new_password && form.new_password.length < 6) {
      return setError('New password must be at least 6 characters');
    }

    if (!form.new_password && form.username === user.username) {
      return setError('No changes to save');
    }

    setLoading(true);
    try {
      const body = { current_password: form.current_password };
      if (form.username !== user.username) body.username = form.username;
      if (form.new_password) body.new_password = form.new_password;

      const updated = await api.updateProfile(body);
      onProfileUpdate(updated);
      setForm((f) => ({ ...f, current_password: '', new_password: '', confirm_password: '' }));
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container" style={{ minHeight: 'auto', paddingTop: '40px' }}>
      <div className="auth-card">
        <h2>Profile</h2>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="profile-username">Username</label>
            <input
              id="profile-username"
              name="username"
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="profile-current-password">Current password</label>
            <input
              id="profile-current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="profile-new-password">New password <span style={{ color: 'var(--text-muted)' }}>(leave blank to keep current)</span></label>
            <input
              id="profile-new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            />
          </div>
          {form.new_password && (
            <div className="form-group">
              <label htmlFor="profile-confirm-password">Confirm new password</label>
              <input
                id="profile-confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
              />
            </div>
          )}
          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg" style={{ color: 'var(--green, #a6e3a1)', marginBottom: '8px' }}>{success}</p>}
          <button type="submit" className="btn-primary full-width" disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>

      <HouseholdSection user={user} />
    </div>
  );
}
