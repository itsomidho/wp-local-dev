import { useState } from 'react';
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

// The higher bar, for deleting data that can't come back (a Docker
// volume): the confirm button only unlocks once `expected` is typed.
export function TypeToConfirmDialog({ title, message, expected, confirmLabel = 'Delete', onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  return (
    <Modal onClose={onCancel} size="sm" className="confirm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (typed === expected) onConfirm();
        }}
      >
        <div className="confirm-body">
          <span className="confirm-icon is-danger">
            <AlertTriangle size={22} />
          </span>
          <h3>{title}</h3>
          <p>{message}</p>
          <label className="field">
            <span className="field-hint">
              Type <code>{expected}</code> to confirm
            </span>
            <input name="confirmName" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={typed !== expected}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
