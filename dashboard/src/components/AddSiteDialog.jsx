import { useEffect, useRef, useState } from 'react';
import { Globe, Sparkles, Info } from 'lucide-react';
import { api, siteUrl } from '../api';
import { Modal, ModalHeader } from './ui';
import { PHP_EOL, PHP_VERSIONS, phpSlug } from '../lib/services';

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const valid = (d) => DOMAIN_RE.test(d);
// wpdev's SITE_NAME_MAX: the site's name (domain minus suffix, dots as
// dashes) becomes its database name, wp_<name>, which MySQL caps.
const NAME_MAX = 28;
const suggest = (d) => d.replace(/_/g, '-');

// Offered as choices; "Other" takes any suffix.
const SUFFIXES = ['test', 'local', 'develop'];
const OTHER = 'other';
const SUFFIX_NOTES = {
  local: '.local is also mDNS (Bonjour/Avahi): on macOS, and Linux with Avahi, lookups can stall a few seconds first.',
  localhost: 'Browsers resolve *.localhost to this machine on their own, even without the /etc/hosts entry.',
};

export default function AddSiteDialog({ runningPhp = [], onSubmit, onClose }) {
  const [domain, setDomain] = useState('');
  // DOMAIN_SUFFIX from .env; "test" until it arrives (or if the api is older).
  const [defaultSuffix, setDefaultSuffix] = useState('test');
  const [suffixChoice, setSuffixChoice] = useState('test');
  const [customSuffix, setCustomSuffix] = useState('');
  // Set once the user picks a suffix, so the loaded default can't undo it.
  const suffixTouched = useRef(false);
  const [php, setPhp] = useState('8.2');
  const [wpVersion, setWpVersion] = useState('');

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        if (!s.domainSuffix) return;
        setDefaultSuffix(s.domainSuffix);
        if (!suffixTouched.current) setSuffixChoice(s.domainSuffix);
      })
      .catch(() => {});
  }, []);

  const pickSuffix = (choice) => {
    suffixTouched.current = true;
    setSuffixChoice(choice);
  };

  // A custom default (say "lan") gets its own choice, first.
  const suffixOptions = SUFFIXES.includes(defaultSuffix) ? SUFFIXES : [defaultSuffix, ...SUFFIXES];
  const suffix = (suffixChoice === OTHER ? customSuffix : suffixChoice).trim().toLowerCase().replace(/^\.+/, '');

  const trimmed = domain.trim().toLowerCase();
  // A full domain is taken as is; a bare name gets the suffix.
  const fullDomain = trimmed.includes('.');
  const preview = trimmed ? (fullDomain ? trimmed : `${trimmed}.${suffix}`) : '';
  // Same rule as wpdev's valid_domain: hostnames take no underscores, and
  // WordPress rejects admin@my_site.test outright, mid-install.
  const name = preview.slice(0, preview.lastIndexOf('.')).replace(/\./g, '-');
  const tooLong = name.length > NAME_MAX;
  const isValid = valid(preview) && !tooLong;
  const tld = preview.slice(preview.lastIndexOf('.') + 1);
  const note = isValid && SUFFIX_NOTES[tld];

  // The rest is wpdev's to judge (check-domain): already a site, a real
  // domain, taken in /etc/hosts. Asked once typing pauses; an api that
  // can't answer doesn't block, since `add` checks again anyway.
  const [check, setCheck] = useState(null);
  useEffect(() => {
    if (!isValid) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      api
        .checkDomain(preview)
        .then((r) => !stale && setCheck({ domain: preview, ok: r.ok, reason: r.reason }))
        .catch(() => !stale && setCheck({ domain: preview, ok: true }));
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [preview, isValid]);
  const checked = check?.domain === preview;
  const problem = checked && !check.ok ? check.reason : null;
  const canCreate = isValid && checked && !problem;

  const submit = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    onSubmit({ domain: preview, php, wpVersion: wpVersion.trim() || undefined });
  };

  return (
    <Modal onClose={onClose} size="md" as="form" onSubmit={submit}>
      <ModalHeader icon={Globe} title="New site" subtitle="Files, database, HTTPS certificate and nginx vhost in one go" onClose={onClose} />
      <div className="modal-body">
        <label className="field">
          <span className="field-label field-label-row">
            Domain
            <span className={`field-count${tooLong ? ' is-over' : ''}`} title="The site name becomes its database name">
              {name.length} / {NAME_MAX}
            </span>
          </span>
          <div className="input-affix">
            <input name="domain" maxLength={253} autoFocus placeholder="mysite" value={domain} onChange={(e) => setDomain(e.target.value)} autoComplete="off" spellCheck={false} />
            {!fullDomain && suffix && <span className="mono">.{suffix}</span>}
          </div>
          {preview && isValid && !problem && <span className="field-hint mono">{siteUrl(preview)}</span>}
          {problem && <span className="field-hint field-hint-error">{problem}</span>}
          {tooLong && (
            <span className="field-hint field-hint-error">
              The name is {name.length} characters; {NAME_MAX} at most, since it becomes the database name
            </span>
          )}
          {preview && !tooLong && !isValid && (
            <span className="field-hint field-hint-error">
              Only letters, digits, hyphens and dots{DOMAIN_RE.test(suggest(preview)) && <>; try <span className="mono">{suggest(preview)}</span></>}
            </span>
          )}
        </label>

        <div className="field">
          <span className="field-label">Suffix</span>
          <div className="choice-row suffix-row" role="radiogroup" aria-label="Domain suffix">
            {[...suffixOptions, OTHER].map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={suffixChoice === s}
                className={`choice${suffixChoice === s ? ' is-active' : ''}`}
                onClick={() => pickSuffix(s)}
                disabled={fullDomain}
              >
                {s === OTHER ? 'Other' : <span className="mono">.{s}</span>}
              </button>
            ))}
          </div>
          {suffixChoice === OTHER && !fullDomain && (
            <input
              name="suffix"
              className="mono"
              placeholder="e.g. lan"
              aria-label="Custom suffix"
              value={customSuffix}
              onChange={(e) => setCustomSuffix(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          )}
          {fullDomain ? (
            <span className="field-hint">You typed a full domain, so it's used as is.</span>
          ) : (
            note && (
              <span className="field-hint field-hint-icon">
                <Info size={13} /> {note}
              </span>
            )
          )}
        </div>

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
        <button type="submit" className="btn btn-primary" disabled={!canCreate}>
          <Sparkles size={15} /> Create site
        </button>
      </div>
    </Modal>
  );
}
