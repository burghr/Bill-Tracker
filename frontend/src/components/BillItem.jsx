import { useState } from 'react';
import { api } from '../api/client';
import './BillItem.css';

export default function BillItem({ bill, paychecks, onUpdate, onDelete, dragHandleProps, isDragging, isDragOver }) {
  const [loading, setLoading] = useState(false);

  async function togglePaid() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await api.updateBill(bill.id, { is_paid: !bill.is_paid });
      onUpdate(result.bill, result.balance);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`bill-item ${bill.is_paid ? 'paid' : ''} ${isDragging ? 'bill-dragging' : ''} ${isDragOver ? 'bill-drag-over' : ''}`}>
      <div className="drag-handle" {...dragHandleProps} title="Drag to reorder">
        ⠿
      </div>

      <button
        className={`check-btn ${bill.is_paid ? 'checked' : ''}`}
        onClick={togglePaid}
        disabled={loading}
        title={bill.is_paid ? 'Mark unpaid' : 'Mark paid'}
      >
        {bill.is_paid ? '✓' : ''}
      </button>

      <div className="bill-name">
        <span>{bill.name}</span>
        {bill.due_date && (
          <span className="bill-due">due {bill.due_date}</span>
        )}
        {bill.recurrence && bill.recurrence !== 'monthly' && (
          <span className="bill-recurrence">{bill.recurrence}</span>
        )}
      </div>

      <div className="bill-amount">
        ${bill.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <div className="bill-status">
        <span className={`status-badge ${bill.is_paid ? 'status-paid' : 'status-unpaid'}`}>
          {bill.is_paid ? 'PAID' : 'UNPAID'}
        </span>
      </div>

      <div className="bill-actions">
        <button className="btn-ghost" onClick={() => onUpdate(bill, null, 'edit')}>
          Edit
        </button>
        <button className="btn-danger" onClick={() => onDelete(bill)}>
          Delete
        </button>
      </div>
    </div>
  );
}
