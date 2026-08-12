import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import AddTransactionModal from '../components/AddTransactionModal';
import ManageCategoriesModal from '../components/ManageCategoriesModal';
import './BudgetPage.css';

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function periodLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="budget-stat-card">
      <div className="budget-stat-label">{label}</div>
      <div className={`budget-stat-value ${color || ''}`}>{value}</div>
      {sub && <div className="budget-stat-sub">{sub}</div>}
    </div>
  );
}

function SubcategoryRow({ sub, parent, onAddTransaction }) {
  // With its own sub-limit the mini bar tracks that; otherwise it shows the
  // subcategory's share of the parent's budget.
  const limit = sub.budgeted > 0 ? sub.budgeted : parent.budgeted;
  const pct = limit > 0 ? Math.min(100, (sub.actual / limit) * 100) : 0;
  const overOwnLimit = sub.budgeted > 0 && sub.actual > sub.budgeted;

  return (
    <div className="subcat-row">
      <span className="subcat-name">
        {sub.name}
        {sub.archived && <span className="category-archived-tag">archived</span>}
      </span>
      <div className="subcat-bar">
        <div
          className="subcat-bar-fill"
          style={{ width: `${pct}%`, background: overOwnLimit ? 'var(--red)' : 'var(--accent)' }}
        />
      </div>
      <span className="subcat-amount">
        ${fmt(sub.actual)}
        {sub.budgeted > 0 && <span className="muted"> of ${fmt(sub.budgeted)}</span>}
      </span>
      <button className="category-add-btn" title={`Add ${sub.name} transaction`}
        onClick={() => onAddTransaction(sub)}>+</button>
    </div>
  );
}

