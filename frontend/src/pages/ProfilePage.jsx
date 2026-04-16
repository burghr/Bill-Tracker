import { useState } from 'react';
import { api } from '../api/client';
import './AuthPage.css';

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
    </div>
  );
}
