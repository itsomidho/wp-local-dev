// WordPress's debug.log, as entries: each starts with a "[13-Oct-2026
// 17:20:30 UTC] " stamp. Everything else belongs to the entry above it --
// a fatal error's own "Stack trace:" / "#0 ..." lines (unstamped), and
// Xdebug's trace, which comes as stamped "PHP Stack trace:" and
// "PHP   1. ..." lines of their own.

const STAMP_RE = /^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})(?: ([A-Za-z_/+-]+))?\] (.*)$/;
const TRACE_RE = /^PHP (?:Stack trace:|\s+\d+\.\s)/;

export const LEVELS = [
  { id: 'fatal', label: 'Fatal', tone: 'danger' },
  { id: 'warning', label: 'Warning', tone: 'warning' },
  { id: 'notice', label: 'Notice', tone: 'info' },
  { id: 'deprecated', label: 'Deprecated', tone: 'muted' },
  { id: 'database', label: 'Database', tone: 'violet' },
  { id: 'other', label: 'Other', tone: undefined },
];

function levelOf(message) {
  if (/^PHP (Fatal error|Parse error|Recoverable fatal error)/.test(message)) return 'fatal';
  if (/^PHP Warning/.test(message)) return 'warning';
  if (/^PHP (Notice|Strict Standards)/.test(message)) return 'notice';
  if (/^PHP Deprecated/.test(message)) return 'deprecated';
  if (/^WordPress database error/.test(message)) return 'database';
  return 'other';
}

// "13-Oct-2026 17:20:30" (+ zone) -> ms. PHP writes the zone's
// abbreviation; UTC is what WordPress sets, and anything else is read as
// local time, which is right more often than not.
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseStamp(stamp, zone) {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp);
  if (!m || MONTHS[m[2]] === undefined) return null;
  const parts = [+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +m[6]];
  return zone === 'UTC' ? Date.UTC(...parts) : new Date(...parts).getTime();
}

// [{time, level, message, detail}] in the log's order. `detail` is the
// entry's extra lines (its stack trace), '' if none. Lines before the
// first stamp (a log cut mid-entry) become one "other" entry.
export function parseDebugLog(text) {
  const entries = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const m = STAMP_RE.exec(line);
    if (m && !(current && TRACE_RE.test(m[3]))) {
      current = { time: parseStamp(m[1], m[2]), level: levelOf(m[3]), message: m[3], detail: '' };
      entries.push(current);
      continue;
    }
    const rest = m ? m[3] : line;
    if (!current) {
      current = { time: null, level: 'other', message: rest, detail: '' };
      entries.push(current);
    } else {
      current.detail += (current.detail ? '\n' : '') + rest;
    }
  }
  return entries;
}

// What makes two messages "the same": quoted values and bare numbers
// blanked out (a "Duplicate entry 'https://…'" per row is one problem),
// but not line numbers -- a different line is a different place.
// A database error is keyed on the error alone, not the query after it,
// which carries each row's values.
export function messageKey(message) {
  return message
    .replace(/^(WordPress database error .*?) for query [\s\S]*$/, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "'…'")
    .replace(/"(?:[^"\\]|\\.)*"/g, '"…"')
    .replace(/(?<!line )\b\d+(\.\d+)?\b/g, 'N');
}

// Entries with the same level and messageKey as one, newest first:
// {…newest entry, count, first, variants}. A deprecation logged on every
// request is one row with its count, not thousands. `variants` counts the
// distinct exact messages folded in (1 when they're all identical).
export function groupEntries(entries) {
  const groups = new Map();
  entries.forEach((e, i) => {
    const key = `${e.level}\u0000${messageKey(e.message)}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...e, count: 1, first: e.time, last: i, messages: new Set([e.message]) });
      return;
    }
    g.count += 1;
    g.messages.add(e.message);
    // Later in the file is newer, whatever the stamps say.
    Object.assign(g, { time: e.time ?? g.time, message: e.message, detail: e.detail || g.detail, last: i });
    if (e.time !== null && (g.first === null || e.time < g.first)) g.first = e.time;
  });
  return [...groups.values()]
    .sort((a, b) => b.last - a.last)
    .map(({ messages, last, ...g }) => ({ ...g, variants: messages.size }));
}
