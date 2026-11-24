import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cloud,
  Cpu,
  Gauge,
  HardDrive,
  KeyRound,
  MemoryStick,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Waypoints,
} from "lucide-react";
import { useOverview } from "../../hooks/useOverview";
import {
  Badge,
  Button,
  Card,
  Meter,
  PageHeader,
  SectionCard,
  Skeleton,
  formatBytes,
  formatPercent,
  statusLabel,
  timeAgo,
  uptimeLabel,
  useToast,
} from "../../components/ui";

const MODULES = [
  { to: "/users", title: "Users & access", description: "Create accounts, assign roles and reset passwords.", icon: Users },
  { to: "/nodes", title: "Node infrastructure", description: "Register VPS agents, rotate tokens and inspect health.", icon: Waypoints },
  { to: "/servers", title: "Server fleet", description: "Manage every workload, suspend or delete servers.", icon: Server },
  { to: "/allocations", title: "Network allocations", description: "Assign IPs and ports per node.", icon: SlidersHorizontal },
  { to: "/api-keys", title: "API keys", description: "Scoped programmatic access with expiry control.", icon: KeyRound },
  { to: "/activity", title: "Audit trail", description: "Review account, node and server events.", icon: Activity },
  { to: "/settings", title: "Panel settings", description: "Maintenance, appearance, defaults and alerts.", icon: Settings },
  { to: "/cloudflare", title: "Cloudflare DNS", description: "Manage zones and create node records.", icon: Cloud },
];

