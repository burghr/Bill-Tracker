import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './ReportsPage.css';

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthlyPaycheckAmount(pc) {
  const m = { monthly: 1, twice_monthly: 2, biweekly: 26 / 12, weekly: 52 / 12 };
  return pc.amount * (m[pc.schedule_type] || 1);
}

function monthLabel(months) {
  if (!months || !isFinite(months) || months > 600) return '∞';
  const y = Math.floor(months / 12);
  const mo = months % 12;
  if (y === 0) return `${mo} mo`;
  if (mo === 0) return `${y} yr`;
  return `${y} yr ${mo} mo`;
}

// Month-by-month simulation for avalanche / snowball
function simulateStrategy(debts, extraBudget, strategy) {
  const pool = debts
    .filter(d => d.current_balance > 0.01 && d.min_payment > 0)
    .map(d => ({
      id: d.id,
      name: d.name,
      balance: d.current_balance,
      rate: d.interest_rate / 100 / 12,
      min: d.min_payment,
      paidOffMonth: null,
      totalInterest: 0,
    }));

  if (pool.length === 0) return { order: [], totalInterest: 0, totalMonths: 0 };

  const priorityIds = [...pool]
    .sort((a, b) => strategy === 'avalanche' ? b.rate - a.rate : a.balance - b.balance)
    .map(d => d.id);

  let extra = extraBudget;
  let month = 0;
  const MAX = 600;

  while (pool.some(d => d.balance > 0.01) && month < MAX) {
    month++;
    // accrue interest
    for (const d of pool) {
      if (d.balance > 0.01) {
        const interest = d.balance * d.rate;
        d.totalInterest += interest;
        d.balance += interest;
      }
    }
    // pay minimums
    for (const d of pool) {
      if (d.balance > 0.01) {
        const pay = Math.min(d.balance, d.min);
        d.balance = Math.max(0, d.balance - pay);
        if (d.balance < 0.01 && d.paidOffMonth === null) {
          d.balance = 0;
          d.paidOffMonth = month;
          extra += d.min;
        }
      }
    }
    // apply extra to focus debt
    let rem = extra;
    for (const id of priorityIds) {
      if (rem < 0.01) break;
      const d = pool.find(x => x.id === id && x.balance > 0.01);
      if (!d) continue;
      const pay = Math.min(d.balance, rem);
      d.balance = Math.max(0, d.balance - pay);
      rem -= pay;
      if (d.balance < 0.01 && d.paidOffMonth === null) {
        d.balance = 0;
        d.paidOffMonth = month;
        extra += d.min;
      }
    }
  }

  return {
    order: priorityIds.map(id => pool.find(d => d.id === id)),
    totalInterest: pool.reduce((s, d) => s + d.totalInterest, 0),
    totalMonths: month,
  };
}

