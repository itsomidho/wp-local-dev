import { useState } from 'react';
import { Bug } from 'lucide-react';
import { Avatar, Skeleton } from './ui';
import { DebugLog, DebugSettings } from './Debug';

// WordPress debugging, one site at a time: its switches beside its
// debug.log, which gets the room it needs -- long messages and stack traces
// read badly in a drawer. The site is in the address (#/debug/<site>), so a
// bookmark or a reload comes back to it.
export default function DebugPage({ sites, siteName, onSelectSite }) {
  const site = sites?.find((s) => s.name === siteName) || sites?.[0] || null;
  const [state, setState] = useState(null); // DebugSettings' answer: {settings, log, logBytes}
  const [reloadKey, setReloadKey] = useState(0);

  if (!sites) {
    return (
      <div className="page">
        <Skeleton height={320} radius={12} />
      </div>
    );
  }
  if (!site) {
    return (
      <div className="page">
        <div className="empty">
          <span className="empty-icon">
            <Bug size={22} />
          </span>
          <p>No sites yet. Add one, and its debug log shows up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page debug-page">
      {sites.length > 1 && (
        <nav className="debug-sites" role="tablist" aria-label="Site">
          {sites.map((s) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={s.name === site.name}
              className={`debug-site${s.name === site.name ? ' is-active' : ''}`}
              onClick={() => onSelectSite(s.name)}
            >
              <Avatar name={s.name} size={22} />
              <span className="mono">{s.domain}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="debug-layout" key={site.name}>
        <aside className="debug-aside">
          <DebugSettings site={site} onState={setState} reloadKey={reloadKey} />
        </aside>
        <div className="debug-main">
          <DebugLog site={site} logPath={state?.log} logBytes={state?.logBytes} onChanged={() => setReloadKey((k) => k + 1)} />
        </div>
      </div>
    </div>
  );
}
