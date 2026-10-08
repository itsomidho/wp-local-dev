import { useState } from 'react';
import { Globe, Sparkles } from 'lucide-react';
import { siteUrl } from '../api';
import { Modal, ModalHeader } from './ui';

const PHP_VERSIONS = ['8.1', '8.2', '8.3', '8.4'];

export default function AddSiteDialog({ onSubmit, onClose }) {
  const [domain, setDomain] = useState('');
  const [php, setPhp] = useState('8.2');
  const [wpVersion, setWpVersion] = useState('');

  const trimmed = domain.trim().toLowerCase();
  // A bare name gets .test appended, so "shop" means shop.test.
  const preview = trimmed ? (trimmed.includes('.') ? trimmed : `${trimmed}.test`) : '';

  const submit = (e) => {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit({ domain: preview, php, wpVersion: wpVersion.trim() || undefined });
  };

  return (
    <Modal onClose={onClose} size="md" as="form" onSubmit={submit}>
      <ModalHeader icon={Globe} title="New site" subtitle="Files, database, HTTPS certificate and nginx vhost in one go" onClose={onClose} />
      <div className="modal-body">
        <label className="field">
          <span className="field-label">Domain</span>
          <input name="domain" autoFocus placeholder="mysite.test" value={domain} onChange={(e) => setDomain(e.target.value)} autoComplete="off" spellCheck={false} />
          {preview && <span className="field-hint mono">{siteUrl(preview)}</span>}
        </label>

        <div className="field">
          <span className="field-label">PHP version</span>
          <div className="choice-row" role="radiogroup" aria-label="PHP version">
            {PHP_VERSIONS.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={php === v} className={`choice${php === v ? ' is-active' : ''}`} onClick={() => setPhp(v)}>
                <span className="mono">{v}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">WordPress version</span>
          <input name="wpVersion" placeholder="latest" value={wpVersion} onChange={(e) => setWpVersion(e.target.value)} autoComplete="off" />
          <span className="field-hint">Leave empty for the latest release.</span>
        </label>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!trimmed}>
          <Sparkles size={15} /> Create site
        </button>
      </div>
    </Modal>
  );
}
