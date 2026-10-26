import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy, Search } from 'lucide-react';
import { GROUP_ORDER, fillSite, hasSitePlaceholder } from '../lib/cheatsheet';

const SITE_KEY = 'wpdev.cheatsheetSite';

function readSite() {
  try {
    return localStorage.getItem(SITE_KEY) || '';
  } catch {
    return '';
  }
}

function slugOf(group) {
  return `cheat-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

// A description's markdown, inline: no paragraph around it, and README
// links (#a-heading) handed to onAnchor so they open in the full README.
function Description({ text, onAnchor }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <>{children}</>,
        a: ({ href, children }) =>
          href?.startsWith('#') ? (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAnchor(href.slice(1));
              }}
            >
              {children}
            </a>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CommandRow({ command, site, onAnchor }) {
  const [copied, setCopied] = useState(false);
  const parts = fillSite(command.syntax, site);
  const text = parts.map((p) => p.text).join('');
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <li className="cheat-row">
      <div className="cheat-command">
        <code>
          {parts.map((p, i) =>
            p.site ? (
              <mark key={i} className="cheat-site">
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </code>
        <button
          type="button"
          className={`cheat-copy${copied ? ' is-copied' : ''}`}
          onClick={copy}
          aria-label={`Copy ${text}`}
          title="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <p className="cheat-desc">
        <Description text={command.description} onAnchor={onAnchor} />
      </p>
    </li>
  );
}

// Every wpdev command, grouped, filterable, one click to copy -- with a
// chosen site filled in wherever a command takes one.
export default function Cheatsheet({ commands, sites, onAnchor }) {
  const [query, setQuery] = useState('');
  const [site, setSiteState] = useState(readSite);
  const setSite = (v) => {
    setSiteState(v);
    try {
      localStorage.setItem(SITE_KEY, v);
    } catch {
      // Private window or blocked storage: it just isn't remembered.
    }
  };
  // A remembered site that's since been removed doesn't fill anything in.
  const activeSite = sites.some((s) => s.name === site) ? site : '';

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (c) =>
      !q || c.syntax.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.group.toLowerCase().includes(q);
    return GROUP_ORDER.map((g) => ({
      name: g,
      commands: commands.filter((c) => c.group === g && matches(c)),
    })).filter((g) => g.commands.length > 0);
  }, [commands, query]);
  const shown = groups.reduce((n, g) => n + g.commands.length, 0);
  const withSite = commands.filter((c) => hasSitePlaceholder(c.syntax)).length;

  return (
    <>
      <aside className="docs-sidebar">
        <label className="input-search">
          <Search size={15} />
          <input name="cheatSearch" placeholder="Filter commands…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="cheat-site-pick">
          <span>Fill in a site</span>
          <select value={activeSite} onChange={(e) => setSite(e.target.value)}>
            <option value="">None — keep &lt;site&gt;</option>
            {sites.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="field-hint">Used in the {withSite} commands that take a site.</span>
        </label>
        <nav className="docs-toc" aria-label="Command groups">
          {groups.map((g) => (
            <a key={g.name} href={`#${slugOf(g.name)}`} className="docs-toc-link cheat-toc-link">
              <span>{g.name}</span>
              <span className="cheat-count">{g.commands.length}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="docs-content cheat-content">
        <h2>Command cheatsheet</h2>
        <p className="muted">
          Every <code>wpdev</code> command, from the README&apos;s command reference. <code>&lt;…&gt;</code> is required,{' '}
          <code>[…]</code> optional, <code>a|b</code> one or the other.
        </p>
        {shown === 0 ? (
          <p className="muted">No command matches “{query}”.</p>
        ) : (
          groups.map((g) => (
            <section key={g.name} className="cheat-group">
              <h3 id={slugOf(g.name)}>{g.name}</h3>
              <ul className="cheat-list">
                {g.commands.map((c) => (
                  <CommandRow key={c.syntax} command={c} site={activeSite} onAnchor={onAnchor} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
