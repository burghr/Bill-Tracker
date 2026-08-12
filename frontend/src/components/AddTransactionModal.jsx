import { useState } from 'react';
import { api } from '../api/client';
import CategorySelect from './CategorySelect';

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function AddTransactionModal({ existing, categories, defaultCategoryId, onSave, onClose }) {
  const [form, setForm] = useState(() => existing
    ? {
        date: existing.date,
        amount: existing.amount.toString(),
        category_id: existing.category_id,
        description: existing.description,
      }
    : {
        date: today(),
        amount: '',
        category_id: defaultCategoryId || (categories[0] ? categories[0].id : ''),
        description: '',
      });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      return setError('Amount must be a positive number');
    }
    setLoading(true);
    try {
      const body = {
        date: form.date,
        amount,
        category_id: Number(form.category_id),
        description: form.description,
      };
      const result = existing
        ? await api.updateBudgetTransaction(existing.id, body)
        : await api.createBudgetTransaction(body);
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
        <h2>{existing ? 'Edit Transaction' : 'Add Transaction'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <CategorySelect
              categories={categories}
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Description <span style={{ textTransform: 'none' }}>(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Groceries at Costco"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : existing ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
