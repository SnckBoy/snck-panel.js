import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  ArrowUpRight,
  Cpu,
  Globe,
  MemoryStick,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Server,
  Square,
  Terminal,
  Trash2,
  Lock,
  Unlock,
  OctagonX,
  Search,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Meter,
  PageHeader,
  SearchInput,
  Segmented,
  Skeleton,
  statusLabel,
  statusTone,
  timeAgo,
  useConfirm,
  useToast,
} from "../../components/ui";

type ServerRecord = Record<string, any>;

const errorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data;
  return [data?.error, data?.details, data?.hint].filter(Boolean).join(" — ") || error?.message || fallback;
};

export default function ServersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const staff = user?.role === "admin" || user?.role === "owner";
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "suspended">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await axios.get("/api/servers", { timeout: 20000 });
      setServers(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (requestError: any) {
      setError(errorMessage(requestError, "The fleet could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 12000);
    return () => window.clearInterval(timer);
  }, [load]);

  const action = async (server: ServerRecord, verb: string, label: string) => {
    setBusy(`${server.id}:${verb}`);
    try {
      await axios.post(`/api/servers/${server.id}/${verb}`);
      toast.success(`${label} requested`, `${server.name} is applying the command.`);
      await load(true);
    } catch (requestError: any) {
      toast.error(`${label} failed`, errorMessage(requestError, "The node did not accept the command."));
    } finally {
      setBusy(null);
    }
  };

  const suspend = async (server: ServerRecord) => {
    const suspending = !server.suspended;
    const approved = await confirm({
      title: `${suspending ? "Suspend" : "Unsuspend"} ${server.name}?`,
      description: suspending
        ? "The server is stopped and its owner loses access until an administrator unsuspends it."
        : "The owner regains access. The server stays stopped until it is started.",
      confirmLabel: suspending ? "Suspend server" : "Unsuspend server",
      tone: suspending ? "danger" : "primary",
    });
    if (!approved) return;
    setBusy(`${server.id}:suspend`);
    try {
      await axios.put(`/api/servers/${server.id}/suspend`, { suspendDuration: suspending ? "permanent" : null });
      toast.success(suspending ? "Server suspended" : "Server unsuspended", server.name);
      await load(true);
    } catch (requestError: any) {
      toast.error("Suspension change failed", errorMessage(requestError, "Try again."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (server: ServerRecord) => {
    const approved = await confirm({
      title: `Delete ${server.name}?`,
      description: "The container, its files and backups managed by the node are removed. This cannot be undone.",
      confirmLabel: "Delete server permanently",
      tone: "danger",
    });
    if (!approved) return;
    setBusy(`${server.id}:delete`);
    try {
      await axios.delete(`/api/servers/${server.id}`);
      toast.success("Server deleted", `${server.name} has been removed.`);
      await load(true);
    } catch (requestError: any) {
      toast.error("Delete failed", errorMessage(requestError, "The server could not be deleted."));
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(
    () =>
      servers.filter((server) => {
        const matches = `${server.name} ${server.id} ${server.nodeName} ${server.type} ${server.version} ${server.ownerUsername}`.toLowerCase().includes(query.toLowerCase());
        const status = String(server.status || "").toLowerCase();
        const matchesFilter =
          filter === "all" ||
          (filter === "online" && status === "online") ||
          (filter === "offline" && status !== "online" && !server.suspended) ||
          (filter === "suspended" && Boolean(server.suspended));
        return matches && matchesFilter;
      }),
    [servers, query, filter],
  );

  const counts = useMemo(
    () => ({
      online: servers.filter((server) => server.status === "online").length,
      suspended: servers.filter((server) => server.suspended).length,
    }),
    [servers],
  );

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Fleet"
        eyebrowIcon={Server}
        title="Servers"
        description={staff ? "Every workload across every node, with real lifecycle controls and no simulated state." : "Your game servers and the resources assigned to them."}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button>
            <Button tone="primary" icon={Plus} onClick={() => navigate("/servers/create")}>Deploy server</Button>
          </>
        }
      />

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      <div className="pn-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, node, software or owner…" />
        <Segmented
          value={filter}
          onChange={setFilter}
          label="Filter servers"
          options={[
            { value: "all", label: `All ${servers.length}` },
            { value: "online", label: `Online ${counts.online}` },
            { value: "offline", label: "Offline" },
            { value: "suspended", label: `Suspended ${counts.suspended}` },
          ]}
        />
      </div>

      {loading && servers.length === 0 ? (
        <div className="pn-servers-grid">{[0, 1, 2].map((key) => <Skeleton key={key} height={250} radius={16} />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={servers.length ? Search : Server}
            title={servers.length ? "No servers match this view" : "Your fleet is empty"}
            description={
              servers.length
                ? "Try another search term or status filter."
                : staff
                  ? "Deploy the first Minecraft server. You can choose Paper, Fabric, Forge, NeoForge, Folia, proxies and more."
                  : "Ask an administrator to enable free servers or assign a server to your account."
            }
            action={!servers.length ? <Button tone="primary" icon={Plus} onClick={() => navigate("/servers/create")}>Deploy a server</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="pn-servers-grid">
          {filtered.map((server) => {
            const online = server.status === "online";
            const maintenance = String(server.status).toLowerCase() === "maintenance";
            const busyHere = busy?.startsWith(`${server.id}:`);
            const ramLimit = Number(server.ram || 0);
            const cpuLimit = Number(server.cpu || 0);
            return (
              <Card key={server.id} className="pn-server-card">
                <div className="pn-server-top">
                  <div className="pn-server-name">
                    <div className="pn-server-glyph"><Server aria-hidden="true" /></div>
                    <div style={{ minWidth: 0 }}>
                      <h3>{server.name}</h3>
                      <p>{server.type || "SERVER"}{server.version ? ` ${server.version}` : ""} · {server.id}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                    <Badge tone={server.suspended ? "warning" : statusTone(server.status)} dot live={online && !server.suspended}>{server.suspended ? "Suspended" : statusLabel(server.status)}</Badge>
                    {server.suspended ? <Lock size={11} style={{ color: "var(--pn-amber)" }} aria-label="Suspended" /> : null}
                  </div>
                </div>
                <div className="pn-server-body">
                  <div className="pn-server-facts">
                    <div><span>Address</span><b>{server.address || "Hidden"}</b></div>
                    <div><span>Node</span><b>{server.nodeName || "Unassigned"}</b></div>
                    <div><span>Owner</span><b>{server.ownerUsername || "—"}</b></div>
                    <div><span>Last activity</span><b>{server.lastActivity ? timeAgo(server.lastActivity) : "—"}</b></div>
                  </div>
                  <div className="pn-server-bars">
                    <div className="pn-bar-row">
                      <span><Cpu size={10} aria-hidden="true" /> CPU</span>
                      <Meter value={Math.min(100, cpuLimit)} />
                      <b>{cpuLimit || 0}%</b>
                    </div>
                    <div className="pn-bar-row">
                      <span><MemoryStick size={10} aria-hidden="true" /> RAM</span>
                      <Meter value={Math.min(100, (ramLimit / 16) * 100)} tone="info" />
                      <b>{ramLimit || 0} GB</b>
                    </div>
                  </div>
                  {maintenance ? <div className="pn-callout pn-callout--warning" style={{ padding: "7px 9px", fontSize: 10 }}><AlertTriangle aria-hidden="true" /> Node maintenance in progress.</div> : null}
                  {server.nodeUnavailable ? <div className="pn-callout pn-callout--danger" style={{ padding: "7px 9px", fontSize: 10 }}><AlertTriangle aria-hidden="true" /> Node unreachable — status may be stale.</div> : null}
                </div>
                <div className="pn-server-foot">
                  {online ? (
                    <>
                      <IconButton icon={RotateCw} label={`Restart ${server.name}`} disabled={busyHere} onClick={() => void action(server, "restart", "Restart")} />
                      <IconButton icon={Square} label={`Stop ${server.name}`} disabled={busyHere} onClick={() => void action(server, "stop", "Stop")} />
                    </>
                  ) : (
                    <Button size="sm" tone="primary" icon={Play} disabled={busyHere || server.suspended || maintenance} onClick={() => void action(server, "start", "Start")}>Start</Button>
                  )}
                  <IconButton icon={Terminal} label={`Open ${server.name} console`} onClick={() => navigate(`/servers/${server.id}`)} />
                  {staff ? (
                    <>
                      <IconButton icon={server.suspended ? Unlock : Lock} label={server.suspended ? "Unsuspend server" : "Suspend server"} disabled={busyHere} onClick={() => void suspend(server)} />
                      <IconButton icon={Trash2} label={`Delete ${server.name}`} disabled={busyHere} onClick={() => void remove(server)} />
                    </>
                  ) : null}
                  <Link to={`/servers/${server.id}`} className="pn-btn pn-btn--ghost pn-btn--sm pn-server-open">
                    Manage <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="pn-between" style={{ fontSize: 10.5 }}>
        <span className="pn-quiet"><Globe size={11} aria-hidden="true" /> Address visibility follows your role. Non-staff addresses stay hidden by the API.</span>
        <span className="pn-quiet"><OctagonX size={11} aria-hidden="true" /> Kill is available inside each server workspace.</span>
      </div>
    </div>
  );
}
