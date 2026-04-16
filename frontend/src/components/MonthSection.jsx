import PaycheckGroup from './PaycheckGroup';
import './MonthSection.css';

function formatPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Given a biweekly paycheck's anchor_date, return all pay dates that fall in the given period.
 */
function getBiweeklyPayDates(anchorDate, period) {
  const [year, month] = period.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // last day of month

  const anchor = new Date(anchorDate + 'T00:00:00');
  const dayMs = 86400000;
  const intervalMs = 14 * dayMs;

  // Find the first pay date on or before monthStart
  const diffMs = monthStart.getTime() - anchor.getTime();
  const periods = Math.floor(diffMs / intervalMs);
  let payDate = new Date(anchor.getTime() + periods * intervalMs);

  const dates = [];
  while (payDate <= monthEnd) {
    if (payDate >= monthStart) dates.push(new Date(payDate));
    payDate = new Date(payDate.getTime() + intervalMs);
  }
  return dates;
}

/**
 * For a set of biweekly pay dates in a month, determine which pay window a bill falls in
 * based on its due_date day-of-month.
 */
function assignBillToPayWindow(bill, payDates) {
  if (!bill.due_date || payDates.length === 0) return -1;
  const dueDay = new Date(bill.due_date + 'T00:00:00').getDate();

  for (let i = payDates.length - 1; i >= 0; i--) {
    if (dueDay >= payDates[i].getDate()) return i;
  }
  // Due day is before first paycheck — assign to first window
  return 0;
}

export default function MonthSection({
  period,
  paychecks,
  bills,
  onBillUpdate,
  onBillDelete,
  onEditPaycheck,
  onDeletePaycheck,
  onAddBill,
  onResetPeriod,
}) {
  const currentPeriod = getCurrentPeriod();
  const isCurrent = period === currentPeriod;
  const isPast = period < currentPeriod;

  const periodBills = bills.filter((b) => b.period === period);
  const hasPaidBills = periodBills.some((b) => b.is_paid);

  // Separate paychecks by type
  const regularPaychecks = paychecks.filter((pc) => pc.schedule_type !== 'biweekly');
  const biweeklyPaychecks = paychecks.filter((pc) => pc.schedule_type === 'biweekly');

  // Build biweekly paycheck instances for this month
  const biweeklyInstances = [];
  const biweeklyAssignedBillIds = new Set();

  for (const pc of biweeklyPaychecks) {
    if (!pc.anchor_date) continue;
    const payDates = getBiweeklyPayDates(pc.anchor_date, period);

    for (let i = 0; i < payDates.length; i++) {
      const windowBills = periodBills.filter((b) => {
        if (biweeklyAssignedBillIds.has(b.id)) return false;
        // Skip bills manually assigned to a non-biweekly paycheck
        if (b.paycheck_id) {
          const assignedPc = paychecks.find((p) => p.id === b.paycheck_id);
          if (assignedPc && assignedPc.schedule_type !== 'biweekly') return false;
        }
        // Must have a due_date to auto-assign
        if (!b.due_date) return false;
        return assignBillToPayWindow(b, payDates) === i;
      });

      windowBills.forEach((b) => biweeklyAssignedBillIds.add(b.id));

      biweeklyInstances.push({
        paycheck: pc,
        payDate: payDates[i],
        bills: windowBills,
        instanceKey: `${pc.id}-${payDates[i].toISOString().slice(0, 10)}`,
      });
    }
  }

  // Remaining bills not claimed by biweekly grouping
  const remainingBills = periodBills.filter((b) => !biweeklyAssignedBillIds.has(b.id));
  const unassigned = remainingBills.filter((b) => {
    if (!b.paycheck_id) return true;
    // If assigned to a biweekly paycheck but has no due_date, show as unassigned
    const pc = paychecks.find((p) => p.id === b.paycheck_id);
    if (pc && pc.schedule_type === 'biweekly') return true;
    return false;
  });

  return (
    <div className={`month-section${isCurrent ? ' month-current' : ''}${isPast ? ' month-past' : ''}`}>
      <div className="month-header">
        <div className="month-title">
          <h2 className="month-name">{formatPeriod(period)}</h2>
          {isCurrent && <span className="month-badge current">Current Month</span>}
          {isPast && <span className="month-badge past">Past</span>}
        </div>
        {hasPaidBills && (
          <button className="btn-ghost" onClick={() => onResetPeriod(period)}>
            Reset Period
          </button>
        )}
      </div>

      <div className="month-body">
        {/* Regular (non-biweekly) paychecks — unchanged */}
        {regularPaychecks.map((pc) => (
          <PaycheckGroup
            key={pc.id}
            period={period}
            paycheck={pc}
            bills={remainingBills.filter((b) => b.paycheck_id === pc.id)}
            paychecks={paychecks}
            onBillUpdate={onBillUpdate}
            onBillDelete={onBillDelete}
            onEditPaycheck={onEditPaycheck}
            onDeletePaycheck={onDeletePaycheck}
            onAddBill={onAddBill}
          />
        ))}

        {/* Biweekly paycheck instances — one per pay date in this month */}
        {biweeklyInstances.map((inst) => (
          <PaycheckGroup
            key={inst.instanceKey}
            period={period}
            paycheck={inst.paycheck}
            payDate={inst.payDate}
            bills={inst.bills}
            paychecks={paychecks}
            onBillUpdate={onBillUpdate}
            onBillDelete={onBillDelete}
            onEditPaycheck={onEditPaycheck}
            onDeletePaycheck={onDeletePaycheck}
            onAddBill={onAddBill}
          />
        ))}

        {/* Unassigned bills */}
        {(unassigned.length > 0 || paychecks.length === 0) && (
          <PaycheckGroup
            period={period}
            paycheck={null}
            bills={unassigned}
            paychecks={paychecks}
            onBillUpdate={onBillUpdate}
            onBillDelete={onBillDelete}
            onEditPaycheck={() => {}}
            onDeletePaycheck={() => {}}
            onAddBill={onAddBill}
          />
        )}
      </div>
    </div>
  );
}
