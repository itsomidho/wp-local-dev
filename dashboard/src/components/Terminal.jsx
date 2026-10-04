// Renders wpdev's own colored stdout/stderr as-is, instead of re-deriving
// status text in JS. wpdev's print_* helpers only ever use 5 fixed codes
// (green/yellow/red/blue/reset) -- this maps exactly those and drops any
// other escape sequence it doesn't recognize rather than guessing.
const CODE_CLASS = {
  '0;32': 'ansi-green',
  '1;33': 'ansi-yellow',
  '0;31': 'ansi-red',
  '0;34': 'ansi-blue',
};

const ANSI_RE = /\x1b\[([0-9;]*)m/g;

function ansiToNodes(text, keyPrefix) {
  const nodes = [];
  let openClass = null;
  let lastIndex = 0;
  let match;
  let i = 0;

  const pushText = (chunk) => {
    if (!chunk) return;
    nodes.push(
      openClass
        ? <span className={openClass} key={`${keyPrefix}-${i++}`}>{chunk}</span>
        : chunk
    );
  };

  ANSI_RE.lastIndex = 0;
  while ((match = ANSI_RE.exec(text)) !== null) {
    pushText(text.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
    const code = match[1];
    openClass = code === '0' || code === '' ? null : CODE_CLASS[code] || openClass;
  }
  pushText(text.slice(lastIndex));
  return nodes;
}

// `lines` is an array of either plain strings or {stream, line} objects (as
// produced by the SSE log). stderr lines get a dim style so they read as
// "noise" (progress output from `docker compose`, etc.) without hiding them.
export default function Terminal({ lines, className = '' }) {
  return (
    <pre className={`terminal ${className}`}>
      {lines.map((entry, idx) => {
        const isObj = typeof entry === 'object' && entry !== null;
        const text = isObj ? entry.line : entry;
        const stderr = isObj && entry.stream === 'stderr';
        return (
          <div className={stderr ? 'terminal-line terminal-stderr' : 'terminal-line'} key={idx}>
            {ansiToNodes(text, idx)}
          </div>
        );
      })}
    </pre>
  );
}

export function stripAnsiToLines(text) {
  return text.split('\n').filter((l) => l.length > 0);
}
