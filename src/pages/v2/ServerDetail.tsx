import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  Activity,
  Archive,
  ArrowLeft,
  Box,
  Check,
  Copy,
  Cpu,
  Folder,
  Globe,
  HardDrive,
  Layers,
  Lock,
  MemoryStick,
  Network,
  OctagonX,
  PackageOpen,
  Play,
  Puzzle,
  RefreshCw,
  RotateCw,
  Server,
  Settings,
  Sliders,
  Square,
  Terminal,
  Trash2,
  Unlock,
  Users,
  Waypoints,
  Zap,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import {
  Badge,
  Button,
  Card,
  Meter,
  Modal,
  SectionCard,
  Skeleton,
  formatBytes,
  formatPercent,
  statusLabel,
  statusTone,
  timeAgo,
  uptimeLabel,
  useConfirm,
  useToast,
} from "../../components/ui";
import ServerConsole from "../../components/ServerConsole";
import FileManager from "../../components/FileManager";
import ServerSettings from "../../components/ServerSettings";
import ServerProperties from "../../components/ServerProperties";
import ServerBackups from "../../components/ServerBackups";
import PluginManager from "../../components/PluginManager";
import ModManager from "../../components/ModManager";
import ModpackManager from "../../components/ModpackManager";
import SubUsersManager from "../../components/SubUsersManager";
import ServerSFTP from "../../components/ServerSFTP";
import ServerPlayers from "../../components/ServerPlayers";
import PlayitTunnel from "../PlayitTunnel";

type Tab = { id: string; label: string; icon: React.ElementType };

const errorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data;
  return [data?.error, data?.details, data?.hint].filter(Boolean).join(" — ") || error?.message || fallback;
};

