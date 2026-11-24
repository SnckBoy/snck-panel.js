import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Waypoints,
  Zap,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useOverview, type OverviewHistoryPoint } from "../../hooks/useOverview";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Meter,
  PageHeader,
  Ring,
  SectionCard,
  Skeleton,
  formatBytes,
  formatPercent,
  statusLabel,
  statusTone,
  timeAgo,
  uptimeLabel,
} from "../../components/ui";

function Sparkline({ points, color = "var(--pn-accent)" }: { points: number[]; color?: string }) {
  const safe = points.filter((value) => Number.isFinite(value));
  const samples = safe.length < 2 ? [0, 0] : safe;
  const max = Math.max(...samples, 1);
  const min = Math.min(...samples, 0);
  const range = max - min || 1;
  const d = samples
    .map((value, index) => `${(index / (samples.length - 1)) * 100},${100 - ((value - min) / range) * 84 - 8}`)
    .join(" ");
  return (
    <svg className="pn-stat-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,100 ${d} 100,100`} fill={color} fillOpacity="0.09" />
      <polyline points={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrafficChart({ history }: { history: OverviewHistoryPoint[] }) {
  const width = 640;
  const height = 190;
  const padX = 8;
  const padY = 14;
  const points = history.length >= 2 ? history : [];
  const value = (item: OverviewHistoryPoint, key: "cpu" | "memory") => Math.max(0, Math.min(100, Number(item[key]) || 0));
  const path = (key: "cpu" | "memory") =>
    points
      .map((item, index) => {
        const x = padX + (index / (points.length - 1)) * (width - padX * 2);
        const y = padY + (1 - value(item, key) / 100) * (height - padY * 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const area = (key: "cpu" | "memory") =>
    points.length
      ? `${path(key)} L${width - padX},${height - padY} L${padX},${height - padY} Z`
      : "";

  return (
    <div>
      <svg className="pn-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="CPU and memory history">
        <defs>
          <linearGradient id="pn-cpu-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pn-accent)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--pn-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pn-mem-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pn-violet)" stopOpacity=".2" />
            <stop offset="100%" stopColor="var(--pn-violet)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((value) => {
          const y = padY + (1 - value / 100) * (height - padY * 2);
          return <line key={value} x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(255,255,255,.055)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />;
        })}
        {points.length ? (
          <>
            <path d={area("cpu")} fill="url(#pn-cpu-fill)" />
            <path d={area("memory")} fill="url(#pn-mem-fill)" />
            <path d={path("memory")} fill="none" stroke="var(--pn-violet)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <path d={path("cpu")} fill="none" stroke="var(--pn-accent)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          </>
        ) : null}
      </svg>
      {points.length ? null : (
        <div style={{ marginTop: -140, marginBottom: 120, textAlign: "center", color: "var(--pn-dim)", fontSize: 11.5 }}>
          Collecting telemetry — the live chart appears after a few samples.
        </div>
      )}
      <div className="pn-chart-legend" style={{ marginTop: 4 }}>
        <span><i style={{ background: "var(--pn-accent)" }} />Panel CPU</span>
        <span><i style={{ background: "var(--pn-violet)" }} />Panel memory</span>
        <span style={{ marginLeft: "auto" }}>{points.length} samples · 12s interval</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, lastUpdated, refetch } = useOverview();

  const spark = useMemo(() => {
    const history = data?.history || [];
    return {
      cpu: history.map((item) => item.cpu),
      memory: history.map((item) => item.memory),
      servers: history.map((item) => item.serversOnline || 0),
      nodes: history.map((item) => item.nodesOnline || 0),
    };
  }, [data]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Working late";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  if (!data && loading) {
    return (
      <div className="pn-page">
        <Skeleton height={30} width={240} />
        <div className="pn-kpis">
          {[0, 1, 2, 3].map((key) => <Skeleton key={key} height={128} radius={16} />)}
        </div>
        <Skeleton height={280} radius={20} />
        <div className="pn-dash-grid">
          <Skeleton height={260} radius={16} />
          <Skeleton height={260} radius={16} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pn-page">
        <PageHeader eyebrow="Control plane" eyebrowIcon={Activity} title="Overview" description="Live infrastructure, workload and resource visibility." />
        <Card>
          <EmptyState
            icon={CircleAlert}
            title="The overview could not be loaded"
            description={error || "The panel API did not answer. Your last known data is not shown because this view never stores invented values."}
            action={<Button tone="primary" icon={RefreshCw} onClick={() => void refetch()}>Try again</Button>}
          />
        </Card>
      </div>
    );
  }

  const staff = user?.role === "admin" || user?.role === "owner";
  const staffAlerts = data.alerts.filter((alert) => alert.severity !== "info" || !["No servers yet", "No nodes connected"].includes(alert.title));
  const topAlerts = staffAlerts.slice(0, 3);
  const panel = data.panel;
  const fleetMemoryPercent = data.fleet.memoryTotal > 0 ? (data.fleet.memoryUsed / data.fleet.memoryTotal) * 100 : 0;
  const fleetDiskPercent = data.fleet.diskTotal > 0 ? (data.fleet.diskUsed / data.fleet.diskTotal) * 100 : 0;
  const systemHealthy = data.nodes.total === 0 ? true : data.nodes.online > 0 && data.servers.offline === 0;

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Control plane · live"
        eyebrowIcon={Activity}
        title="Overview"
        description={`${greeting}, ${user?.username || "operator"}. Everything you run, measured from the panel and its nodes — never placeholder numbers.`}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void refetch()} aria-label="Refresh overview">Refresh</Button>
            <Button tone="primary" icon={Plus} onClick={() => navigate("/servers/create")}>Deploy server</Button>
          </>
        }
      />

      {data.maintenance.enabled ? (
        <div className="pn-callout pn-callout--warning" role="status">
          <ShieldCheck aria-hidden="true" />
          <span><b style={{ color: "var(--pn-text)" }}>Maintenance mode is active.</b> {data.maintenance.message || "Non-staff server actions are paused."}</span>
        </div>
      ) : null}

      {topAlerts.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>
          {topAlerts.map((alert) => (
            <Link
              key={alert.id}
              to={alert.target || "/"}
              className={`pn-callout ${alert.severity === "danger" ? "pn-callout--danger" : alert.severity === "warning" ? "pn-callout--warning" : "pn-callout--accent"}`}
              style={{ alignItems: "flex-start" }}
            >
              <CircleAlert aria-hidden="true" />
              <span>
                <b style={{ display: "block", color: "var(--pn-text)", fontSize: 12, marginBottom: 2 }}>{alert.title}</b>
                {alert.detail}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <section className="pn-dash-hero" aria-label="Fleet summary">
        <div className="pn-hero-main">
          <div className="pn-eyebrow"><span className={`pn-dot ${systemHealthy ? "is-live" : ""}`} style={{ color: systemHealthy ? "var(--pn-green)" : "var(--pn-amber)" }} /> Fleet status</div>
          <h2>
            {data.servers.total === 0
              ? <>Your first server is<br /><em>one step away.</em></>
              : <>{data.servers.online} of {data.servers.total} servers online.<br /><em>Keep building.</em></>}
          </h2>
          <p>
            {data.servers.total === 0
              ? "Connect a node, deploy a Minecraft server and manage it from a single black-glass workspace."
              : `${data.nodes.online} of ${data.nodes.total} nodes are reporting authenticated heartbeats. CPU, memory and disk are sampled live from this host.`}
          </p>
          <div className="pn-hero-actions">
            <Button tone="primary" icon={ArrowUpRight} onClick={() => navigate(data.servers.total === 0 ? "/servers/create" : "/servers")}>
              {data.servers.total === 0 ? "Create a server" : "Open fleet"}
            </Button>
            <Button tone="secondary" icon={Waypoints} onClick={() => navigate("/nodes")}>Manage nodes</Button>
            <Button tone="ghost" onClick={() => void refetch()} icon={RefreshCw}>Sync</Button>
          </div>
          <div className="pn-dim" style={{ fontSize: 10.5, marginTop: 18 }}>
            {lastUpdated ? `Last synchronized ${timeAgo(lastUpdated)}` : "Waiting for the first sync"} · host {panel.hostname} · up {uptimeLabel(panel.uptime)}
          </div>
        </div>
        <div className="pn-hero-side">
          <div className="pn-health-card">
            <div className="pn-between">
              <span className="pn-section-label">System status</span>
              <Badge tone={systemHealthy ? "online" : "warning"} dot live>{systemHealthy ? "Operational" : "Attention"}</Badge>
            </div>
            <div className="pn-health-row"><span>Panel API</span><b style={{ color: "var(--pn-green)" }}>Online</b></div>
            <div className="pn-health-row"><span>Authenticated nodes</span><b>{data.nodes.online}/{data.nodes.total}</b></div>
            <div className="pn-health-row"><span>Running workloads</span><b>{data.servers.online}/{data.servers.total}</b></div>
            <div className="pn-health-row"><span>Data sample</span><b>{timeAgo(panel.sampledAt)}</b></div>
            <div className="pn-health-row"><span>Maintenance</span><b>{data.maintenance.enabled ? "Active" : "Off"}</b></div>
          </div>
          <div className="pn-health-card">
            <span className="pn-section-label">Quick actions</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              <Button size="sm" icon={Plus} onClick={() => navigate("/servers/create")}>New server</Button>
              <Button size="sm" icon={Server} onClick={() => navigate("/servers")}>Fleet</Button>
              <Button size="sm" icon={Users} onClick={() => navigate(staff ? "/users" : "/settings")}>Users</Button>
              <Button size="sm" icon={Activity} onClick={() => navigate(staff ? "/activity" : "/settings")}>Activity</Button>
            </div>
          </div>
        </div>
      </section>

      <div className="pn-kpis">
        <Card className="pn-stat">
          <div className="pn-stat-top">
            <div><div className="pn-stat-label">Total servers</div><div className="pn-stat-value">{data.servers.total}</div><div className="pn-stat-caption">{data.servers.online} online · {data.servers.offline} offline</div></div>
            <div className="pn-stat-icon"><Server aria-hidden="true" /></div>
          </div>
          <Sparkline points={spark.servers} />
        </Card>
        <Card className="pn-stat">
          <div className="pn-stat-top">
            <div><div className="pn-stat-label">Nodes online</div><div className="pn-stat-value">{data.nodes.online}<small> / {data.nodes.total}</small></div><div className="pn-stat-caption">{data.nodes.maintenance} in maintenance</div></div>
            <div className="pn-stat-icon"><Waypoints aria-hidden="true" /></div>
          </div>
          <Sparkline points={spark.nodes} color="var(--pn-blue)" />
        </Card>
        <Card className="pn-stat">
          <div className="pn-stat-top">
            <div><div className="pn-stat-label">Panel CPU</div><div className="pn-stat-value">{formatPercent(panel.cpu, 0)}</div><div className="pn-stat-caption">{panel.cores} cores · load {panel.load[0]?.toFixed(2) ?? "—"}</div></div>
            <Ring value={panel.cpu} label="Panel CPU" size={48} />
          </div>
          <Sparkline points={spark.cpu} />
        </Card>
        <Card className="pn-stat">
          <div className="pn-stat-top">
            <div><div className="pn-stat-label">Panel memory</div><div className="pn-stat-value">{formatPercent(panel.memory.percent, 0)}</div><div className="pn-stat-caption">{formatBytes(panel.memory.used)} of {formatBytes(panel.memory.total)}</div></div>
            <Ring value={panel.memory.percent} label="Panel memory" size={48} color="var(--pn-violet)" />
          </div>
          <Sparkline points={spark.memory} color="var(--pn-violet)" />
        </Card>
      </div>

      <div className="pn-dash-grid">
        <Card className="pn-chart-card">
          <div className="pn-chart-head">
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Server activity & resource load</h3>
              <p className="pn-dim" style={{ fontSize: 11, marginTop: 4 }}>Rolling samples of the panel host and fleet state.</p>
            </div>
            <Badge tone="info" dot live>Live</Badge>
          </div>
          <TrafficChart history={data.history} />
          <div className="pn-statline" style={{ marginTop: 10 }}>
            <div><span>Fleet CPU average</span><b>{data.fleet.cpuAverage === null ? "—" : formatPercent(data.fleet.cpuAverage, 1)}</b></div>
            <div><span>Fleet memory</span><b>{data.fleet.memoryTotal > 0 ? formatPercent(fleetMemoryPercent, 0) : "—"}</b></div>
            <div><span>Fleet disk</span><b>{data.fleet.diskTotal > 0 ? formatPercent(fleetDiskPercent, 0) : "—"}</b></div>
            <div><span>Servers created · 24h</span><b>{data.servers.createdLastDay}</b></div>
          </div>
        </Card>

        <SectionCard
          title="Node health"
          description="Heartbeat-derived status and current resource pressure."
          action={<Link to="/nodes" className="pn-link-btn">Manage <ArrowUpRight size={12} aria-hidden="true" /></Link>}
          bodyClassName=""
        >
          {data.nodeHealth.length === 0 ? (
            <EmptyState icon={Waypoints} title="No nodes registered" description="Create a node and run its one-time registration command to bring it online." action={<Button size="sm" tone="primary" icon={Plus} onClick={() => navigate("/nodes")}>Create node</Button>} />
          ) : (
            <div className="pn-node-health">
              {data.nodeHealth.slice(0, 5).map((node) => (
                <div key={node.id} className="pn-node-health-row">
                  <span className="pn-dot" style={{ color: node.status === "ONLINE" ? "var(--pn-green)" : node.status === "MAINTENANCE" ? "var(--pn-amber)" : "var(--pn-rose)" }} aria-hidden="true" />
                  <div className="pn-node-health-copy">
                    <b>{node.name}</b>
                    <span>{statusLabel(node.status)} · {node.servers ? `${node.servers.running}/${node.servers.total} servers` : "no workload data"} · {node.isLocal ? "local runtime" : timeAgo(node.lastHeartbeat)}</span>
                  </div>
                  <div className="pn-node-bars" title={`CPU ${node.cpu ?? "—"}% · memory ${node.memoryTotal ? Math.round((node.memoryUsed / node.memoryTotal) * 100) : 0}%`}>
                    <Meter value={node.cpu ?? 0} />
                    <Meter value={node.memoryTotal ? (node.memoryUsed / node.memoryTotal) * 100 : 0} tone="info" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="pn-dash-grid">
        <SectionCard
          title="Recent servers"
          description={staff ? "Latest deployments across the fleet." : "Your most recently created servers."}
          action={<Link to="/servers" className="pn-link-btn">All servers <ArrowUpRight size={12} aria-hidden="true" /></Link>}
          bodyClassName=""
        >
          {data.recentServers.length === 0 ? (
            <EmptyState icon={Server} title="No servers yet" description="Deploy a server to see its live status here." action={<Button size="sm" tone="primary" icon={Plus} onClick={() => navigate("/servers/create")}>Deploy</Button>} />
          ) : (
            <div className="pn-recent-grid">
              {data.recentServers.map((server) => (
                <Link key={server.id} to={`/servers/${server.id}`} className="pn-mini-server">
                  <div className="pn-mini-server-top">
                    <h4>{server.name}</h4>
                    <Badge tone={statusTone(server.status)} dot>{statusLabel(server.status)}</Badge>
                  </div>
                  <p>{server.type || "server"}{server.version ? ` ${server.version}` : ""}</p>
                  <div className="pn-mini-server-meta">
                    <span>{server.nodeName}</span>
                    <span>{timeAgo(server.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          description="Audit-backed events from panel and node operations."
          action={<Link to={staff ? "/activity" : "/settings"} className="pn-link-btn">History <ArrowUpRight size={12} aria-hidden="true" /></Link>}
          bodyClassName=""
        >
          {data.activity.length === 0 ? (
            <EmptyState icon={Activity} title="No recorded activity" description="Node, server and account operations will appear here as they happen." />
          ) : (
            <div className="pn-activity-list">
              {data.activity.slice(0, 5).map((entry) => (
                <div key={entry.id} className="pn-activity-item">
                  <span className="pn-activity-mark"><Activity aria-hidden="true" /></span>
                  <div className="pn-activity-copy"><b>{entry.label}</b><span>{timeAgo(entry.at)} · {entry.actorId || "system"}</span></div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Resource usage"
        description="Measured on the panel host and reported by connected node agents."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          {[
            { label: "CPU", value: panel.cpu, detail: `${panel.cores} logical cores · load ${panel.load.join(" / ")}`, icon: Cpu },
            { label: "Memory", value: panel.memory.percent, detail: `${formatBytes(panel.memory.used)} of ${formatBytes(panel.memory.total)}`, icon: MemoryStick },
            { label: "Disk", value: panel.disk?.percent ?? 0, detail: panel.disk ? `${formatBytes(panel.disk.used)} of ${formatBytes(panel.disk.total)}` : "Unavailable on this platform", icon: HardDrive },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={{ padding: 14, borderRadius: 11, border: "1px solid var(--pn-line)", background: "#050506" }}>
                <div className="pn-between" style={{ marginBottom: 10 }}>
                  <span className="pn-eyebrow" style={{ letterSpacing: ".12em" }}><Icon style={{ width: 12, height: 12 }} aria-hidden="true" /> {item.label}</span>
                  <b style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{formatPercent(item.value, 0)}</b>
                </div>
                <Meter value={item.value} />
                <div className="pn-dim" style={{ fontSize: 10.5, marginTop: 9 }}>{item.detail}</div>
              </div>
            );
          })}
          <div style={{ padding: 14, borderRadius: 11, border: "1px solid var(--pn-line)", background: "#050506" }}>
            <div className="pn-between" style={{ marginBottom: 10 }}>
              <span className="pn-eyebrow" style={{ letterSpacing: ".12em" }}><Network style={{ width: 12, height: 12 }} aria-hidden="true" /> Network</span>
              <Badge tone={panel.network.available ? "online" : "offline"} dot>{panel.network.available ? "Live" : "N/A"}</Badge>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
              <div><div className="pn-dim" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase" }}>Received</div><b style={{ fontFamily: "var(--pn-mono)", fontSize: 12.5 }}>{formatBytes(data.fleet.network.rxBytes)}</b></div>
              <div><div className="pn-dim" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase" }}>Sent</div><b style={{ fontFamily: "var(--pn-mono)", fontSize: 12.5 }}>{formatBytes(data.fleet.network.txBytes)}</b></div>
            </div>
            <div className="pn-dim" style={{ fontSize: 10.5, marginTop: 9 }}>
              {panel.network.available ? `↓ ${formatBytes(panel.network.rxPerSecond)}/s · ↑ ${formatBytes(panel.network.txPerSecond)}/s` : "Traffic counters unavailable"}
            </div>
          </div>
        </div>
        <div className="pn-between" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--pn-line)" }}>
          <span className="pn-quiet"><Zap size={12} aria-hidden="true" /> Active users: <b>{data.users.total ?? "scoped"}</b> · admins <b>{data.users.admins ?? "—"}</b></span>
          <span className="pn-quiet">{staff ? "Full fleet visibility" : "Showing only resources you can access"}</span>
        </div>
      </SectionCard>
    </div>
  );
}