export default function AdminPage() {
  const { data, loading, error, refetch, lastUpdated } = useOverview(20000);
  const toast = useToast();
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    axios.get("/api/system/settings", { timeout: 12000 }).then((response) => setSettings(response.data)).catch(() => setSettings(null));
  }, []);

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Owner & admin"
        eyebrowIcon={ShieldCheck}
        title="Control center"
        description="One place to see the whole platform: identities, nodes, workloads, audit events and security posture."
        actions={<Button icon={RefreshCw} loading={loading} onClick={() => { void refetch(); toast.info("Refreshing control center"); }}>Refresh</Button>}
      />

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      {!data && loading ? (
        <div className="pn-kpis">{[0, 1, 2, 3].map((key) => <Skeleton key={key} height={120} radius={16} />)}</div>
      ) : data ? (
        <>
          <div className="pn-kpis">
            <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Accounts</div><div className="pn-stat-value">{data.users.total ?? "—"}</div><div className="pn-stat-caption">{data.users.admins ?? 0} with admin access</div></div><div className="pn-stat-icon"><Users aria-hidden="true" /></div></div></Card>
            <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Nodes</div><div className="pn-stat-value">{data.nodes.online}<small> / {data.nodes.total}</small></div><div className="pn-stat-caption">{data.nodes.maintenance} in maintenance</div></div><div className="pn-stat-icon"><Waypoints aria-hidden="true" /></div></div></Card>
            <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Servers</div><div className="pn-stat-value">{data.servers.total}</div><div className="pn-stat-caption">{data.servers.online} online · {data.servers.suspended} suspended</div></div><div className="pn-stat-icon"><Server aria-hidden="true" /></div></div></Card>
            <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Active alerts</div><div className="pn-stat-value">{data.alerts.length}</div><div className="pn-stat-caption">{data.alerts.filter((alert) => alert.severity === "danger").length} critical signals</div></div><div className="pn-stat-icon"><Gauge aria-hidden="true" /></div></div></Card>
          </div>

          <div className="pn-dash-grid">
            <SectionCard title="Platform modules" description="Every module writes to the same audited backend." bodyClassName="">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, padding: 16 }}>
                {MODULES.map((module) => {
                  const Icon = module.icon;
                  return (
                    <Link key={module.to} to={module.to} className="pn-mini-server" style={{ gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className="pn-stat-icon" style={{ width: 28, height: 28 }}><Icon size={14} aria-hidden="true" /></span>
                        <h4>{module.title}</h4>
                      </div>
                      <p style={{ fontFamily: "var(--pn-sans)", color: "var(--pn-dim)", fontSize: 10.5, lineHeight: 1.5 }}>{module.description}</p>
                    </Link>
                  );
                })}
              </div>
            </SectionCard>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionCard title="System facts" description="Measured on the panel host." action={<Badge tone="online" dot live>Live</Badge>}>
                <div className="pn-kv">
                  <div className="pn-kv-row"><span>Hostname</span><b>{data.panel.hostname}</b></div>
                  <div className="pn-kv-row"><span>Platform</span><b>{data.panel.platform}</b></div>
                  <div className="pn-kv-row"><span>Cores</span><b>{data.panel.cores}</b></div>
                  <div className="pn-kv-row"><span>Uptime</span><b>{uptimeLabel(data.panel.uptime)}</b></div>
                  <div className="pn-kv-row"><span>Last sample</span><b>{timeAgo(data.panel.sampledAt)}</b></div>
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  <div><div className="pn-between" style={{ fontSize: 10.5, marginBottom: 5 }}><span className="pn-dim">CPU</span><b>{formatPercent(data.panel.cpu)}</b></div><Meter value={data.panel.cpu} /></div>
                  <div><div className="pn-between" style={{ fontSize: 10.5, marginBottom: 5 }}><span className="pn-dim">Memory</span><b>{formatPercent(data.panel.memory.percent)} · {formatBytes(data.panel.memory.used)}</b></div><Meter value={data.panel.memory.percent} tone="info" /></div>
                  {data.panel.disk ? <div><div className="pn-between" style={{ fontSize: 10.5, marginBottom: 5 }}><span className="pn-dim">Disk</span><b>{formatPercent(data.panel.disk.percent)}</b></div><Meter value={data.panel.disk.percent} tone="warn" /></div> : null}
                </div>
              </SectionCard>

              <SectionCard title="Security posture" description="Configuration that affects every account.">
                <div className="pn-kv">
                  <div className="pn-kv-row"><span>Maintenance mode</span><b>{data.maintenance.enabled ? "Active" : "Off"}</b></div>
                  <div className="pn-kv-row"><span>Public registration</span><b>{settings?.enableRegistration === false ? "Disabled" : "Enabled"}</b></div>
                  <div className="pn-kv-row"><span>Session signing</span><b>HS256 · server secret</b></div>
                  <div className="pn-kv-row"><span>Password storage</span><b>bcrypt</b></div>
                  <div className="pn-kv-row"><span>Node credentials</span><b>AES-256-GCM + SHA-256</b></div>
                </div>
                <div className="pn-callout pn-callout--accent" style={{ marginTop: 12 }}><ShieldCheck aria-hidden="true" /><span>Registration tokens are single-use, expire in 15 minutes and are stored as hashes only. Keys and tokens never appear in audit metadata.</span></div>
              </SectionCard>
            </div>
          </div>

          <SectionCard title="Recent audit events" description="The newest platform actions." action={<Link to="/activity" className="pn-link-btn">Open audit trail</Link>} bodyClassName="">
            {data.activity.length === 0 ? (
              <div className="pn-empty" style={{ padding: 28 }}><Activity size={20} style={{ color: "var(--pn-dim)" }} /><span className="pn-dim" style={{ fontSize: 12 }}>No recorded events yet.</span></div>
            ) : (
              <div className="pn-table-wrap">
                <table className="pn-table">
                  <thead><tr><th>Event</th><th>Actor</th><th>When</th></tr></thead>
                  <tbody>
                    {data.activity.map((entry) => (
                      <tr key={entry.id}><td><strong>{entry.label}</strong></td><td>{entry.actorId || "system"}</td><td className="num">{timeAgo(entry.at)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <div className="pn-between" style={{ fontSize: 10.5 }}>
            <span className="pn-quiet"><Boxes size={11} aria-hidden="true" /> {data.fleet.cpuAverage === null ? "Fleet CPU unavailable" : `Fleet CPU average ${formatPercent(data.fleet.cpuAverage)}`} · {lastUpdated ? `synced ${timeAgo(lastUpdated)}` : "not synced"}</span>
            <span className="pn-quiet"><MemoryStick size={11} aria-hidden="true" /> {formatBytes(data.fleet.memoryUsed)} memory · <HardDrive size={11} aria-hidden="true" /> {formatBytes(data.fleet.diskUsed)} disk allocated</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
