import { useEffect, useState } from 'react';
import { Info, Lock } from 'lucide-react';
import { api } from '../api';
import { stripAnsi } from '../lib/parse';
import { serviceInfo } from '../lib/services';
import { shortId, timeAgo } from '../lib/docker';
import { Chip, Drawer, ModalHeader, Skeleton } from './ui';

// `wpdev inspect <service>`, laid out: what's running, how it's wired up
// (ports, networks, mounts) and its environment. Secrets arrive already
// masked -- wpdev replaces them before they leave the server.
export default function ContainerDetails({ service, onClose }) {
  const [data, setData] = useState(null);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState(null);
  const info = serviceInfo(service);

  useEffect(() => {
    api
      .inspectService(service)
      .then((r) => {
        setRaw(r.stdout);
        setData(JSON.parse(r.stdout)[0]);
      })
      .catch((e) => setError(stripAnsi(e.data?.stdout || e.message).trim()));
  }, [service]);

  return (
    <Drawer onClose={onClose} className="drawer-details">
      <ModalHeader icon={info.icon} title={`${info.label} details`} subtitle={data ? data.Name.replace(/^\//, '') : `wp-${service}`} onClose={onClose} />
      <div className="drawer-body">
        {error && <p className="error">{error}</p>}
        {!data && !error && <Skeleton height={240} radius={12} />}
        {data && <Details data={data} raw={raw} />}
      </div>
    </Drawer>
  );
}

function Kv({ rows }) {
  return (
    <dl className="kv">
      {rows
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => (
          <div className="kv-row" key={k}>
            <dt>{k}</dt>
            <dd>{typeof v === 'string' ? <code className="mono">{v}</code> : v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Details({ data, raw }) {
  const state = data.State || {};
  const cfg = data.Config || {};
  const host = data.HostConfig || {};
  const net = data.NetworkSettings || {};
  const tone = state.Running ? (state.Health?.Status === 'unhealthy' ? 'warning' : 'success') : 'danger';

  const ports = Object.entries(net.Ports || {}).flatMap(([inner, binds]) =>
    binds && binds.length ? binds.map((b) => `${b.HostIp || '0.0.0.0'}:${b.HostPort} → ${inner}`) : [`${inner} (not published)`],
  );
  const uniquePorts = [...new Set(ports.map((p) => p.replace(/^(::|\[::\]):/, '0.0.0.0:')))];
  const env = (cfg.Env || []).map((e) => {
    const i = e.indexOf('=');
    return { key: e.slice(0, i), value: e.slice(i + 1) };
  });

  return (
    <div className="tab-panel">
      <section className="panel-section">
        <h4>Container</h4>
        <Kv
          rows={[
            [
              'State',
              <span className="chips" key="s">
                <Chip tone={tone}>{state.Status}</Chip>
                {state.Health && <Chip tone={state.Health.Status === 'healthy' ? 'success' : 'warning'}>{state.Health.Status}</Chip>}
              </span>,
            ],
            ['Started', state.StartedAt && `${timeAgo(state.StartedAt)} · ${new Date(state.StartedAt).toLocaleString()}`],
            ['Image', cfg.Image],
            ['Image ID', shortId(data.Image)],
            ['Command', [...(cfg.Entrypoint || []), ...(cfg.Cmd || [])].join(' ')],
            ['User', cfg.User],
            ['Workdir', cfg.WorkingDir],
            ['Restart', host.RestartPolicy?.Name],
            ['Restarts', String(data.RestartCount ?? 0)],
          ]}
        />
      </section>

      {uniquePorts.length > 0 && (
        <section className="panel-section">
          <h4>Ports</h4>
          <div className="chips">
            {uniquePorts.map((p) => (
              <Chip key={p} mono>
                {p}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <section className="panel-section">
        <h4>Networks</h4>
        <Kv
          rows={Object.entries(net.Networks || {}).map(([name, n]) => [
            name,
            <span className="kv-inline" key={name}>
              <code className="mono">{n.IPAddress || 'no IP'}</code>
              {(n.Aliases || n.DNSNames || []).filter((a) => !/^[a-f0-9]{12}$/.test(a)).length > 0 && (
                <span className="dim small">aka {(n.Aliases || n.DNSNames).filter((a) => !/^[a-f0-9]{12}$/.test(a)).join(', ')}</span>
              )}
            </span>,
          ])}
        />
      </section>

      {(data.Mounts || []).length > 0 && (
        <section className="panel-section">
          <h4>Mounts</h4>
          <ul className="mount-list">
            {data.Mounts.map((m) => (
              <li key={m.Destination}>
                <Chip>{m.Type}</Chip>
                <code className="mono">{m.Type === 'volume' ? m.Name : m.Source}</code>
                <span className="dim">→</span>
                <code className="mono">{m.Destination}</code>
                {!m.RW && <Chip tone="info">read-only</Chip>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel-section">
        <h4>Environment</h4>
        <dl className="kv kv-env">
          {env.map(({ key, value }) => (
            <div className="kv-row" key={key}>
              <dt className="mono">{key}</dt>
              <dd>
                {value === '********' ? (
                  <span className="masked">
                    <Lock size={12} /> hidden
                  </span>
                ) : (
                  <code className="mono">{value}</code>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <details className="raw-output">
        <summary>
          <Info size={14} /> Raw <code>docker inspect</code> (secrets masked)
        </summary>
        <pre className="terminal output">{raw}</pre>
      </details>
    </div>
  );
}