export default function ServerDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enablePlayit } = useSettings() as any;
  const toast = useToast();
  const confirm = useConfirm();
  const staff = user?.role === "admin" || user?.role === "owner";

  const [server, setServer] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsError, setStatsError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const tabId = useMemo(() => {
    const match = location.pathname.match(/^\/servers\/[^/]+\/?([^/]*)/);
    const segment = match?.[1] || "";
    return segment === "" ? "console" : segment === "backup" ? "backup" : segment;
  }, [location.pathname]);

  const load = useCallback(async () => {
    try {
      const response = await axios.get(`/api/servers/${id}`, { timeout: 15000 });
      setServer(response.data);
      setLoadError("");
    } catch (requestError: any) {
      setLoadError(errorMessage(requestError, "The server could not be loaded."));
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const response = await axios.get(`/api/servers/${id}/stats`, { timeout: 12000 });
        if (active) { setStats(response.data); setStatsError(""); }
      } catch (requestError: any) {
        if (active) setStatsError(errorMessage(requestError, "Live statistics are unavailable."));
      }
    };
    void fetchStats();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void fetchStats(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [id]);

  const action = async (verb: string, label: string) => {
    setBusy(verb);
    try {
      await axios.post(`/api/servers/${id}/${verb}`);
      toast.success(`${label} requested`, `${server?.name || "Server"} is applying the command.`);
      await load();
    } catch (requestError: any) {
      toast.error(`${label} failed`, errorMessage(requestError, "The node did not accept the command."));
    } finally {
      setBusy(null);
    }
  };

  const suspend = async () => {
    const suspending = !server.suspended;
    const approved = await confirm({
      title: `${suspending ? "Suspend" : "Unsuspend"} ${server.name}?`,
      description: suspending ? "The server stops and its owner loses access until unsuspended." : "The owner regains access. Start the server when ready.",
      confirmLabel: suspending ? "Suspend server" : "Unsuspend server",
      tone: suspending ? "danger" : "primary",
    });
    if (!approved) return;
    try {
      await axios.put(`/api/servers/${id}/suspend`, { suspendDuration: suspending ? "permanent" : null });
      toast.success(suspending ? "Server suspended" : "Server unsuspended");
      await load();
    } catch (requestError: any) {
      toast.error("Suspension failed", errorMessage(requestError, "Try again."));
    }
  };

  const remove = async () => {
    try {
      await axios.delete(`/api/servers/${id}`);
      toast.success("Server deleted");
      navigate("/servers");
    } catch (requestError: any) {
      toast.error("Delete failed", errorMessage(requestError, "The server could not be deleted."));
    }
  };

  const copyAddress = async () => {
    if (!server) return;
    const address = server.ipAlias ? `${server.ipAlias}:${server.port}` : `${window.location.hostname}:${server.port}`;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  if (loadError && !server) {
    return (
      <div className="pn-sd-inner">
        <div className="pn-callout pn-callout--danger" role="alert"><Lock aria-hidden="true" /><span>{loadError}</span></div>
        <Link to="/servers" className="pn-btn pn-btn--secondary" style={{ marginTop: 12 }}><ArrowLeft size={14} aria-hidden="true" /> Back to fleet</Link>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="pn-sd-inner" style={{ display: "grid", gap: 14 }}>
        <Skeleton height={40} width={280} />
        <Skeleton height={70} radius={14} />
        <Skeleton height={320} radius={14} />
      </div>
    );
  }

  if (server.suspended) {
    return (
      <div className="pn-sd-inner" style={{ maxWidth: 560, margin: "8vh auto" }}>
        <Card className="pn-card--pad" style={{ textAlign: "center" }}>
          <div className="pn-empty-icon" style={{ margin: "0 auto 14px", color: "var(--pn-amber)" }}><Lock aria-hidden="true" /></div>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Server suspended</h2>
          <p className="pn-dim" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
            An administrator suspended this server. Access and management controls are locked until the suspension is removed.
          </p>
          <div className="pn-row" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link to="/servers" className="pn-btn pn-btn--secondary"><ArrowLeft size={14} aria-hidden="true" /> Back to fleet</Link>
            {staff ? <Button tone="primary" icon={Unlock} onClick={() => void suspend()}>Unsuspend</Button> : null}
          </div>
        </Card>
      </div>
    );
  }

  const type = String(server.type || "").toUpperCase();
  const isProxy = ["VELOCITY", "BUNGEECORD", "WATERFALL"].includes(type);
  const hasPlugins = !isProxy && !["VANILLA", "FABRIC", "FORGE", "NEOFORGE"].includes(type);
  const hasMods = ["FORGE", "FABRIC", "NEOFORGE"].includes(type);

  const tabs: Tab[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "console", label: "Console", icon: Terminal },
    { id: "players", label: "Players", icon: Users },
    { id: "files", label: "Files", icon: Folder },
    { id: "backup", label: "Backups", icon: Archive },
    ...(isProxy ? [] : [{ id: "properties", label: "Properties", icon: Sliders } as Tab]),
    ...(hasPlugins ? [{ id: "plugins", label: "Plugins", icon: Puzzle } as Tab] : []),
    ...(hasMods ? [{ id: "mods", label: "Mods", icon: Box } as Tab] : []),
    ...(isProxy ? [] : [{ id: "modpacks", label: "Modpacks", icon: PackageOpen } as Tab]),
    { id: "settings", label: "Settings", icon: Settings },
    { id: "sftp", label: "SFTP", icon: Network },
    { id: "subusers", label: "Sub-users", icon: Users },
    ...(enablePlayit ? [{ id: "playit", label: "Playit", icon: Globe } as Tab] : []),
  ];

  const online = server.status === "online";
  const maintenance = String(server.status).toLowerCase() === "maintenance";
  const base = `/servers/${id}`;
  const go = (tab: string) => navigate(tab === "console" ? base : `${base}/${tab}`);

  const ramUsedMb = Number(stats?.ram);
  const ramLimitMb = Number(stats?.limitRam ?? (Number(server.ram) || 0) * 1024);
  const cpuValue = Number(stats?.cpu);
  const cpuLimit = Number(stats?.limitCpu ?? server.cpu ?? 0);
  const diskUsed = Number(stats?.disk?.used);
  const diskLimit = Number(stats?.limitDiskBytes ?? (Number(server.disk) || 0) * 1024 ** 3);
  const statsAvailable = stats?.available !== false;

  return (
    <div className="pn-server-detail">
      <header className="pn-sd-head">
        <div className="pn-sd-title">
          <Link to="/servers" className="pn-icon-btn" aria-label="Back to servers"><ArrowLeft aria-hidden="true" /></Link>
          <div className="pn-server-glyph" style={{ width: 38, height: 38, flexBasis: 38 }}><Server aria-hidden="true" /></div>
          <div style={{ minWidth: 0 }}>
            <h1>{server.name}</h1>
            <div className="pn-sd-meta">
              <Badge tone={statusTone(server.status)} dot live={online}>{statusLabel(server.status)}</Badge>
              <span>{type || "server"}{server.version ? ` ${server.version}` : ""}</span>
              <span>Node <b>{server.nodeName || "local"}</b></span>
              <button type="button" className="pn-link-btn" onClick={() => void copyAddress()} style={{ fontFamily: "var(--pn-mono)" }}>
                {server.ipAlias ? `${server.ipAlias}:${server.port}` : `port ${server.port}`}
                {copied ? <Check size={12} aria-hidden="true" style={{ color: "var(--pn-green)" }} /> : <Copy size={12} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="pn-sd-actions">
            {online ? (
              <>
                <Button tone="secondary" icon={RotateCw} loading={busy === "restart"} disabled={maintenance} onClick={() => void action("restart", "Restart")}>Restart</Button>
                <Button tone="danger" icon={Square} loading={busy === "stop"} onClick={() => void action("stop", "Stop")}>Stop</Button>
              </>
            ) : (
              <Button tone="primary" icon={Play} loading={busy === "start"} disabled={maintenance} onClick={() => void action("start", "Start")}>Start</Button>
            )}
            {staff ? (
              <>
                <Button tone="ghost" icon={OctagonX} loading={busy === "kill"} onClick={() => void confirm({ title: `Kill ${server.name}?`, description: "The container is force-stopped without saving. Use Stop for a graceful shutdown.", confirmLabel: "Kill server", tone: "danger" }).then((ok) => { if (ok) void action("kill", "Kill"); })}>Kill</Button>
                <Button tone="ghost" icon={server.suspended ? Unlock : Lock} onClick={() => void suspend()}>{server.suspended ? "Unsuspend" : "Suspend"}</Button>
                <Button tone="ghost" icon={Trash2} onClick={() => setDeleteOpen(true)} aria-label="Delete server" />
              </>
            ) : null}
          </div>
        </div>
        <nav className="pn-tabs pn-sd-tabs" aria-label="Server sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} type="button" className={tabId === tab.id ? "is-active" : ""} onClick={() => go(tab.id)} aria-current={tabId === tab.id ? "page" : undefined}>
                <Icon aria-hidden="true" /> {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="pn-sd-body">
        {maintenance ? <div className="pn-callout pn-callout--warning" style={{ margin: "14px 26px 0" }}><Waypoints aria-hidden="true" /><span>The node is in maintenance mode. Start, restart and kill are paused; files and settings remain available.</span></div> : null}
        {server.nodeUnavailable ? <div className="pn-callout pn-callout--danger" style={{ margin: "14px 26px 0" }}><Lock aria-hidden="true" /><span>The node is unreachable. Last known state is shown; actions may fail until connectivity returns.</span></div> : null}

        {tabId === "overview" ? (
          <div className="pn-sd-inner">
            <div className="pn-overview-grid">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <SectionCard title="Live resources" description={statsAvailable ? "Reported by the container runtime on this server's node." : statsError || "The container is not running, so live statistics are unavailable."} action={<Badge tone={statsAvailable ? "online" : "offline"} dot live={statsAvailable}>{statsAvailable ? "Live" : "Idle"}</Badge>}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                    {[
                      { label: "CPU", icon: Cpu, value: Number.isFinite(cpuValue) ? formatPercent(cpuValue) : "—", meter: Number.isFinite(cpuValue) && cpuLimit > 0 ? Math.min(100, (cpuValue / cpuLimit) * 100) : 0, detail: `limit ${cpuLimit || "—"}%` },
                      { label: "Memory", icon: MemoryStick, value: Number.isFinite(ramUsedMb) && ramUsedMb >= 0 ? `${ramUsedMb.toFixed(0)} MB` : "—", meter: ramLimitMb > 0 && Number.isFinite(ramUsedMb) ? Math.min(100, (ramUsedMb / ramLimitMb) * 100) : 0, detail: `limit ${(ramLimitMb / 1024).toFixed(1)} GB` },
                      { label: "Disk", icon: HardDrive, value: Number.isFinite(diskUsed) && diskUsed >= 0 ? formatBytes(diskUsed) : "—", meter: diskLimit > 0 && Number.isFinite(diskUsed) ? Math.min(100, (diskUsed / diskLimit) * 100) : 0, detail: `limit ${formatBytes(diskLimit)}` },
                      { label: "Network", icon: Network, value: stats?.networkRxBytes != null ? formatBytes(Number(stats.networkRxBytes)) : "—", meter: 0, detail: stats?.networkTxBytes != null ? `↑ ${formatBytes(Number(stats.networkTxBytes))}` : "traffic unavailable" },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} style={{ padding: 13, borderRadius: 10, border: "1px solid var(--pn-line)", background: "#050506" }}>
                          <div className="pn-between" style={{ marginBottom: 8 }}>
                            <span className="pn-eyebrow" style={{ letterSpacing: ".12em", fontSize: 9 }}><Icon style={{ width: 11, height: 11 }} aria-hidden="true" /> {item.label}</span>
                          </div>
                          <b style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{item.value}</b>
                          <div className="pn-dim" style={{ fontSize: 10, marginTop: 3 }}>{item.detail}</div>
                          {item.label !== "Network" ? <Meter value={item.meter} /> : null}
                        </div>
                      );
                    })}
                  </div>
                  {stats?.timestamp ? <div className="pn-dim" style={{ fontSize: 10, marginTop: 11 }}>Sample received {timeAgo(Number(stats.timestamp) < 1e12 ? Number(stats.timestamp) : new Date(Number(stats.timestamp)).toISOString())}</div> : null}
                </SectionCard>

                <SectionCard title="Server configuration" description="Stored in the panel database and enforced by the node.">
                  <div className="pn-kv">
                    <div className="pn-kv-row"><span>Software</span><b>{type || "—"} {server.version || ""}</b></div>
                    <div className="pn-kv-row"><span>Node</span><b>{server.nodeName || "—"}</b></div>
                    <div className="pn-kv-row"><span>Owner</span><b>{server.ownerUsername || server.owner || "—"}</b></div>
                    <div className="pn-kv-row"><span>Container</span><b>{server.containerId ? String(server.containerId).slice(0, 16) : "not created"}</b></div>
                    <div className="pn-kv-row"><span>Java</span><b>{server.javaVersion ? `Java ${server.javaVersion}` : "auto"}</b></div>
                    <div className="pn-kv-row"><span>Created</span><b>{server.createdAt ? new Date(server.createdAt).toLocaleString() : "—"}</b></div>
                    <div className="pn-kv-row"><span>Lifetime</span><b>{server.expiresAt ? `until ${new Date(server.expiresAt).toLocaleDateString()}` : "permanent"}</b></div>
                  </div>
                </SectionCard>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <SectionCard title="Status" description="This server's identity and connection details.">
                  <div className="pn-kv">
                    <div className="pn-kv-row"><span>State</span><b>{statusLabel(server.status)}</b></div>
                    <div className="pn-kv-row"><span>Node status</span><b>{statusLabel(server.nodeStatus || "UNKNOWN")}</b></div>
                    <div className="pn-kv-row"><span>Address</span><b>{server.ipAlias ? `${server.ipAlias}:${server.port}` : `port ${server.port}`}</b></div>
                    <div className="pn-kv-row"><span>Players</span><b>{server.playersOnline ?? "—"} / {server.playersMax ?? "—"}</b></div>
                    <div className="pn-kv-row"><span>Allocation</span><b>{server.ram} GB · {server.cpu}% · {server.disk} GB</b></div>
                  </div>
                </SectionCard>
                <SectionCard title="Quick actions" description="Jump to the tools you use most.">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <Button size="sm" icon={Terminal} onClick={() => go("console")}>Console</Button>
                    <Button size="sm" icon={Folder} onClick={() => go("files")}>Files</Button>
                    <Button size="sm" icon={Archive} onClick={() => go("backup")}>Backups</Button>
                    <Button size="sm" icon={Settings} onClick={() => go("settings")}>Settings</Button>
                  </div>
                </SectionCard>
                <SectionCard title="Connection">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="pn-command" style={{ fontSize: 10.5 }}>
                      {server.ipAlias ? `${server.ipAlias}:${server.port}` : `port ${server.port}`}
                      <span className="pn-copy"><Copy size={13} aria-hidden="true" onClick={() => void copyAddress()} /></span>
                    </div>
                    <span className="pn-dim" style={{ fontSize: 10.5 }}>Share this address with players. Ports are allocated per node.</span>
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        ) : null}

        {tabId === "console" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ServerConsole key={id} serverId={id} server={server} /></div> : null}
        {tabId === "files" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><FileManager key={id} serverId={id} /></div> : null}
        {tabId === "backup" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ServerBackups serverId={id} /></div> : null}
        {tabId === "plugins" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><PluginManager serverId={id} /></div> : null}
        {tabId === "mods" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ModManager serverId={id} /></div> : null}
        {tabId === "modpacks" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ModpackManager serverId={id} /></div> : null}
        {tabId === "players" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ServerPlayers serverId={id} /></div> : null}
        {tabId === "properties" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ServerProperties serverId={id} /></div> : null}
        {tabId === "settings" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ServerSettings serverId={id} server={server} /></div> : null}
        {tabId === "sftp" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><ServerSFTP serverId={id} server={server} /></div> : null}
        {tabId === "subusers" ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><SubUsersManager serverId={id} /></div> : null}
        {tabId === "playit" && enablePlayit ? <div className="pn-sd-inner" style={{ paddingTop: 16 }}><PlayitTunnel serverId={id} /></div> : null}
        {!tabs.some((tab) => tab.id === tabId) ? (
          <div className="pn-sd-inner" style={{ paddingTop: 16 }}>
            <Card><div className="pn-empty"><Layers size={22} aria-hidden="true" /><h3>Unknown section</h3><p>Choose a section from the server navigation above.</p><Button onClick={() => go("overview")}>Open overview</Button></div></Card>
          </div>
        ) : null}
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${server.name}?`}
        description="The container, server files and managed backups are removed. This cannot be undone."
        size="sm"
        footer={<><Button tone="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button tone="danger" icon={Trash2} onClick={() => void remove()}>Delete permanently</Button></>}
      >
        <div className="pn-modal-body">
          <div className="pn-callout pn-callout--danger"><Trash2 aria-hidden="true" /><span>Type-safe confirmation is enforced by your intent here, not by a fake progress screen. The API performs the real deletion on the node.</span></div>
        </div>
      </Modal>
    </div>
  );
}
