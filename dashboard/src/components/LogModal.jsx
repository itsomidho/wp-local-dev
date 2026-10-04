import { useEffect, useRef, useState } from 'react';
import { streamSSE } from '../api';
import Terminal from './Terminal';

// Runs one streamed wpdev action (POST/DELETE that returns SSE) and shows
// its output live, exactly as it would print in a terminal. `request` is
// {method, path, body}. `onFinished(code)` fires once, when the underlying
// wpdev process exits -- callers use it to refresh whatever list changed.
export default function LogModal({ title, request, onFinished, onClose }) {
  const [lines, setLines] = useState([]);
  const [code, setCode] = useState(null);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    abortRef.current = streamSSE(request.method, request.path, request.body, {
      onLine: (entry) => setLines((prev) => [...prev, entry]),
      onDone: (result) => {
        setCode(result.code);
        onFinished?.(result.code);
      },
      onError: (err) => {
        setLines((prev) => [...prev, { stream: 'stderr', line: `[dashboard] ${err.message}` }]);
        setCode(-1);
      },
    });
    return () => abortRef.current?.();
    // Only ever run once per mounted modal -- `request` is captured at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const running = code === null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <div className="modal-header">
          <h3>{title}</h3>
          {!running && (
            <span className={code === 0 ? 'pill pill-ok' : 'pill pill-fail'}>
              {code === 0 ? 'Done' : `Exited ${code}`}
            </span>
          )}
        </div>
        <Terminal lines={lines} className="terminal-modal" />
        <div ref={bottomRef} />
        <div className="modal-footer">
          {running ? (
            <span className="muted">Running…</span>
          ) : (
            <button onClick={onClose} autoFocus>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
