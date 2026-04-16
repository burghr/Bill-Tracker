function formatPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function ConfirmDeleteBillModal({ bill, groupCount, onDeleteOne, onDeleteAll, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Delete "{bill.name}"?</h2>
        <p>
          This is a recurring bill with <strong>{groupCount} months</strong> on record.
          What would you like to remove?
        </p>
        <div className="actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-danger-outline" onClick={onDeleteOne}>
            Only {formatPeriod(bill.period)}
          </button>
          <button className="btn-danger" onClick={onDeleteAll}>
            All {groupCount} Months
          </button>
        </div>
      </div>
    </div>
  );
}
