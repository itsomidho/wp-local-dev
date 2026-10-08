import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ScrollText, Pause, Play, Trash2 } from 'lucide-react';
import { streamSSE } from '../api';
import Terminal from './Terminal';
import { Drawer, JumpToLatest, Modal, ModalHeader, useFollowOutput } from './ui';

// Runs one streamed wpdev action (POST/DELETE that returns SSE) and shows
// its output live, exactly as it would print in a terminal. `request` is
// {method, path, body}. `onFinished(code)` fires once, when the underlying
// wpdev process exits -- callers use it to refresh whatever list changed.
// Not dismissable while running: closing would abort the stream, and the
// api stops the command when its client goes away.
export default function LogModal({ title, request, onFinished, onClose }) {
  const [lines, setLines] = useState([]);
  const [code, setCode] = useState(null);
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const { ref: bodyRef, atBottom, scrollToBottom } = useFollowOutput(lines);

  useEffect(() => {
    const abort = streamSSE(request.method, request.path, request.body, {
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
    return abort;
    // Only ever run once per mounted modal -- `request` is captured at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = code === null;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const icon = running ? Loader2 : code === 0 ? CheckCircle2 : XCircle;

  return (
    <Modal onClose={running ? null : onClose} size="lg" className={`log-modal ${running ? 'is-running' : code === 0 ? 'is-ok' : 'is-fail'}`}>
      <ModalHeader icon={icon} title={title} subtitle={running ? `Running · ${elapsed}s` : code === 0 ? 'Finished successfully' : `Exited with code ${code}`} />
      <div className="log-frame">
        <div className="log-body" ref={bodyRef}>
          <Terminal lines={lines} className="terminal-flush" />
          {running && <span className="cursor" />}
        </div>
        {!atBottom && <JumpToLatest onClick={scrollToBottom} />}
      </div>
      <div className="modal-footer">
        {running ? (
          <span className="muted small">Keep this open until it finishes. Closing the page stops the command.</span>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            Close
          </button>
        )}
      </div>
    </Modal>
  );
}

// Live `docker compose logs -f` for one service, starting from its last
// 200 lines. Closing the drawer aborts the stream, which stops the
// follow on the api side.
export function LogsDrawer({ service, label, onClose }) {
  const [lines, setLines] = useState([]);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(null);
  const pausedRef = useRef(false);
  const buffer = useRef([]);
  const { ref: bodyRef, atBottom, scrollToBottom } = useFollowOutput(lines, { enabled: !paused });

  useEffect(() => {
    const abort = streamSSE('GET', `/api/logs/${encodeURIComponent(service)}?tail=200`, undefined, {
      onLine: (entry) => {
        if (pausedRef.current) buffer.current.push(entry);
        // Cap what's kept so a chatty container can't grow this forever.
        else setLines((prev) => [...prev, entry].slice(-2000));
      },
      onDone: ({ code }) => setEnded(code),
      onError: (err) => {
        setLines((prev) => [...prev, { stream: 'stderr', line: `[dashboard] ${err.message}` }]);
        setEnded(-1);
      },
    });
    return abort;
  }, [service]);

  const togglePause = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    if (!next && buffer.current.length) {
      const queued = buffer.current;
      buffer.current = [];
      setLines((prev) => [...prev, ...queued].slice(-2000));
    }
  };

  return (
    <Drawer onClose={onClose} className="drawer-logs">
      <ModalHeader
        icon={ScrollText}
        title={`${label} logs`}
        subtitle={ended !== null ? 'Stream ended' : paused ? `Paused · ${buffer.current.length} new lines waiting` : 'Following live'}
        onClose={onClose}
      >
        <div className="modal-header-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={togglePause} disabled={ended !== null}>
            {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([])}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </ModalHeader>
      <div className="log-frame">
        <div className="log-body" ref={bodyRef}>
          {lines.length === 0 && ended === null && <p className="log-waiting">Waiting for output…</p>}
          <Terminal lines={lines} className="terminal-flush" />
        </div>
        {!atBottom && !paused && <JumpToLatest onClick={scrollToBottom} />}
      </div>
    </Drawer>
  );
}
