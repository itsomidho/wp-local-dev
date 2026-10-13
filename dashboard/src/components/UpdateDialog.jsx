import { useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, GitCommitHorizontal } from 'lucide-react';
import { Modal, ModalHeader } from './ui';

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

// **bold**, `code` and [links](https://…) inside a line of release notes,
// as React nodes -- never as HTML, so a release body can't inject markup.
function inline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={m.index}>{m[2]}</strong>);
    else if (m[3]) out.push(<code key={m.index}>{m[3]}</code>);
    else
      out.push(
        <a key={m.index} href={m[5]} target="_blank" rel="noreferrer">
          {m[4]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// GitHub release notes (Markdown) as headings, lists and paragraphs: the
// subset release notes use.
function ReleaseNotes({ body }) {
  const blocks = [];
  let list = null;
  body
    .replace(/\r/g, '')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trimEnd();
      const item = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
      if (item) {
        if (!list) {
          list = [];
          blocks.push(<ul key={`l${i}`}>{list}</ul>);
        }
        list.push(<li key={i}>{inline(item[1])}</li>);
        return;
      }
      list = null;
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) blocks.push(<h5 key={i}>{inline(heading[2])}</h5>);
      else if (line.trim()) blocks.push(<p key={i}>{inline(line.trim())}</p>);
    });
  return <div className="release-notes">{blocks}</div>;
}

export default function UpdateDialog({ info, onCheck, onUpdate, onClose }) {
  const [checking, setChecking] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      await onCheck();
    } finally {
      setChecking(false);
    }
  };

  const behind = info?.behind || 0;
  const changes = info?.changes || [];
  const shown = showAll ? changes : changes.slice(0, 8);
  const blocked = info?.dirty > 0 || info?.ahead > 0;

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader icon={Sparkles} title="Updates" subtitle="wp-local-dev itself: its scripts, images and dashboard" onClose={onClose} />
      <div className="modal-body update-body">
        {!info ? (
          <p className="muted">Checking…</p>
        ) : (
          <>
            <div className={`update-status${behind ? ' is-available' : ''}`}>
              {behind ? <Sparkles size={20} /> : <CheckCircle2 size={20} />}
              <span>
                <strong>
                  {behind
                    ? info.latestTag && info.latestTag !== info.currentTag
                      ? `${info.latestTag} is available`
                      : `${behind} new change${behind === 1 ? '' : 's'} available`
                    : "You're up to date"}
                </strong>
                <small>
                  You have <span className="mono">{info.current}</span>
                  {info.branch && info.branch !== 'main' ? ` (branch ${info.branch})` : ''}. Checked {timeAgo(info.checkedAt)}.
                </small>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={check} disabled={checking}>
                <RefreshCw size={14} className={checking ? 'spin' : undefined} /> {checking ? 'Checking…' : 'Check now'}
              </button>
            </div>

            {info.error && <p className="field-hint field-hint-error">The last check failed: {info.error}</p>}

            {behind > 0 && info.release && (
              <section className="update-section">
                <div className="section-row">
                  <h4 title={info.release.name}>What's new in {info.release.tag}</h4>
                  {info.release.url && (
                    <a href={info.release.url} target="_blank" rel="noreferrer" className="update-link">
                      On GitHub <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <ReleaseNotes body={info.release.body} />
              </section>
            )}

            {changes.length > 0 && (
              <section className="update-section">
                <h4>
                  {behind} change{behind === 1 ? '' : 's'} since your version
                </h4>
                <ul className="update-changes">
                  {shown.map((c) => (
                    <li key={c}>
                      <GitCommitHorizontal size={14} />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                {changes.length > shown.length && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
                    Show all {changes.length}
                  </button>
                )}
              </section>
            )}

            {behind > 0 && info.dirty > 0 && (
              <p className="update-warning">
                <AlertTriangle size={15} />
                <span>
                  The project folder has {info.dirty} uncommitted change{info.dirty === 1 ? '' : 's'}. Updating needs a clean checkout:
                  commit or stash them first (<code>git status</code> lists them).
                </span>
              </p>
            )}
            {behind > 0 && info.ahead > 0 && (
              <p className="update-warning">
                <AlertTriangle size={15} />
                <span>
                  Your checkout has {info.ahead} commit{info.ahead === 1 ? '' : 's'} origin doesn't, so it can't simply move forward.
                  Rebase onto <code>origin/{info.branch || 'main'}</code>, then update.
                </span>
              </p>
            )}
          </>
        )}
      </div>
      <div className="modal-footer">
        {behind > 0 && <span className="update-footnote">Pulls, rebuilds images and recreates containers; sites are briefly unreachable.</span>}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        {behind > 0 && (
          <button type="button" className="btn btn-primary" onClick={onUpdate} disabled={blocked}>
            <Sparkles size={15} /> Update now
          </button>
        )}
      </div>
    </Modal>
  );
}
