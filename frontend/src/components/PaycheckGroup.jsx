import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import BillItem from './BillItem';
import './PaycheckGroup.css';

export default function PaycheckGroup({
  period,
  paycheck,
  payDate,
  bills,
  paychecks,
  onBillUpdate,
  onBillDelete,
  onEditPaycheck,
  onDeletePaycheck,
  onAddBill,
}) {
  const isUnassigned = !paycheck;

  const [localBills, setLocalBills] = useState(bills);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragging = useRef(false);

  // Sync from parent only when not mid-drag
  useEffect(() => {
    if (!dragging.current) {
      setLocalBills(bills);
    }
  }, [bills]);

  const totalBills = localBills.reduce((sum, b) => sum + b.amount, 0);
  const remaining = isUnassigned ? null : paycheck.amount - totalBills;

  const scheduleLabels = {
    twice_monthly: 'Twice monthly',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly',
  };

  function handleDragStart(billId) {
    dragging.current = true;
    setDraggedId(billId);
  }

  function handleDragOver(e, billId) {
    e.preventDefault();
    setDragOverId(billId);
  }

  function handleDrop(e, billId) {
    e.preventDefault();
    if (draggedId === billId) { handleDragEnd(); return; }

    const from = localBills.findIndex((b) => b.id === draggedId);
    const to = localBills.findIndex((b) => b.id === billId);
    if (from === -1 || to === -1) { handleDragEnd(); return; }

    const reordered = [...localBills];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    setLocalBills(reordered);
    handleDragEnd();

    api.reorderBills(reordered.map((b, i) => ({ id: b.id, sort_order: i }))).catch(console.error);
  }

  function handleDragEnd() {
    dragging.current = false;
    setDraggedId(null);
    setDragOverId(null);
  }

  return (
    <div className="paycheck-group">
      <div className="group-header">
        <div className="group-title">
          {isUnassigned ? (
            <span className="group-name unassigned">Unassigned</span>
          ) : (
            <>
              <span className="group-name">{paycheck.name}</span>
              {payDate ? (
                <span className="group-badge">
                  {payDate.toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                </span>
              ) : (
                <span className="group-badge">{scheduleLabels[paycheck.schedule_type] || paycheck.schedule_type}</span>
              )}
              <span className="group-amount">
                ${paycheck.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </>
          )}
        </div>
        <div className="group-actions">
          {!isUnassigned && (
            <>
              <button className="btn-ghost" onClick={() => onEditPaycheck(paycheck)}>Edit</button>
              <button className="btn-danger" onClick={() => onDeletePaycheck(paycheck)}>Delete</button>
            </>
          )}
          <button className="btn-primary" onClick={() => onAddBill(paycheck?.id || null, period)}>
            + Add Bill
          </button>
        </div>
      </div>

      {localBills.length === 0 ? (
        <p className="empty-msg">No bills yet.</p>
      ) : (
        <div className="bills-list">
          {localBills.map((bill) => (
            <BillItem
              key={bill.id}
              bill={bill}
              paychecks={paychecks}
              onUpdate={onBillUpdate}
              onDelete={onBillDelete}
              isDragging={draggedId === bill.id}
              isDragOver={dragOverId === bill.id && draggedId !== bill.id}
              dragHandleProps={{
                draggable: true,
                onDragStart: () => handleDragStart(bill.id),
                onDragOver: (e) => handleDragOver(e, bill.id),
                onDrop: (e) => handleDrop(e, bill.id),
                onDragEnd: handleDragEnd,
              }}
            />
          ))}
        </div>
      )}

      {!isUnassigned && (
        <div className="group-footer">
          <span>
            Bills total: <strong>${totalBills.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </span>
          <span className={remaining < 0 ? 'negative' : 'positive'}>
            Remaining after bills: <strong>${remaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
