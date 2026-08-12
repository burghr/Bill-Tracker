import { useState, useEffect } from 'react';
import { api } from '../api/client';
import CategorySelect from './CategorySelect';

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function AddBillModal({ existing, paychecks, debts, categories, defaultPaycheckId, defaultPeriod, defaultDebt, onSave, onClose }) {
  const [form, setForm] = useState({
    name: defaultDebt ? defaultDebt.name : '',
    amount: defaultDebt && defaultDebt.min_payment > 0 ? defaultDebt.min_payment.toString() : '',
    paycheck_id: defaultPaycheckId || '',
    due_date: '',
    recurrence: 'monthly',
    start_period: defaultPeriod || getCurrentPeriod(),
    debt_id: defaultDebt ? defaultDebt.id.toString() : '',
    is_autopay: false,
    pay_on: '',
    budget_category_id: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null); // waiting for group scope choice

  // Props are just the initial values; re-fetch on open so lists added on
  // other pages (categories, debts) show up without a full page reload.
  const [catList, setCatList] = useState(categories || []);
  const [debtList, setDebtList] = useState(debts || []);
  useEffect(() => {
    api.getBudgetCategories().then(setCatList).catch(() => {});
    api.getDebts().then(setDebtList).catch(() => {});
  }, []);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        amount: existing.amount.toString(),
        paycheck_id: existing.paycheck_id || '',
        due_date: existing.due_date || '',
        recurrence: existing.recurrence || 'monthly',
        start_period: existing.period || getCurrentPeriod(),
        debt_id: existing.debt_id || '',
        is_autopay: !!existing.is_autopay,
        pay_on: existing.pay_on || '',
        budget_category_id: existing.budget_category_id || '',
      });
    }
  }, [existing]);

  async function submitPayload(payload) {
    setLoading(true);
    try {
      let result;
      if (existing) {
        const res = await api.updateBill(existing.id, payload);
        result = res.bill;
      } else {
        result = await api.createBill(payload);
      }
      onSave(result);
    } catch (err) {
      setError(err.message);
      setPendingPayload(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      return setError('Amount must be a positive number');
    }

    const payload = {
      name: form.name,
      amount,
      paycheck_id: form.paycheck_id || null,
      due_date: form.due_date || null,
      recurrence: form.recurrence,
      start_period: form.start_period || null,
      debt_id: form.debt_id || null,
      is_autopay: form.is_autopay,
      pay_on: form.is_autopay ? (form.pay_on || null) : null,
      budget_category_id: form.budget_category_id ? Number(form.budget_category_id) : null,
    };

    // If editing a grouped bill and an assignment changed, ask scope
    const paycheckChanged = existing &&
      existing.group_id &&
      (form.paycheck_id || '') !== (String(existing.paycheck_id || ''));
    const categoryChanged = existing &&
      existing.group_id &&
      (form.budget_category_id || '') !== (String(existing.budget_category_id || ''));

    if (paycheckChanged || categoryChanged) {
      setPendingPayload(payload);
      return;
    }

    await submitPayload(payload);
  }

  async function handleGroupChoice(updateGroup) {
    const payload = { ...pendingPayload, update_group: updateGroup };
    setPendingPayload(null);
    await submitPayload(payload);
  }

  // ── Group scope prompt overlay ──────────────────────────────────────────
  if (pendingPayload) {
    const changes = [];
    if ((form.paycheck_id || '') !== String(existing?.paycheck_id || '')) {
      const newName = paychecks.find(p => String(p.id) === String(pendingPayload.paycheck_id))?.name || 'Unassigned';
      changes.push(`paycheck to ${newName}`);
    }
    if ((form.budget_category_id || '') !== String(existing?.budget_category_id || '')) {
      const catName = catList.find(c => String(c.id) === String(form.budget_category_id))?.name || 'None';
      changes.push(`budget category to ${catName}`);
    }
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h2>Update Bill Assignment</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            This bill repeats monthly. Should the change of <strong style={{ color: 'var(--text)' }}>{changes.join(' and ')}</strong> apply to just this month, or every month in the series?
          </p>
          {error && <p className="error-msg">{error}</p>}
          <div className="actions">
            <button className="btn-ghost" onClick={() => setPendingPayload(null)} disabled={loading}>Cancel</button>
            <button className="btn-ghost" onClick={() => handleGroupChoice(false)} disabled={loading}>
              {loading ? 'Saving…' : 'Just this month'}
            </button>
            <button className="btn-primary" onClick={() => handleGroupChoice(true)} disabled={loading}>
              {loading ? 'Saving…' : 'All months'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal form ─────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{existing ? 'Edit Bill' : 'Add Bill'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. Rent"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
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
            />
          </div>
          {(() => {
            const nonBiweekly = paychecks.filter((p) => p.schedule_type !== 'biweekly');
            const hasBiweekly = paychecks.some((p) => p.schedule_type === 'biweekly');
            // Only show paycheck assignment for non-biweekly paychecks
            if (nonBiweekly.length > 0) {
              return (
                <div className="form-group">
                  <label>Assign to Paycheck</label>
                  <select
                    value={form.paycheck_id}
                    onChange={(e) => setForm({ ...form, paycheck_id: e.target.value })}
                  >
                    <option value="">— Unassigned —</option>
                    {nonBiweekly.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {hasBiweekly && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Biweekly paychecks auto-assign bills by due date.
                    </span>
                  )}
                </div>
              );
            }
            if (hasBiweekly) {
              return (
                <div className="form-group">
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Bills are automatically assigned to biweekly paychecks based on due date.
                  </span>
                </div>
              );
            }
            return null;
          })()}
          <div className="form-group">
            <label>Link to Debt <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
            <select
              value={form.debt_id}
              onChange={(e) => {
                const debtId = e.target.value;
                const debt = debtList.find((d) => d.id === parseInt(debtId));
                if (debt && !existing) {
                  setForm((f) => ({
                    ...f,
                    debt_id: debtId,
                    name: f.name || debt.name,
                    amount: f.amount || (debt.min_payment > 0 ? debt.min_payment.toString() : f.amount),
                  }));
                } else {
                  setForm((f) => ({ ...f, debt_id: debtId }));
                }
              }}
            >
              <option value="">— None —</option>
              {debtList.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {catList.length > 0 && (
            <div className="form-group">
              <label>Budget Category <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <CategorySelect
                categories={catList}
                value={form.budget_category_id}
                onChange={(e) => setForm({ ...form, budget_category_id: e.target.value })}
                allowEmpty
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Paying this bill logs a transaction in the category.
              </span>
            </div>
          )}
          <div className="form-group">
            <label>Recurrence</label>
            <select
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="yearly">Yearly</option>
              <option value="once">One-time</option>
            </select>
          </div>
          {(() => {
            const onlyBiweekly = paychecks.length > 0 && paychecks.every((p) => p.schedule_type === 'biweekly');
            const hasBiweekly = paychecks.some((p) => p.schedule_type === 'biweekly');
            return (
              <div className="form-group">
                <label>
                  Due Date{' '}
                  {onlyBiweekly
                    ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(used for paycheck assignment)</span>
                    : <span style={{ color: 'var(--text-muted)' }}>(optional{hasBiweekly ? ', required for biweekly' : ''})</span>
                  }
                </label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  required={onlyBiweekly}
                />
              </div>
            );
          })()}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_autopay}
                onChange={(e) => setForm({ ...form, is_autopay: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Auto-pay
            </label>
          </div>
          {form.is_autopay && (
            <div className="form-group">
              <label>Pay on</label>
              <input
                type="date"
                value={form.pay_on}
                onChange={(e) => setForm({ ...form, pay_on: e.target.value })}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Bill auto-marks paid once this date has passed. For recurring bills, the day-of-month is reused each period.
              </span>
            </div>
          )}
          {!existing && (
            <div className="form-group">
              <label>Starting Month</label>
              <input
                type="month"
                value={form.start_period}
                onChange={(e) => setForm({ ...form, start_period: e.target.value })}
                required
              />
            </div>
          )}
          {error && <p className="error-msg">{error}</p>}
          <div className="actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : existing ? 'Save Changes' : 'Add Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
