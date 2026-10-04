// Explicit choice wins and persists; otherwise the page follows the OS/
// browser's prefers-color-scheme (handled in CSS, not here -- see
// index.css) so "no choice made yet" isn't the same as "dark".
const KEY = 'wpdev_theme';

export function getStoredTheme() {
  return localStorage.getItem(KEY); // 'dark' | 'light' | null
}

export function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
}

export function setTheme(theme) {
  if (theme) localStorage.setItem(KEY, theme);
  else localStorage.removeItem(KEY);
  applyTheme(theme);
}

// Called once, before React mounts, so there's no flash of the wrong theme.
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function currentEffectiveTheme() {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
