'use strict';

const { spawn } = require('child_process');

// Set by docker-compose.yml from .env's PROJECT_DIR (kept in sync by
// `wpdev up` -- see that file's comment on the `api` service for why this
// has to be the project's real absolute path, not just "." or "/app").
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const WPDEV_BIN = `${PROJECT_DIR}/wpdev`;

// Every call below uses `spawn(WPDEV_BIN, argsArray)` -- never a shell
// string and never `{ shell: true }`. That's load-bearing, not a style
// choice: argv elements reach wpdev as literal strings with no shell
// re-interpretation in between, so a malicious/malformed value (a site
// name, a WP-CLI arg, a filename) can't break out into a second shell
// command no matter what characters it contains. wpdev's own
// double-quoted bash variables give a second layer of the same property
// once the arg lands there.

// Runs a wpdev subcommand to completion and resolves with its full output.
// stdin is always closed (`ignore`) -- every command this API drives is one
// of wpdev's own non-interactive-safe paths (--yes / --domain= / read-only),
// so nothing here should ever be blocked waiting on a prompt; if something
// is, that's a bug in which args this file passes, not a reason to feed it
// a TTY.
function runWpdev(args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(WPDEV_BIN, args, {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

// Runs a wpdev subcommand and streams each stdout/stderr line to `res` as a
// Server-Sent Event as soon as it's produced -- for commands that take a
// while and print real step-by-step progress (add, clone, snapshot,
// restore, update, backup, restore-all), so a GUI can show live progress
// instead of a spinner with no information until the whole thing finishes.
function streamWpdev(args, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let child;
  try {
    child = spawn(WPDEV_BIN, args, {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    send('done', { code: -1, error: err.message });
    res.end();
    return;
  }

  const forward = (stream) => (chunk) => {
    chunk
      .toString('utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .forEach((line) => send('line', { stream, line }));
  };
  child.stdout.on('data', forward('stdout'));
  child.stderr.on('data', forward('stderr'));

  child.on('close', (code) => {
    send('done', { code });
    res.end();
  });

  // A client that navigates away mid-provisioning shouldn't leave a
  // destructive or long-running command running unsupervised -- nobody is
  // left watching its result or able to confirm it finished cleanly.
  res.on('close', () => {
    if (child.exitCode === null) child.kill('SIGTERM');
  });
}

module.exports = { runWpdev, streamWpdev, PROJECT_DIR };