function CategoryRow({ cat, paceFraction, isCurrentMonth, onAddTransaction }) {
  const spentPct = cat.budgeted > 0 ? Math.min(100, (cat.actual / cat.budgeted) * 100) : 0;
  const pacePct = Math.min(100, paceFraction * 100);

  const overBudget = cat.actual > cat.budgeted;
  const overPace = !overBudget && isCurrentMonth && cat.actual > cat.expected_to_date;
  const fillColor = overBudget ? 'var(--red)' : overPace ? 'var(--yellow)' : 'var(--green)';

  const hasChildren = cat.children && cat.children.length > 0;

  return (
    <div className={`category-row-card ${cat.archived ? 'archived' : ''}`}>
      <div className="category-card-head">
        <span className="category-name">
          {cat.name}
          {cat.archived && <span className="category-archived-tag">archived</span>}
        </span>
        <div className="category-head-right">
          <span className="category-amounts-inline">
            ${fmt(cat.actual)} <span className="muted">of ${fmt(cat.budgeted)}</span>
            <span className={cat.remaining < 0 ? 'negative' : 'positive'} style={{ marginLeft: 12 }}>
              {cat.remaining < 0 ? `−$${fmt(-cat.remaining)} over` : `$${fmt(cat.remaining)} left`}
            </span>
          </span>
          <button className="category-add-btn" title={`Add ${cat.name} transaction`}
            onClick={() => onAddTransaction(cat)}>+</button>
        </div>
      </div>

      <div className="category-bar">
        <div className="category-bar-fill" style={{ width: `${spentPct}%`, background: fillColor }} />
        {isCurrentMonth && cat.budgeted > 0 && (
          <div className="category-pace-marker" style={{ left: `${pacePct}%` }} title="Where you should be today" />
        )}
      </div>

      {isCurrentMonth && cat.budgeted > 0 && (
        <div className="category-pace-text">
          {overBudget
            ? 'Over budget'
            : `Should be at or under $${fmt(cat.expected_to_date)} today`}
        </div>
      )}

      {hasChildren && (
        <div className="subcat-list">
          {cat.children.map((sub) => (
            <SubcategoryRow key={sub.id} sub={sub} parent={cat} onAddTransaction={onAddTransaction} />
          ))}
          {cat.own_actual > 0 && (
            <div className="subcat-row subcat-general">
              <span className="subcat-name muted">General {cat.name}</span>
              <div className="subcat-bar">
                <div
                  className="subcat-bar-fill"
                  style={{
                    width: `${cat.budgeted > 0 ? Math.min(100, (cat.own_actual / cat.budgeted) * 100) : 0}%`,
                    background: 'var(--text-muted)',
                  }}
                />
              </div>
              <span className="subcat-amount">${fmt(cat.own_actual)}</span>
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BudgetPage() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txModal, setTxModal] = useState(null); // null | { existing? , defaultCategoryId? }
  const [categoriesModal, setCategoriesModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sum, txs, cats] = await Promise.all([
        api.getBudgetSummary(period),
        api.getBudgetTransactions(period),
        api.getBudgetCategories(),
      ]);
      setSummary(sum);
      setTransactions(txs);
      setCategories(cats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDeleteTransaction(tx) {
    if (!window.confirm(`Delete this $${fmt(tx.amount)} ${tx.category_name} transaction?`)) return;
    await api.deleteBudgetTransaction(tx.id);
    loadData();
  }

  if (loading) return <div className="loading">Loading…</div>;

  const isCurrentMonth = period === getCurrentPeriod();
  const { totals, monthly_income } = summary;
  const activeCategories = summary.categories;

  return (
    <div className="budget-page">
      <div className="budget-toolbar">
        <div className="period-selector">
          <button className="btn-ghost" onClick={() => setPeriod(addMonths(period, -1))}>&larr;</button>
          <span className="budget-period-label">{periodLabel(period)}</span>
          <button className="btn-ghost" onClick={() => setPeriod(addMonths(period, 1))}>&rarr;</button>
          {!isCurrentMonth && (
            <button className="btn-ghost" onClick={() => setPeriod(getCurrentPeriod())}>Today</button>
          )}
        </div>
        <div className="budget-toolbar-actions">
          <button className="btn-ghost" onClick={() => setCategoriesModal(true)}>Manage Categories</button>
          <button className="btn-primary" onClick={() => setTxModal({})}
            disabled={categories.length === 0}>+ Add Transaction</button>
        </div>
      </div>

      {activeCategories.length === 0 ? (
        <div className="budget-empty">
          <h2>No budget categories yet</h2>
          <p>Create categories like Food, Gas, or Fun money, give each a monthly amount, and start logging spending against them.</p>
          <button className="btn-primary" onClick={() => setCategoriesModal(true)}>Set Up Categories</button>
        </div>
      ) : (
        <>
          <div className="budget-stat-cards">
            <StatCard label="Monthly Income" value={`$${fmt(monthly_income)}`} color="positive"
              sub="From paychecks (household)" />
            <StatCard label="Budgeted" value={`$${fmt(totals.budgeted)}`} />
            <StatCard label="Spent" value={`$${fmt(totals.actual)}`}
              sub={isCurrentMonth ? `Pace: $${fmt(totals.expected_to_date)} by today` : null} />
            <StatCard
              label="Remaining"
              value={`${totals.remaining < 0 ? '−' : ''}$${fmt(Math.abs(totals.remaining))}`}
              color={totals.remaining >= 0 ? 'positive' : 'negative'}
            />
          </div>

          <div className="category-list">
            {activeCategories.map((cat) => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                paceFraction={summary.pace_fraction}
                isCurrentMonth={isCurrentMonth}
                onAddTransaction={(c) => setTxModal({ defaultCategoryId: c.id })}
              />
            ))}
          </div>

          <section className="budget-tx-section">
            <h2 className="budget-tx-title">Transactions · {periodLabel(period)}</h2>
            {transactions.length === 0 ? (
              <p className="budget-tx-empty">No transactions this month yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="budget-tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                      <th>By</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="nowrap">{fmtDate(tx.date)}</td>
                        <td>{tx.parent_category_name ? `${tx.parent_category_name} · ${tx.category_name}` : tx.category_name}</td>
                        <td className="tx-desc">
                          {tx.description}
                          {tx.bill_id && <span className="tx-bill-tag" title="Created automatically by paying a bill">bill</span>}
                        </td>
                        <td className="num">${fmt(tx.amount)}</td>
                        <td className="muted">@{tx.entered_by_username}</td>
                        <td className="tx-actions">
                          <button className="btn-ghost btn-sm" onClick={() => setTxModal({ existing: tx })}>Edit</button>
                          <button className="btn-danger btn-sm" onClick={() => handleDeleteTransaction(tx)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {txModal && (
        <AddTransactionModal
          existing={txModal.existing || null}
          categories={categories}
          defaultCategoryId={txModal.defaultCategoryId}
          onSave={() => { setTxModal(null); loadData(); }}
          onClose={() => setTxModal(null)}
        />
      )}

      {categoriesModal && (
        <ManageCategoriesModal
          onClose={() => { setCategoriesModal(false); loadData(); }}
        />
      )}
    </div>
  );
}
