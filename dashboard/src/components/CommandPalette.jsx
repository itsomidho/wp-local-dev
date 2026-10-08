import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { Kbd } from './ui';

// ⌘K / Ctrl+K: every navigation target, site and stack action in one
// keyboard-driven list. `commands` is [{id, group, label, hint, icon,
// keywords, run}] -- built by App, which owns everything they act on.
export default function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const terms = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.group} ${c.label} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (cmd) => {
    onClose();
    cmd.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="overlay overlay-palette" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            name="command"
            placeholder="Search sites, pages and actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && <p className="palette-empty">No matches for “{query}”.</p>}
          {results.map((cmd, idx) => {
            const header = cmd.group !== results[idx - 1]?.group ? cmd.group : null;
            const Icon = cmd.icon;
            return (
              <div key={cmd.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  data-active={idx === active}
                  className="palette-item"
                  onMouseMove={() => setActive(idx)}
                  onClick={() => run(cmd)}
                >
                  {Icon && (
                    <span className={`palette-item-icon${cmd.danger ? ' is-danger' : ''}`}>
                      <Icon size={16} />
                    </span>
                  )}
                  <span className="palette-item-label">{cmd.label}</span>
                  {cmd.hint && <span className="palette-item-hint">{cmd.hint}</span>}
                  {idx === active && <CornerDownLeft size={14} className="palette-item-enter" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span>
            <Kbd>↵</Kbd> run
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
