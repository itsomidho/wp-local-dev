import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from './ui';

// Shared yes/no confirmation for anything that stops a container, discards
// data, or runs an arbitrary command -- separate from the stronger
// type-the-domain-to-confirm pattern used for `remove` (SiteManageDialog's
// RemoveTab), which stays as-is: that one's irreversible and sits behind an
// even higher bar on purpose.
export default function ConfirmDialog({ title, message, confirmLabel = 'Yes', danger, onConfirm, onCancel }) {
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <Modal onClose={onCancel} size="sm" className="confirm">
      <div className="confirm-body">
        <span className={`confirm-icon${danger ? ' is-danger' : ''}`}>
          <Icon size={22} />
        </span>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
