import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import DebtItem from '../components/DebtItem';
import AddDebtModal from '../components/AddDebtModal';
import AddBillModal from '../components/AddBillModal';
import './DebtsPage.css';

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DebtSection({ label, debts, bills, onEdit, onDelete, onAddBill, sortActive }) {
  const [localDebts, setLocalDebts] = useState(debts);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setLocalDebts(debts);
  }, [debts]);

  if (debts.length === 0) return null;

  const total = debts.reduce((sum, d) => sum + d.current_balance, 0);
  const displayDebts = sortActive ? debts : localDebts;

  function handleDragStart(id) {
    dragging.current = true;
    setDraggedId(id);
  }

  function handleDragOver(e, id) {
    e.preventDefault();
    setDragOverId(id);
  }

  function handleDrop(e, id) {
    e.preventDefault();
    if (draggedId === id) { handleDragEnd(); return; }
    const from = localDebts.findIndex((d) => d.id === draggedId);
    const to = localDebts.findIndex((d) => d.id === id);
    if (from === -1 || to === -1) { handleDragEnd(); return; }

    const reordered = [...localDebts];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setLocalDebts(reordered);
    handleDragEnd();

    api.reorderDebts(reordered.map((d, i) => ({ id: d.id, sort_order: i }))).catch(console.error);
  }

  function handleDragEnd() {
    dragging.current = false;
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <section className="debts-section">
      <div className="debts-section-header">
        <h2 className="debts-section-title">{label}</h2>
        <span className="debts-section-total">${fmt(total)}</span>
      </div>
      <div className="debts-list">
        {displayDebts.map((debt) => (
          <DebtItem
            key={debt.id}
            debt={debt}
            hasBill={bills.some((b) => b.debt_id === debt.id)}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddBill={onAddBill}
            isDragging={draggedId === debt.id}
            isDragOver={dragOverId === debt.id && draggedId !== debt.id}
            dragHandleProps={sortActive ? null : {
              draggable: true,
              onDragStart: () => handleDragStart(debt.id),
              onDragOver: (e) => handleDragOver(e, debt.id),
              onDrop: (e) => handleDrop(e, debt.id),
              onDragEnd: handleDragEnd,
            }}
          />
        ))}
      </div>
    </section>
  );
}

function applySort(debts, sort) {
  if (!sort) return debts;
  return [...debts].sort((a, b) => {
    const val = sort.field === 'balance'
      ? a.current_balance - b.current_balance
      : a.interest_rate - b.interest_rate;
    return sort.dir === 'asc' ? val : -val;
  });
}

export default function DebtsPage() {
  const [debts, setDebts] = useState([]);
  const [bills, setBills] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debtModal, setDebtModal] = useState(null);
  const [billModal, setBillModal] = useState(null);
  const [sort, setSort] = useState(null); // null | { field: 'balance'|'rate', dir: 'asc'|'desc' }

  const loadData = useCallback(async () => {
    try {
      const [dbt, bl, pc] = await Promise.all([
        api.getDebts(),
        api.getBills(),
        api.getPaychecks(),
      ]);
      setDebts(dbt);
      setBills(bl);
      setPaychecks(pc);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function toggleSort(field) {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, dir: 'desc' };
      if (prev.dir === 'desc') return { field, dir: 'asc' };
      return null; // third click clears sort
    });
  }

  function handleDebtSave(saved) {
    setDebts((prev) => {
      const idx = prev.findIndex((d) => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setDebtModal(null);
  }

  function handleDebtDelete(id) {
    setDebts((prev) => prev.filter((d) => d.id !== id));
    setDebtModal(null);
  }

  async function handleDeleteFromItem(debt) {
    if (!window.confirm(`Delete "${debt.name}"? Bills linked to this debt will be unlinked.`)) return;
    try {
      await api.deleteDebt(debt.id);
      setDebts((prev) => prev.filter((d) => d.id !== debt.id));
    } catch (err) {
      console.error(err);
    }
  }

  function handleBillSave(savedData) {
    if (Array.isArray(savedData)) {
      setBills((prev) => [...prev, ...savedData]);
    } else {
      setBills((prev) => {
        const idx = prev.findIndex((b) => b.id === savedData.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedData;
          return next;
        }
        return [...prev, savedData];
      });
    }
    setBillModal(null);
  }

  if (loading) return <div className="loading">Loading…</div>;

  const totalBalance = debts.reduce((sum, d) => sum + d.current_balance, 0);

  const loans = applySort(debts.filter((d) => d.type === 'loan'), sort);
  const cards = applySort(debts.filter((d) => d.type === 'credit_card'), sort);
  const other = applySort(debts.filter((d) => d.type === 'other'), sort);

  const sectionProps = {
    bills,
    onEdit: (d) => setDebtModal(d),
    onDelete: handleDeleteFromItem,
    onAddBill: (d) => setBillModal(d),
    sortActive: !!sort,
  };

  function sortLabel(field) {
    if (!sort || sort.field !== field) return '';
    return sort.dir === 'desc' ? ' ↓' : ' ↑';
  }

  return (
    <div className="debts-page">
      <div className="debts-page-header">
        <div>
          <h1>Debts</h1>
          {debts.length > 0 && (
            <p className="debts-total">Total owed: <strong>${fmt(totalBalance)}</strong></p>
          )}
        </div>
        <div className="debts-header-right">
          {debts.length > 0 && (
            <div className="debts-sort">
              <span className="debts-sort-label">Sort:</span>
              <button
                className={`debts-sort-btn ${sort?.field === 'balance' ? 'active' : ''}`}
                onClick={() => toggleSort('balance')}
              >Balance{sortLabel('balance')}</button>
              <button
                className={`debts-sort-btn ${sort?.field === 'rate' ? 'active' : ''}`}
                onClick={() => toggleSort('rate')}
              >Rate{sortLabel('rate')}</button>
            </div>
          )}
          <button className="btn-primary" onClick={() => setDebtModal('new')}>+ Add Debt</button>
        </div>
      </div>

      {debts.length === 0 ? (
        <div className="debts-empty">
          <h2>No debts tracked yet</h2>
          <p>Add a loan or credit card to track your balances and payoff progress.</p>
          <button className="btn-primary" onClick={() => setDebtModal('new')}>+ Add Debt</button>
        </div>
      ) : (
        <div className="debts-body">
          {(loans.length > 0 || cards.length > 0) && (
            <div className="debts-two-col">
              <DebtSection label="Loans" debts={loans} {...sectionProps} />
              <DebtSection label="Credit Cards" debts={cards} {...sectionProps} />
            </div>
          )}
          <DebtSection label="Other" debts={other} {...sectionProps} />
        </div>
      )}

      {debtModal && (
        <AddDebtModal
          existing={debtModal === 'new' ? null : debtModal}
          onSave={handleDebtSave}
          onDelete={handleDebtDelete}
          onClose={() => setDebtModal(null)}
        />
      )}

      {billModal && (
        <AddBillModal
          existing={null}
          paychecks={paychecks}
          debts={debts}
          defaultDebt={billModal}
          onSave={handleBillSave}
          onClose={() => setBillModal(null)}
        />
      )}
    </div>
  );
}