function minPayoffMonths(balance, aprPct, minPayment) {
  if (balance <= 0) return 0;
  if (minPayment <= 0) return Infinity;
  if (aprPct === 0) return Math.ceil(balance / minPayment);
  const r = aprPct / 100 / 12;
  if (minPayment <= balance * r) return Infinity;
  return Math.ceil(-Math.log(1 - (balance * r) / minPayment) / Math.log(1 + r));
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color || ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function StrategyCard({ title, subtitle, accentClass, result }) {
  return (
    <div className={`strategy-card ${accentClass}`}>
      <div className="strategy-card-head">
        <div>
          <div className="strategy-title">{title}</div>
          <div className="strategy-subtitle">{subtitle}</div>
        </div>
        <div className="strategy-summary">
          <div className="strategy-summary-item">
            <span className="strategy-summary-label">Debt-free in</span>
            <span className="strategy-summary-value">{monthLabel(result.totalMonths)}</span>
          </div>
          <div className="strategy-summary-item">
            <span className="strategy-summary-label">Total interest</span>
            <span className="strategy-summary-value warn">${fmt(result.totalInterest)}</span>
          </div>
        </div>
      </div>
      <ol className="strategy-list">
        {result.order.map((d, i) => (
          <li key={d.id} className="strategy-list-item">
            <span className="strategy-rank">{i + 1}</span>
            <span className="strategy-debt-name">{d.name}</span>
            <span className="strategy-debt-month">{monthLabel(d.paidOffMonth)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function categoryColor(i) {
  return `hsl(${(i * 57 + 210) % 360} 60% 55%)`;
}

const UNBUDGETED_COLOR = '#4a5065';

function PieChart({ slices, selectedId, onSelect, size = 190 }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  function sliceProps(s) {
    return {
      className: `pie-slice${s.clickable ? ' clickable' : ''}${
        selectedId != null && selectedId !== s.id ? ' dimmed' : ''
      }${selectedId === s.id ? ' selected' : ''}`,
      onClick: s.clickable ? () => onSelect(s) : undefined,
    };
  }

  let angle = -Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      {slices.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={slices[0].color} {...sliceProps(slices[0])}>
          <title>{`${slices[0].label}: $${fmt(slices[0].value)}`}</title>
        </circle>
      ) : (
        slices.map((s) => {
          const frac = s.value / total;
          const a0 = angle;
          const a1 = angle + frac * 2 * Math.PI;
          angle = a1;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const large = frac > 0.5 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
          return (
            <path key={s.id} d={d} fill={s.color} {...sliceProps(s)}>
              <title>{`${s.label}: $${fmt(s.value)} (${(frac * 100).toFixed(1)}%)`}</title>
            </path>
          );
        })
      )}
    </svg>
  );
}

function PieBlock({ title, slices, selectedId, onSelect }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (slices.length === 0) {
    return (
      <div className="pie-block">
        <h3 className="pie-title">{title}</h3>
        <p className="pie-empty">Nothing to show this month.</p>
      </div>
    );
  }
  return (
    <div className="pie-block">
      <h3 className="pie-title">{title}</h3>
      <PieChart slices={slices} selectedId={selectedId} onSelect={onSelect} />
      <div className="pie-legend">
        {slices.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`pie-legend-item${s.clickable ? ' clickable' : ''}${selectedId === s.id ? ' active' : ''}`}
            onClick={s.clickable ? () => onSelect(s) : undefined}
            tabIndex={s.clickable ? 0 : -1}
          >
            <i className="legend-dot" style={{ background: s.color }} />
            <span className="pie-legend-label">{s.label}</span>
            <span className="pie-legend-value">${fmt(s.value)}</span>
          </button>
        ))}
        <div className="pie-legend-item pie-legend-total">
          <span className="pie-legend-label">Total</span>
          <span className="pie-legend-value">${fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

// One top-level category as table rows: the parent, then indented subcategories.
function FragmentRows({ cat }) {
  return (
    <>
      <tr>
        <td>{cat.name}{cat.archived ? ' (archived)' : ''}</td>
        <td className="num">${fmt(cat.budgeted)}</td>
        <td className="num">${fmt(cat.actual)}</td>
        <td className={`num ${cat.remaining < 0 ? 'warn' : ''}`}>
          {cat.remaining < 0 ? `−$${fmt(-cat.remaining)}` : `$${fmt(cat.remaining)}`}
        </td>
        <td className="num">{cat.budgeted > 0 ? `${((cat.actual / cat.budgeted) * 100).toFixed(0)}%` : '—'}</td>
      </tr>
      {(cat.children || []).map((k) => (
        <tr key={k.id} className="subcat-table-row">
          <td className="subcat-table-name">↳ {k.name}{k.archived ? ' (archived)' : ''}</td>
          <td className="num">{k.budgeted > 0 ? `$${fmt(k.budgeted)}` : '—'}</td>
          <td className="num">${fmt(k.actual)}</td>
          <td />
          <td />
        </tr>
      ))}
    </>
  );
}

function BudgetReportSection({ summary, currentBills, transactions }) {
  const [selected, setSelected] = useState(null); // { id, label } | null

  if (!summary || summary.categories.length === 0) return null;

  const { categories, totals } = summary;

  // Stable color per category across both pies
  const colorMap = new Map(categories.map((c, i) => [c.id, categoryColor(i)]));
  let nextColor = categories.length;
  const colorFor = (id) => {
    if (!colorMap.has(id)) colorMap.set(id, categoryColor(nextColor++));
    return colorMap.get(id);
  };

  // Subcategories roll up into their parent everywhere on this page.
  const idToTop = new Map();
  const groupIdsByTop = new Map();
  for (const c of categories) {
    const ids = [c.id, ...(c.children || []).map((k) => k.id)];
    groupIdsByTop.set(c.id, ids);
    for (const id of ids) idToTop.set(id, c);
  }

  // Pie 1: this month's bills grouped by their linked budget category
  const billGroups = new Map();
  for (const b of currentBills) {
    const top = b.budget_category_id ? idToTop.get(b.budget_category_id) : null;
    const key = top ? top.id : (b.budget_category_id || 0);
    const g = billGroups.get(key) || {
      id: key,
      label: top ? top.name : (b.budget_category_id ? b.budget_category_name : 'Not budgeted'),
      value: 0,
    };
    g.value += b.amount;
    billGroups.set(key, g);
  }
  const billSlices = [...billGroups.values()]
    .sort((a, b) => b.value - a.value)
    .map((g) => ({
      ...g,
      color: g.id ? colorFor(g.id) : UNBUDGETED_COLOR,
      clickable: !!g.id,
    }));

  // Pie 2: budget spending (all transactions) by category
  const spendSlices = categories
    .filter((c) => c.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .map((c) => ({
      id: c.id,
      label: c.name,
      value: c.actual,
      color: colorFor(c.id),
      clickable: true,
    }));

  function handleSelect(slice) {
    setSelected((prev) => (prev && prev.id === slice.id ? null : { id: slice.id, label: slice.label }));
  }

  const selectedGroup = selected ? (groupIdsByTop.get(selected.id) || [selected.id]) : [];
  const filteredTxs = selected
    ? transactions.filter((t) => selectedGroup.includes(t.category_id))
    : [];
  const filteredTotal = filteredTxs.reduce((s, t) => s + t.amount, 0);

  return (
    <section className="report-section">
      <h2 className="report-section-title">Budget vs Actual</h2>

      <div className="pie-grid">
        <PieBlock
          title="Bills by Budget Category"
          slices={billSlices}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
        />
        <PieBlock
          title="Spending by Category"
          slices={spendSlices}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
        />
      </div>

      {selected && (
        <div className="tx-filter-panel">
          <div className="tx-filter-head">
            <h3 className="pie-title">
              {selected.label} transactions — ${fmt(filteredTotal)}
            </h3>
            <button className="btn-ghost" onClick={() => setSelected(null)}>Clear</button>
          </div>
          {filteredTxs.length === 0 ? (
            <p className="pie-empty">No transactions in {selected.label} this month. Linked bills only appear here once they are marked paid.</p>
          ) : (
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>
                        {t.description}
                        {t.parent_category_name ? <span className="tx-source-tag">{t.category_name}</span> : null}
                        {t.bill_id ? <span className="tx-source-tag">bill</span> : null}
                      </td>
                      <td className="num">${fmt(t.amount)}</td>
                      <td>@{t.entered_by_username}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: '1rem' }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Budgeted</th>
              <th className="num">Spent</th>
              <th className="num">Remaining</th>
              <th className="num">Used</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <FragmentRows key={c.id} cat={c} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td className="num"><strong>${fmt(totals.budgeted)}</strong></td>
              <td className="num"><strong>${fmt(totals.actual)}</strong></td>
              <td className={`num ${totals.remaining < 0 ? 'warn' : ''}`}>
                <strong>{totals.remaining < 0 ? `−$${fmt(-totals.remaining)}` : `$${fmt(totals.remaining)}`}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const [debts, setDebts] = useState([]);
  const [bills, setBills] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [budgetTxs, setBudgetTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extraBudget, setExtraBudget] = useState('0');

  const loadData = useCallback(async () => {
    try {
      const [dbt, bl, pc, bs, txs] = await Promise.all([
        api.getDebts(),
        api.getBills(),
        api.getPaychecks(),
        api.getBudgetSummary(getCurrentPeriod()).catch(() => null),
        api.getBudgetTransactions(getCurrentPeriod()).catch(() => []),
      ]);
      setDebts(dbt);
      setBills(bl);
      setPaychecks(pc);
      setBudgetSummary(bs);
      setBudgetTxs(txs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="loading">Loading…</div>;

  const period = getCurrentPeriod();
  const currentBills = bills.filter(b => b.period === period);

  // ── Income ─────────────────────────────────────────────────
  const monthlyIncome = paychecks.reduce((s, p) => s + monthlyPaycheckAmount(p), 0);

  // ── Bills breakdown ────────────────────────────────────────
  const debtBills    = currentBills.filter(b => b.debt_id);
  const regularBills = currentBills.filter(b => !b.debt_id);
  const totalDebt    = debtBills.reduce((s, b) => s + b.amount, 0);
  const totalReg     = regularBills.reduce((s, b) => s + b.amount, 0);
  const totalBills   = totalDebt + totalReg;
  const net          = monthlyIncome - totalBills;
  const debtPct      = totalBills > 0 ? (totalDebt / totalBills) * 100 : 0;

  const paidBills   = currentBills.filter(b => b.is_paid);
  const unpaidBills = currentBills.filter(b => !b.is_paid);
  const paidAmt     = paidBills.reduce((s, b) => s + b.amount, 0);
  const unpaidAmt   = unpaidBills.reduce((s, b) => s + b.amount, 0);

  // ── Debt interest ──────────────────────────────────────────
  const totalMonthlyInterest = debts.reduce(
    (s, d) => s + d.current_balance * (d.interest_rate / 100 / 12), 0
  );

  // ── Strategies ─────────────────────────────────────────────
  const extra = Math.max(0, parseFloat(extraBudget) || 0);
  const avalanche = simulateStrategy(debts, extra, 'avalanche');
  const snowball  = simulateStrategy(debts, extra, 'snowball');
  const interestSaved = snowball.totalInterest - avalanche.totalInterest;

  return (
    <div className="reports-page">
      <h1 className="reports-title">Reports</h1>

      {/* ── Monthly Snapshot ── */}
      <section className="report-section">
        <h2 className="report-section-title">This Month's Snapshot</h2>
        <div className="stat-cards">
          <StatCard label="Monthly Income"   value={`$${fmt(monthlyIncome)}`} color="positive" />
          <StatCard label="Total Bills"      value={`$${fmt(totalBills)}`} />
          <StatCard label="Debt Payments"    value={`$${fmt(totalDebt)}`}  color="warn" sub={totalBills > 0 ? `${debtPct.toFixed(0)}% of bills` : null} />
          <StatCard label="Regular Bills"    value={`$${fmt(totalReg)}`} />
          <StatCard
            label="Net After Bills"
            value={`${net < 0 ? '-' : ''}$${fmt(Math.abs(net))}`}
            color={net >= 0 ? 'positive' : 'negative'}
          />
        </div>

        {totalBills > 0 && (
          <div className="breakdown-block">
            <div className="breakdown-row">
              <span className="breakdown-row-label">Bill type</span>
              <div className="breakdown-bar">
                <div className="breakdown-fill debt-fill"   style={{ width: `${debtPct}%` }} />
                <div className="breakdown-fill reg-fill"    style={{ width: `${100 - debtPct}%` }} />
              </div>
            </div>
            <div className="breakdown-legend">
              <span><i className="legend-dot debt-fill" />Debt payments {debtPct.toFixed(1)}%</span>
              <span><i className="legend-dot reg-fill" />Regular bills {(100 - debtPct).toFixed(1)}%</span>
            </div>

            {totalBills > 0 && (
              <div className="breakdown-row" style={{ marginTop: '0.75rem' }}>
                <span className="breakdown-row-label">Paid this month</span>
                <div className="breakdown-bar">
                  <div
                    className="breakdown-fill paid-fill"
                    style={{ width: `${totalBills > 0 ? (paidAmt / totalBills) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            <div className="breakdown-legend">
              <span><i className="legend-dot paid-fill" />{paidBills.length} paid — ${fmt(paidAmt)}</span>
              <span style={{ color: 'var(--text-muted)' }}>{unpaidBills.length} remaining — ${fmt(unpaidAmt)}</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Budget vs Actual ── */}
      <BudgetReportSection summary={budgetSummary} currentBills={currentBills} transactions={budgetTxs} />

      {/* ── Interest Cost ── */}
      {debts.length > 0 && (
        <section className="report-section">
          <h2 className="report-section-title">Interest Cost</h2>
          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Debt</th>
                  <th className="num">Balance</th>
                  <th className="num">APR</th>
                  <th className="num">Monthly Interest</th>
                  <th className="num">Annual Interest</th>
                  <th className="num">Payoff at Min</th>
                </tr>
              </thead>
              <tbody>
                {debts.map(d => {
                  const mo = d.current_balance * (d.interest_rate / 100 / 12);
                  const months = minPayoffMonths(d.current_balance, d.interest_rate, d.min_payment);
                  return (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td className="num">${fmt(d.current_balance)}</td>
                      <td className="num">{d.interest_rate}%</td>
                      <td className="num warn">${fmt(mo)}</td>
                      <td className="num warn">${fmt(mo * 12)}</td>
                      <td className="num">{monthLabel(months)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="num"><strong>${fmt(debts.reduce((s, d) => s + d.current_balance, 0))}</strong></td>
                  <td />
                  <td className="num warn"><strong>${fmt(totalMonthlyInterest)}</strong></td>
                  <td className="num warn"><strong>${fmt(totalMonthlyInterest * 12)}</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ── Payoff Strategies ── */}
      {debts.length > 0 && (
        <section className="report-section">
          <div className="strategy-section-head">
            <h2 className="report-section-title">Payoff Strategies</h2>
            <label className="extra-label">
              Extra monthly budget
              <span className="extra-input-wrap">
                <span className="extra-dollar">$</span>
                <input
                  type="number"
                  min="0"
                  step="25"
                  value={extraBudget}
                  onChange={e => setExtraBudget(e.target.value)}
                  className="extra-input"
                />
              </span>
            </label>
          </div>

          {interestSaved > 1 && (
            <div className="strategy-tip">
              Avalanche saves <strong>${fmt(interestSaved)}</strong> in interest compared to Snowball
              {avalanche.totalMonths < snowball.totalMonths && (
                <> and pays off <strong>{monthLabel(snowball.totalMonths - avalanche.totalMonths)}</strong> faster</>
              )}
              .
            </div>
          )}

          <div className="strategy-grid">
            <StrategyCard
              title="Avalanche"
              subtitle="Highest interest rate first — minimizes total interest paid"
              accentClass="avalanche"
              result={avalanche}
            />
            <StrategyCard
              title="Snowball"
              subtitle="Lowest balance first — builds momentum with quick wins"
              accentClass="snowball"
              result={snowball}
            />
          </div>
        </section>
      )}

      {/* ── Paycheck Coverage ── */}
      {paychecks.length > 0 && (
        <section className="report-section">
          <h2 className="report-section-title">Paycheck Coverage</h2>
          <div className="coverage-grid">
            {paychecks.map(pc => {
              const assigned = currentBills.filter(b => b.paycheck_id === pc.id);
              const total = assigned.reduce((s, b) => s + b.amount, 0);
              const pct = pc.amount > 0 ? Math.min(100, (total / pc.amount) * 100) : 0;
              const diff = pc.amount - total;
              const barColor = pct > 95 ? 'var(--red)' : pct > 75 ? 'var(--yellow)' : 'var(--green)';
              return (
                <div key={pc.id} className="coverage-card">
                  <div className="coverage-head">
                    <span className="coverage-name">{pc.name}</span>
                    <span className="coverage-amount">${fmt(pc.amount)}/check</span>
                  </div>
                  <div className="coverage-bar-wrap">
                    <div className="coverage-bar">
                      <div className="coverage-fill" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <span className="coverage-pct">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="coverage-meta">
                    <span>{assigned.length} bill{assigned.length !== 1 ? 's' : ''} · ${fmt(total)}</span>
                    <span className={diff < 0 ? 'negative' : 'positive'}>
                      {diff < 0 ? '−' : '+'}${fmt(Math.abs(diff))} {diff < 0 ? 'over' : 'free'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
