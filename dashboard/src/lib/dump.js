// The tables in a .sql or .sql.gz dump, read in the browser before
// anything is uploaded: every `CREATE TABLE` statement's name, with the
// size of the SQL that follows it (its rows) up to the next table. Works
// on mysqldump, `wp db export`, phpMyAdmin and Adminer output alike. A
// .gz is told by its magic bytes, not its name, and is streamed through
// DecompressionStream, so a multi-GB dump never sits in memory whole.

// At the start of a line: dump tools write each statement on its own, and
// escape newlines inside values, so "CREATE TABLE" in a post's content
// never starts one.
const CREATE_RE = /^CREATE TABLE (?:IF NOT EXISTS )?[`"]?([A-Za-z0-9_$-]{1,64})[`"]?\s*\(/gim;

// onProgress(0..1) by bytes of the file read. Resolves to
// [{name, bytes}] in the dump's order; rejects if the file can't be read
// (a corrupt .gz). `signal` (an AbortSignal) stops it early.
export async function dumpTables(file, { onProgress, signal } = {}) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gzip = head[0] === 0x1f && head[1] === 0x8b;

  let read = 0;
  let stream = file.stream().pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        read += chunk.byteLength;
        onProgress?.(read / file.size);
        controller.enqueue(chunk);
      },
    }),
  );
  if (gzip) stream = stream.pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

  const tables = [];
  // Absolute offsets in the decompressed text. A statement can straddle
  // two chunks, so the tail of each is carried into the next -- and a
  // match already seen in that tail is skipped by its offset.
  const KEEP = 256;
  let carry = '';
  let consumed = 0; // characters before `carry`
  let lastAt = -1;
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException('Aborted', 'AbortError');
    }
    const { value, done } = await reader.read();
    if (done) break;
    const text = carry + value;
    CREATE_RE.lastIndex = 0;
    let m;
    while ((m = CREATE_RE.exec(text))) {
      const at = consumed + m.index;
      if (at <= lastAt) continue;
      if (tables.length) tables[tables.length - 1].end = at;
      tables.push({ name: m[1], start: at });
      lastAt = at;
    }
    const cut = Math.max(0, text.length - KEEP);
    consumed += cut;
    carry = text.slice(cut);
  }
  const total = consumed + carry.length;

  // A name seen twice (a dump of two databases) is one table here.
  const byName = new Map();
  for (const t of tables) {
    const bytes = (t.end ?? total) - t.start;
    byName.set(t.name, { name: t.name, bytes: (byName.get(t.name)?.bytes || 0) + bytes });
  }
  return [...byName.values()];
}
