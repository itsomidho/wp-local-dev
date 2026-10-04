import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import GithubSlugger from 'github-slugger';
// The real README, not a copy -- imported as raw text, so this page can
// never drift out of sync with the actual docs, and (in `npm run dev`
// specifically) editing README.md hot-reloads this page via Vite the same
// way editing any other source file does. The built, dockerized dashboard
// (how this is normally run) bakes it in at build time same as everything
// else here -- `wpdev update` picks up a changed README the same way it
// picks up a changed component.
import readmeRaw from '../../../README.md?raw';

const HEADING_RE = /^(#{2,3})\s+(.+)$/gm;

// Mirrors how the markdown will actually be rendered: rehype-slug (used
// below) assigns heading ids via this exact same library, in document
// order, including its stateful handling of duplicate headings (appends
// -1, -2, ...). Using the same slugger here, fed titles in the same order,
// is what guarantees a TOC link and its target heading always agree --
// hand-rolling an equivalent slug function risks drifting from whatever
// rehype-slug actually does.
function buildToc(markdown) {
  const slugger = new GithubSlugger();
  const toc = [];
  let m;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(markdown)) !== null) {
    const level = m[1].length;
    const title = m[2].trim();
    toc.push({ level, title, slug: slugger.slug(title) });
  }
  return toc;
}

// For search: each heading's own body text (everything up to the next
// heading of the same or higher level), so a query can match prose too,
// not just section titles.
function buildSections(markdown) {
  const lines = markdown.split('\n');
  const headingLines = [];
  lines.forEach((line, i) => {
    const m = /^(#{2,3})\s+(.+)$/.exec(line);
    if (m) headingLines.push({ i, level: m[1].length, title: m[2].trim() });
  });
  return headingLines.map((h, idx) => {
    const end = headingLines[idx + 1]?.i ?? lines.length;
    return { title: h.title, level: h.level, body: lines.slice(h.i + 1, end).join('\n') };
  });
}

// Reads the real rendered text via the DOM (.textContent), not the
// markdown source -- rehype-highlight wraps tokens in nested <span>s, and
// textContent flattens all of that back to the plain command a person
// would actually want on their clipboard.
function CodeBlock({ node, ...rest }) {
  const preRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = preRef.current?.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="docs-code-block">
      <button
        type="button"
        className={`docs-code-copy${copied ? ' copied' : ''}`}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={preRef} {...rest} />
    </div>
  );
}

export default function DocsPage({ onClose }) {
  const [query, setQuery] = useState('');

  const toc = useMemo(() => buildToc(readmeRaw), []);
  const sections = useMemo(() => buildSections(readmeRaw), []);

  const matchedSlugs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null; // null = no filter, show everything
    const set = new Set();
    toc.forEach((entry, i) => {
      const section = sections[i];
      if (entry.title.toLowerCase().includes(q) || section?.body.toLowerCase().includes(q)) {
        set.add(entry.slug);
      }
    });
    return set;
  }, [query, toc, sections]);

  return (
    <div className="docs-page">
      <aside className="docs-sidebar">
        <div className="docs-sidebar-head">
          <button className="ghost small" onClick={onClose}>
            ← Back
          </button>
        </div>
        <input
          name="docsSearch"
          className="docs-search"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="docs-toc">
          {toc.map((entry) => {
            const visible = !matchedSlugs || matchedSlugs.has(entry.slug);
            if (!visible) return null;
            return (
              <a
                key={entry.slug}
                href={`#${entry.slug}`}
                className={entry.level === 3 ? 'docs-toc-link docs-toc-sub' : 'docs-toc-link'}
              >
                {entry.title}
              </a>
            );
          })}
          {matchedSlugs && matchedSlugs.size === 0 && (
            <p className="muted docs-no-results">No matches.</p>
          )}
        </nav>
      </aside>

      <div className="docs-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug, rehypeHighlight]}
          components={{ pre: CodeBlock }}
        >
          {readmeRaw}
        </ReactMarkdown>
      </div>
    </div>
  );
}
