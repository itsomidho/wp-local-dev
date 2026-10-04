function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function levelClass(percent) {
  if (percent >= 90) return 'stat-bar-fill stat-bar-danger';
  if (percent >= 70) return 'stat-bar-fill stat-bar-warning';
  return 'stat-bar-fill stat-bar-ok';
}

function Stat({ label, percent, detail, extra }) {
  return (
    <div className="stat">
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        <span className="stat-percent mono">{percent.toFixed(0)}%</span>
      </div>
      <div className="stat-bar">
        <div className={levelClass(percent)} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <span className="stat-detail mono">{detail}</span>
      {extra && <span className="stat-detail stat-detail-extra mono">{extra}</span>}
    </div>
  );
}

// The host machine actually running Docker -- on Docker Desktop (Mac/
// Windows) that's the Linux VM's resources, not the raw laptop hardware,
// which is the right number anyway since that VM is the real ceiling on
// what this stack can use.
export default function MachineStats({ stats, error }) {
  if (error) return null; // non-critical panel -- fail quiet, sites list is the point
  if (!stats) return null;

  const { cpu, memory, disk } = stats;

  return (
    <section className="panel stats-panel">
      <div className="panel-header">
        <h2>Machine</h2>
        <span className="muted">host running Docker</span>
      </div>
      <div className="stats-grid">
        <Stat label={`CPU (${cpu.cores} cores)`} percent={cpu.percent} detail={`load average ${cpu.loadAvg1.toFixed(2)}`} />
        <Stat
          label="Memory"
          percent={memory.percent}
          detail={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
        />
        <Stat
          label="Disk"
          percent={disk.percent}
          detail={`${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`}
          extra={
            // The bar above is the whole partition (is this drive filling
            // up); this is just what wp-local-dev itself (sites + snapshots
            // + backups) has used of that -- a different, smaller question.
            disk.projectBytes != null ? `wp-local-dev: ${formatBytes(disk.projectBytes)}` : null
          }
        />
      </div>
    </section>
  );
}
