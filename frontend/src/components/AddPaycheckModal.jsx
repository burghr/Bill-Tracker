import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function AddPaycheckModal({ existing, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    schedule_type: 'twice_monthly',
    amount: '',
    anchor_date: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        schedule_type: existing.schedule_type,
        amount: existing.amount.toString(),
        anchor_date: existing.anchor_date || '',
      });
    }
  }, [existing]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) {
      return setError('Amount must be a non-negative number');
    }
    setLoading(true);
    try {
      let result;
      if (existing) {
        result = await api.updatePaycheck(existing.id, { ...form, amount });
      } else {
        result = await api.createPaycheck({ ...form, amount });
      }
      onSave(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{existing ? 'Edit Paycheck' : 'Add Paycheck'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. 1st Check"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Schedule</label>
            <select
              value={form.schedule_type}
              onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
            >
              <option value="twice_monthly">Twice Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {form.schedule_type === 'biweekly' && (
            <div className="form-group">
              <label>Next Pay Date</label>
              <input
                type="date"
                value={form.anchor_date}
                onChange={(e) => setForm({ ...form, anchor_date: e.target.value })}
                required
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                All future pay dates are calculated from this date (every 14 days).
              </span>
            </div>
          )}
          <div className="form-group">
            <label>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : existing ? 'Save Changes' : 'Add Paycheck'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
