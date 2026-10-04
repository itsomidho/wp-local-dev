// Shared yes/no confirmation for anything that stops a container, discards
// data, or runs an arbitrary command -- separate from the stronger
// type-the-domain-to-confirm pattern used for `remove` (SiteManageDialog's
// RemoveTab), which stays as-is: that one's irreversible and sits behind an
// even higher bar on purpose.
export default function ConfirmDialog({ title, message, confirmLabel = 'Yes', danger, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className={danger ? 'danger' : ''} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
