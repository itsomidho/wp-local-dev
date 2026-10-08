// Helpers for the Docker page: wpdev's --json commands print one JSON
// object per line, and docker's own sizes come either as bytes or as its
// human strings ("1.665GB", "37.89MiB").

export function jsonLines(stdout) {
  return (stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return i === 0 ? `${n} B` : `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

const UNIT = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

// "1.665GB" / "37.89MiB" -> bytes, or null when it isn't a size.
export function parseSize(text) {
  const m = /^([\d.]+)\s*([kmgt]?i?b)$/i.exec((text || '').trim());
  return m ? parseFloat(m[1]) * (UNIT[m[2].toLowerCase()] || 1) : null;
}

export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  const steps = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Infinity, 'year'],
  ];
  let v = s;
  for (const [size, unit] of steps) {
    if (v < size) {
      const n = Math.floor(v);
      return n <= 1 && unit === 'second' ? 'just now' : `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
    v /= size;
  }
  return '';
}

export function shortId(id) {
  return (id || '').replace(/^sha256:/, '').slice(0, 12);
}
