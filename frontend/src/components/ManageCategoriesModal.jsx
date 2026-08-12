import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './ManageCategoriesModal.css';

function CategoryRow({ cat, isChild, onSaved, onDeleted }) {
  const [name, setName] = useState(cat.name);
  const [amount, setAmount] = useState(cat.monthly_amount.toString());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const dirty = name !== cat.name || parseFloat(amount) !== cat.monthly_amount;

  async function handleSave() {
    setError('');
    const monthly_amount = parseFloat(amount);
    if (isNaN(monthly_amount) || monthly_amount < 0) {
      return setError('Amount must be a non-negative number');
    }
    setSaving(true);
    try {
      const updated = await api.updateBudgetCategory(cat.id, { name: name.trim(), monthly_amount });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${cat.name}"? If it has transactions it will be archived instead so history is kept.`)) return;
    try {
      await api.deleteBudgetCategory(cat.id);
      onDeleted(cat.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestore() {
    try {
      const updated = await api.updateBudgetCategory(cat.id, { archived: false });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className={`cat-row ${cat.archived ? 'archived' : ''} ${isChild ? 'cat-row-child' : ''}`}>
        {isChild && <span className="cat-child-arrow">↳</span>}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!!cat.archived} />
        <div className="cat-amount-wrap">
          <span className="cat-dollar">$</span>
          <input
            type="number" step="0.01" min="0" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!!cat.archived}
          />
        </div>
        {cat.archived ? (
          <button className="btn-ghost btn-sm" onClick={handleRestore}>Restore</button>
        ) : (
          <button className="btn-primary btn-sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? '…' : 'Save'}
          </button>
        )}
        <button className="btn-danger btn-sm" onClick={handleDelete} disabled={!!cat.archived}>Delete</button>
      </div>
      {error && <p className="error-msg">{error}</p>}
    </>
  );
}

export default function ManageCategoriesModal({ onClose }) {
  const [categories, setCategories] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newParent, setNewParent] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await api.getBudgetCategories(true));
    } catch (err) {
      console.error(err);
      setCategories([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const monthly_amount = parseFloat(newAmount);
    if (!newName.trim()) return setError('Name is required');
    if (isNaN(monthly_amount) || monthly_amount < 0) {
      return setError('Amount must be a non-negative number');
    }
    setAdding(true);
    try {
      const created = await api.createBudgetCategory({
        name: newName.trim(),
        monthly_amount,
        parent_id: newParent ? Number(newParent) : null,
      });
      setCategories((prev) => [...prev, created]);
      setNewName('');
      setNewAmount('');
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  function handleSaved(updated) {
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleDeleted() {
    load();
  }

  if (categories === null) {
    return (
      <div className="modal-overlay">
        <div className="modal"><div className="loading">Loading…</div></div>
      </div>
    );
  }

  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <h2>Budget Categories</h2>
        <p className="cat-hint">
          Each category gets a monthly amount. Subcategories share their parent's budget;
          give a subcategory its own amount only if you want a sub-limit inside the parent's total.
        </p>

        <form className="cat-add-form" onSubmit={handleAdd}>
          <div className="cat-row cat-add-row">
            <input
              type="text" placeholder="New category (e.g. Food)"
              value={newName} onChange={(e) => setNewName(e.target.value)}
            />
            <div className="cat-amount-wrap">
              <span className="cat-dollar">$</span>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={newAmount} onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>
            <select
              className="cat-parent-select"
              value={newParent}
              onChange={(e) => setNewParent(e.target.value)}
            >
              <option value="">Top level</option>
              {active.filter((c) => !c.parent_id).map((c) => (
                <option key={c.id} value={c.id}>Under {c.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary btn-sm" disabled={adding}>
              {adding ? '…' : '+ Add'}
            </button>
          </div>
        </form>
        {error && <p className="error-msg">{error}</p>}

        <div className="cat-list">
          {active.length === 0 && <p className="cat-empty">No categories yet. Add your first one above.</p>}
          {active.filter((c) => !c.parent_id).map((cat) => (
            <div key={cat.id}>
              <CategoryRow cat={cat} onSaved={handleSaved} onDeleted={handleDeleted} />
              {active.filter((c) => c.parent_id === cat.id).map((child) => (
                <CategoryRow key={child.id} cat={child} isChild onSaved={handleSaved} onDeleted={handleDeleted} />
              ))}
            </div>
          ))}
        </div>

        {archived.length > 0 && (
          <div className="cat-archived-section">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
            </button>
            {showArchived && archived.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} onSaved={handleSaved} onDeleted={handleDeleted} />
            ))}
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
