'use strict';

const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');

// This is deliberately NOT routed through wpdev -- there's no WordPress-
// domain judgment call here for a real implementation to diverge from (no
// "is this site provisioned" style question), just arithmetic over kernel
// counters, so a second implementation here doesn't create the kind of
// drift the wpdev-as-core rule exists to prevent.
//
// Confirmed live (not assumed) that these counters reflect the real HOST
// machine from inside this container, not some cgroup-scoped illusion of
// it: compared /proc/meminfo, /proc/stat, and `df` for the bind-mounted
// project path side by side, container vs. host, and they matched. That's
// a different situation from e.g. a network reachability check from in
// here (genuinely container-scoped, see the Status modal) -- memory, CPU
// time, and a bind-mounted path's disk usage aren't namespaced by default
// in standard Docker. On Docker Desktop (Mac/Windows) this reports the
// Linux VM's resources, not the raw host hardware -- arguably the more
// useful number anyway, since that VM is the real ceiling on what this
// stack can use.

function cpuSnapshot() {
  return os.cpus().map((c) => ({
    idle: c.times.idle,
    total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
  }));
}

async function getCpuPercent() {
  const a = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const b = cpuSnapshot();

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < a.length; i++) {
    idleDelta += b[i].idle - a[i].idle;
    totalDelta += b[i].total - a[i].total;
  }
  const percent = totalDelta > 0 ? 100 * (1 - idleDelta / totalDelta) : 0;
  return { percent: Math.max(0, Math.min(100, percent)), cores: a.length };
}

function getMemory() {
  // MemAvailable, not MemFree -- Linux uses "free" RAM aggressively for
  // disk cache that's instantly reclaimable under pressure, so MemFree
  // alone makes usage look misleadingly high. Falls back to Node's own
  // (cruder, MemFree-equivalent) os totals if /proc/meminfo isn't there.
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8');
    const total = Number(/MemTotal:\s+(\d+)/.exec(text)[1]) * 1024;
    const available = Number(/MemAvailable:\s+(\d+)/.exec(text)[1]) * 1024;
    const used = total - available;
    return { totalBytes: total, usedBytes: used, percent: (used / total) * 100 };
  } catch {
    const total = os.totalmem();
    const used = total - os.freemem();
    return { totalBytes: total, usedBytes: used, percent: total > 0 ? (used / total) * 100 : 0 };
  }
}

function getDisk(targetPath) {
  return new Promise((resolve, reject) => {
    execFile('df', ['-k', targetPath], (err, stdout) => {
      if (err) return reject(err);
      const line = stdout.trim().split('\n').pop();
      const parts = line.trim().split(/\s+/);
      // Filesystem, 1K-blocks, Used, Available, Use%, Mounted-on
      const totalBytes = Number(parts[1]) * 1024;
      const usedBytes = Number(parts[2]) * 1024;
      const percent = parseFloat(parts[4]);
      resolve({ path: targetPath, totalBytes, usedBytes, percent });
    });
  });
}

async function getSystemStats(diskPath) {
  const [cpu, disk] = await Promise.all([getCpuPercent(), getDisk(diskPath)]);
  const memory = getMemory();
  // 1-minute load average -- distinct from the instantaneous %busy figure
  // above (that's a snapshot; this is a trend), cheap to add since Node
  // already exposes it with no extra shelling out.
  const [loadAvg1] = os.loadavg();
  return { cpu: { ...cpu, loadAvg1 }, memory, disk };
}

module.exports = { getSystemStats };
