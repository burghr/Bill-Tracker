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

export default function ReportsPage() {
  const [debts, setDebts] = useState([]);
  const [bills, setBills] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extraBudget, setExtraBudget] = useState('0');

  const loadData = useCallback(async () => {
    try {
      const [dbt, bl, pc] = await Promise.all([api.getDebts(), api.getBills(), api.getPaychecks()]);
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
