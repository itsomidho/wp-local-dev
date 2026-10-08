import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { Skeleton } from './ui';

function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function level(percent) {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return 'success';
}

function Ring({ percent, tone }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <svg className={`ring ring-${tone}`} viewBox="0 0 64 64" aria-hidden="true">
      <circle className="ring-track" cx="32" cy="32" r={r} />
      <circle
        className="ring-value"
        cx="32"
        cy="32"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
      />
    </svg>
  );
}

function Gauge({ icon: Icon, label, percent, detail, extra }) {
  const tone = level(percent);
  return (
    <div className="gauge">
      <div className="gauge-ring">
        <Ring percent={percent} tone={tone} />
        <span className="gauge-value mono">{percent.toFixed(0)}%</span>
      </div>
      <div className="gauge-text">
        <span className="gauge-label">
          <Icon size={14} /> {label}
        </span>
        <span className="gauge-detail mono">{detail}</span>
        {extra && <span className="gauge-detail gauge-extra mono">{extra}</span>}
      </div>
    </div>
  );
}

// The host machine actually running Docker -- on Docker Desktop (Mac/
// Windows) that's the Linux VM's resources, not the raw laptop hardware,
// which is the right number anyway since that VM is the real ceiling on
// what this stack can use.
export default function MachineStats({ stats, error }) {
  if (error) {
    return <p className="muted small">Machine stats are unavailable right now.</p>;
  }
  if (!stats) {
    return (
      <div className="gauges">
        {[0, 1, 2].map((i) => (
          <div className="gauge" key={i}>
            <Skeleton width={64} height={64} radius={999} />
            <div className="gauge-text">
              <Skeleton width={80} />
              <Skeleton width={120} height={12} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { cpu, memory, disk } = stats;

  return (
    <div className="gauges">
      <Gauge icon={Cpu} label={`CPU · ${cpu.cores} cores`} percent={cpu.percent} detail={`load ${cpu.loadAvg1.toFixed(2)}`} />
      <Gauge
        icon={MemoryStick}
        label="Memory"
        percent={memory.percent}
        detail={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
      />
      <Gauge
        icon={HardDrive}
        label="Disk"
        percent={disk.percent}
        detail={`${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`}
        extra={
          // The ring is the whole partition (is this drive filling up);
          // this is what wp-local-dev itself (sites + snapshots + backups)
          // uses of it -- a different, smaller question.
          disk.projectBytes != null ? `wp-local-dev ${formatBytes(disk.projectBytes)}` : null
        }
      />
    </div>
  );
}
