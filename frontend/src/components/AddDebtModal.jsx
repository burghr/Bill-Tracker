import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function AddDebtModal({ existing, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    name: '',
    type: 'loan',
    original_balance: '',
    current_balance: '',
    interest_rate: '',
    min_payment: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        type: existing.type,
        original_balance: existing.original_balance.toString(),
        current_balance: existing.current_balance.toString(),
        interest_rate: existing.interest_rate.toString(),
        min_payment: existing.min_payment.toString(),
      });
    }
  }, [existing]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const original_balance = parseFloat(form.original_balance);
    const current_balance = parseFloat(form.current_balance !== '' ? form.current_balance : form.original_balance);
    const interest_rate = parseFloat(form.interest_rate || '0');
    const min_payment = parseFloat(form.min_payment || '0');

    if (!form.name.trim()) return setError('Name is required');
    if (isNaN(original_balance) || original_balance < 0) return setError('Original balance must be a non-negative number');
    if (isNaN(current_balance) || current_balance < 0) return setError('Current balance must be a non-negative number');

    setLoading(true);
    try {
      const payload = { name: form.name.trim(), type: form.type, original_balance, current_balance, interest_rate, min_payment };
      let result;
      if (existing) {
        result = await api.updateDebt(existing.id, payload);
      } else {
        result = await api.createDebt(payload);
      }
      onSave(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${existing.name}"? Bills linked to this debt will be unlinked.`)) return;
    setLoading(true);
    try {
      await api.deleteDebt(existing.id);
      onDelete(existing.id);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{existing ? 'Edit Debt' : 'Add Debt'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. Car Loan"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="loan">Loan</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Original Balance ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.original_balance}
              onChange={(e) => set('original_balance', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Current Balance ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={form.original_balance || '0.00'}
              value={form.current_balance}
              onChange={(e) => set('current_balance', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Interest Rate (% APR)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.interest_rate}
              onChange={(e) => set('interest_rate', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Minimum Payment ($/mo)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.min_payment}
              onChange={(e) => set('min_payment', e.target.value)}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="actions">
            {existing && (
              <button type="button" className="btn-ghost btn-danger" onClick={handleDelete} disabled={loading}>
                Delete
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : existing ? 'Save Changes' : 'Add Debt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
