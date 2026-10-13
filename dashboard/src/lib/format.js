import { stripAnsi } from './parse';

// 1536 -> "1.5 KB".
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

// wpdev's last line on failure is its ✗ message -- the part worth a toast.
export function lastOutputLine(e) {
  return (
    stripAnsi(`${e.data?.stdout || ''}\n${e.data?.stderr || ''}`)
      .trim()
      .split('\n')
      .pop()
      .replace(/^✗\s*/, '') || e.message
  );
}
