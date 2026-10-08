import { useState } from 'react';
import { Globe, Sparkles, Info } from 'lucide-react';
import { siteUrl } from '../api';
import { Modal, ModalHeader } from './ui';
import { PHP_EOL, PHP_VERSIONS, phpSlug } from '../lib/services';


export default function AddSiteDialog({ runningPhp = [], onSubmit, onClose }) {
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
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={php === v}
                className={`choice${php === v ? ' is-active' : ''}`}
                onClick={() => setPhp(v)}
                title={PHP_EOL.has(v) ? `PHP ${v} is end of life: no more security fixes` : undefined}
              >
                <span className="mono">{v}</span>
                {PHP_EOL.has(v) && <span className="choice-tag">EOL</span>}
              </button>
            ))}
          </div>
          {!runningPhp.includes(phpSlug(php)) && (
            <span className="field-hint field-hint-icon">
              <Info size={13} /> No site uses PHP {php} yet, so its container is built and started first. The first time, that
              takes a few minutes.
            </span>
          )}
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
