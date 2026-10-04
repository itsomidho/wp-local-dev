import { useState } from 'react';

const PHP_VERSIONS = ['8.1', '8.2', '8.3', '8.4'];

export default function AddSiteDialog({ onSubmit, onClose }) {
  const [domain, setDomain] = useState('');
  const [php, setPhp] = useState('8.2');
  const [wpVersion, setWpVersion] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const trimmed = domain.trim();
    if (!trimmed) return;
    onSubmit({ domain: trimmed, php, wpVersion: wpVersion.trim() || undefined });
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <h3>Add site</h3>
        </div>
        <div className="modal-body">
          <label className="field">
            <span>Domain</span>
            <input
              name="domain"
              autoFocus
              placeholder="mysite.test"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </label>
          <label className="field">
            <span>PHP version</span>
            <select name="php" value={php} onChange={(e) => setPhp(e.target.value)}>
              {PHP_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>WordPress version</span>
            <input
              name="wpVersion"
              placeholder="latest"
              value={wpVersion}
              onChange={(e) => setWpVersion(e.target.value)}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!domain.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
