export default function DebtItem({ debt, onEdit, onDelete, onAddBill, hasBill, dragHandleProps, isDragging, isDragOver }) {
  const paidOff = debt.original_balance > 0
    ? Math.min(100, ((debt.original_balance - debt.current_balance) / debt.original_balance) * 100)
    : 0;

  const monthlyInterest = debt.current_balance * (debt.interest_rate / 100 / 12);

  const typeLabel = {
    loan: 'Loan',
    credit_card: 'Credit Card',
    other: 'Other',
  }[debt.type] ?? debt.type;

  function fmt(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className={`debt-card ${isDragging ? 'debt-dragging' : ''} ${isDragOver ? 'debt-drag-over' : ''}`}>
      <div className="debt-card-header">
        <div className="debt-name-row">
          {dragHandleProps && (
            <div className="debt-drag-handle" {...dragHandleProps} title="Drag to reorder">⠿</div>
          )}
          <span className="debt-name">{debt.name}</span>
          <span className={`debt-type-badge ${debt.type}`}>{typeLabel}</span>
        </div>
        <div className="debt-card-actions">
          <button
            className="btn-ghost"
            onClick={() => onAddBill(debt)}
            style={{ visibility: hasBill ? 'hidden' : 'visible' }}
          >+ Add Bill</button>
          <button className="btn-ghost" onClick={() => onEdit(debt)}>Edit</button>
          <button className="btn-ghost btn-danger" onClick={() => onDelete(debt)}>Delete</button>
        </div>
      </div>

      <div className="debt-progress-bar">
        <div className="debt-progress-fill" style={{ width: `${paidOff}%` }} />
      </div>

      <div className="debt-balance-row">
        <span className="debt-remaining">${fmt(debt.current_balance)} remaining</span>
        <span className="debt-original">of ${fmt(debt.original_balance)}</span>
      </div>

      <div className="debt-meta">
        <span>{debt.interest_rate}% APR</span>
        <span>Est. ${fmt(monthlyInterest)}/mo interest</span>
        <span>Min: ${fmt(debt.min_payment)}/mo</span>
      </div>
    </div>
  );
}
