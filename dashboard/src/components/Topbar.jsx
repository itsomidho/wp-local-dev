import { Menu, Search, Play, RotateCw, Square, RefreshCw, Sun, Moon, Loader2 } from 'lucide-react';
import { Kbd, isMac } from './ui';

const HEALTH = {
  ok: { tone: 'success', label: 'API connected' },
  down: { tone: 'danger', label: 'API unreachable' },
  checking: { tone: 'muted', label: 'Connecting…' },
};

export default function Topbar({
  title,
  subtitle,
  health,
  stackBusy,
  onStackAction,
  onRefresh,
  refreshing,
  theme,
  onToggleTheme,
  onOpenPalette,
  onOpenMenu,
}) {
  const h = HEALTH[health] || HEALTH.checking;

  return (
    <header className="topbar">
      <button type="button" className="btn btn-icon btn-ghost topbar-menu" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>

      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <button type="button" className="search-trigger" onClick={onOpenPalette}>
        <Search size={15} />
        <span>Search or run a command…</span>
        <span className="search-trigger-keys">
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="topbar-actions">
        <span className={`health-pill health-${h.tone}`} title={h.label}>
          <span className={`dot dot-${h.tone}${health === 'ok' ? ' dot-pulse' : ''}`} />
          <span className="health-pill-label">{h.label}</span>
        </span>

        <div className="segmented" role="group" aria-label="Stack">
          <button type="button" disabled={stackBusy} onClick={() => onStackAction('up')} title="Start every container">
            {stackBusy === 'up' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            <span>Up</span>
          </button>
          <button type="button" disabled={stackBusy} onClick={() => onStackAction('restart')} title="Restart every container">
            {stackBusy === 'restart' ? <Loader2 size={14} className="spin" /> : <RotateCw size={14} />}
            <span>Restart</span>
          </button>
          <button type="button" disabled={stackBusy} onClick={() => onStackAction('down')} title="Stop every container">
            {stackBusy === 'down' ? <Loader2 size={14} className="spin" /> : <Square size={14} />}
            <span>Down</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={onRefresh}
          title="Refresh everything"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
        </button>
        <button type="button" className="btn btn-icon btn-ghost" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
