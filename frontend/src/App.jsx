import { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api/client';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DebtsPage from './pages/DebtsPage';
import ReportsPage from './pages/ReportsPage';
import ProfilePage from './pages/ProfilePage';
import Header from './components/Header';
import MonthSection from './components/MonthSection';
import AddPaycheckModal from './components/AddPaycheckModal';
import AddBillModal from './components/AddBillModal';
import ConfirmDeleteBillModal from './components/ConfirmDeleteBillModal';
import './App.css';

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const mo = ((m - 1 + n) % 12) + 1;
  const yr = y + Math.floor((m - 1 + n) / 12);
  return `${yr}-${String(mo).padStart(2, '0')}`;
}

function Dashboard({ user, onLogout, onProfileUpdate }) {
  const [paychecks, setPaychecks] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [paycheckModal, setPaycheckModal] = useState(null);
  const [billModal, setBillModal] = useState(null);
  const [deleteBillState, setDeleteBillState] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [pc, bl, dbt] = await Promise.all([
        api.getPaychecks(),
        api.getBills(),
        api.getDebts(),
      ]);
      setPaychecks(pc);
      setBills(bl);
      setDebts(dbt);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());

  const availablePeriods = useMemo(() => {
    const current = getCurrentPeriod();
    const set = new Set(bills.map((b) => b.period).filter(Boolean));
    for (let i = 0; i <= 6; i++) {
      set.add(addMonths(current, i));
    }
    return Array.from(set).sort();
  }, [bills]);

  // Ensure selectedPeriod is always in the list
  useEffect(() => {
    if (availablePeriods.length > 0 && !availablePeriods.includes(selectedPeriod)) {
      setSelectedPeriod(getCurrentPeriod());
    }
  }, [availablePeriods, selectedPeriod]);

  function handlePaycheckSave(saved) {
    setPaychecks((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setPaycheckModal(null);
  }

  async function handleDeletePaycheck(paycheck) {
    const assignedCount = bills.filter((b) => b.paycheck_id === paycheck.id).length;
    const msg = assignedCount > 0
      ? `Delete "${paycheck.name}"? Its ${assignedCount} bill(s) will become unassigned.`
      : `Delete "${paycheck.name}"?`;
    if (!window.confirm(msg)) return;
    await api.deletePaycheck(paycheck.id);
    setPaychecks((prev) => prev.filter((p) => p.id !== paycheck.id));
    setBills((prev) => prev.map((b) =>
      b.paycheck_id === paycheck.id ? { ...b, paycheck_id: null, paycheck_name: null } : b
    ));
  }

  function handleBillUpdate(updatedBill, _newBalance, action) {
    if (action === 'edit') {
      setBillModal({ existing: updatedBill });
      return;
    }
    setBills((prev) => {
      const idx = prev.findIndex((b) => b.id === updatedBill.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedBill;
        return next;
      }
      return prev;
    });
  }

  function handleBillSave(savedData) {
    if (Array.isArray(savedData)) {
      loadData();
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

  async function handleDeleteBill(bill) {
    if (bill.group_id) {
      const groupCount = bills.filter((b) => b.group_id === bill.group_id).length;
      if (groupCount > 1) {
        setDeleteBillState({ bill, groupCount });
        return;
      }
    }
    if (!window.confirm(`Delete "${bill.name}"?`)) return;
    await api.deleteBill(bill.id);
    setBills((prev) => prev.filter((b) => b.id !== bill.id));
  }

  async function handleConfirmDeleteOne() {
    const { bill } = deleteBillState;
    setDeleteBillState(null);
    await api.deleteBill(bill.id);
    setBills((prev) => prev.filter((b) => b.id !== bill.id));
  }

  async function handleConfirmDeleteAll() {
    const { bill } = deleteBillState;
    setDeleteBillState(null);
    await api.deleteBillGroup(bill.group_id);
    setBills((prev) => prev.filter((b) => b.group_id !== bill.group_id));
  }

  async function handleResetPeriod(period) {
    if (!window.confirm(`Mark all bills in ${period} as unpaid?`)) return;
    const paidBills = bills.filter((b) => b.period === period && b.is_paid);
    for (const b of paidBills) {
      await api.updateBill(b.id, { is_paid: false });
    }
    await loadData();
  }

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="app">
      <Header user={user} onLogout={onLogout} />

      <Routes>
        <Route path="/debts" element={<DebtsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/profile" element={<ProfilePage user={user} onProfileUpdate={onProfileUpdate} />} />
        <Route
          path="/*"
          element={
            <main className="main">
              <div className="toolbar">
                <div className="period-selector">
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      const idx = availablePeriods.indexOf(selectedPeriod);
                      if (idx > 0) setSelectedPeriod(availablePeriods[idx - 1]);
                    }}
                    disabled={availablePeriods.indexOf(selectedPeriod) <= 0}
                  >
                    &larr;
                  </button>
                  <select
                    className="period-select"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                  >
                    {availablePeriods.map((p) => {
                      const [y, m] = p.split('-').map(Number);
                      const label = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                      return <option key={p} value={p}>{label}</option>;
                    })}
                  </select>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      const idx = availablePeriods.indexOf(selectedPeriod);
                      if (idx < availablePeriods.length - 1) setSelectedPeriod(availablePeriods[idx + 1]);
                    }}
                    disabled={availablePeriods.indexOf(selectedPeriod) >= availablePeriods.length - 1}
                  >
                    &rarr;
                  </button>
                  {selectedPeriod !== getCurrentPeriod() && (
                    <button className="btn-ghost" onClick={() => setSelectedPeriod(getCurrentPeriod())}>
                      Today
                    </button>
                  )}
                </div>
                <button className="btn-primary" onClick={() => setPaycheckModal('new')}>
                  + Add Paycheck
                </button>
              </div>

              {paychecks.length === 0 && bills.length === 0 ? (
                <div className="empty-state">
                  <h2>No paychecks yet</h2>
                  <p>Start by adding a paycheck, then add your bills to it.</p>
                </div>
              ) : (
                <MonthSection
                  key={selectedPeriod}
                  period={selectedPeriod}
                  paychecks={paychecks}
                  bills={bills}
                  onBillUpdate={handleBillUpdate}
                  onBillDelete={handleDeleteBill}
                  onEditPaycheck={(p) => setPaycheckModal(p)}
                  onDeletePaycheck={handleDeletePaycheck}
                  onAddBill={(pcId, per) => setBillModal({ defaultPaycheckId: pcId, defaultPeriod: per })}
                  onResetPeriod={handleResetPeriod}
                />
              )}

              {paycheckModal && (
                <AddPaycheckModal
                  existing={paycheckModal === 'new' ? null : paycheckModal}
                  onSave={handlePaycheckSave}
                  onClose={() => setPaycheckModal(null)}
                />
              )}

              {billModal && (
                <AddBillModal
                  existing={billModal.existing || null}
                  paychecks={paychecks}
                  debts={debts}
                  defaultPaycheckId={billModal.defaultPaycheckId}
                  defaultPeriod={billModal.defaultPeriod}
                  onSave={handleBillSave}
                  onClose={() => setBillModal(null)}
                />
              )}

              {deleteBillState && (
                <ConfirmDeleteBillModal
                  bill={deleteBillState.bill}
                  groupCount={deleteBillState.groupCount}
                  onDeleteOne={handleConfirmDeleteOne}
                  onDeleteAll={handleConfirmDeleteAll}
                  onClose={() => setDeleteBillState(null)}
                />
              )}
            </main>
          }
        />
      </Routes>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [authMode, setAuthMode] = useState(null); // 'local' | 'sso'
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.config().catch(() => ({ mode: 'local' })),
      api.me().catch(() => null),
    ]).then(([cfg, me]) => {
      setAuthMode(cfg?.mode === 'sso' ? 'sso' : 'local');
      setUser(me);
    });
  }, []);

  function handleLogin(u) {
    setUser(u);
    navigate('/');
  }

  function handleLogout() {
    setUser(null);
    // In SSO mode the forward-auth cookie would silently re-auth on next nav,
    // so end the Authentik proxy session too.
    if (authMode === 'sso') {
      window.location.href = '/outpost.goauthentik.io/sign_out';
      return;
    }
    navigate('/login');
  }

  if (user === undefined || authMode === null) {
    return <div className="loading">Loading…</div>;
  }

  const ssoMode = authMode === 'sso';

  return (
    <Routes>
      <Route
        path="/login"
        element={ssoMode || user ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />}
      />
      <Route
        path="/register"
        element={ssoMode || user ? <Navigate to="/" replace /> : <RegisterPage onLogin={handleLogin} />}
      />
      <Route
        path="/*"
        element={
          user
            ? <Dashboard user={user} onLogout={handleLogout} onProfileUpdate={setUser} />
            : <Navigate to="/login" replace />
        }
      />
    </Routes>
  );
}
