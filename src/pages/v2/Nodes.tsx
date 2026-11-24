import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  FileClock,
  HardDrive,
  KeyRound,
  MapPin,
  MemoryStick,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Waypoints,
  Wrench,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast, useConfirm } from "../../components/ui";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Field,
  IconButton,
  Meter,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  Skeleton,
  Switch,
  formatBytes,
  formatPercent,
  statusLabel,
  statusTone,
  timeAgo,
  uptimeLabel,
} from "../../components/ui";

type NodeRecord = Record<string, any>;

const errorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data;
  return [data?.error, data?.details, data?.hint].filter(Boolean).join(" — ") || error?.message || fallback;
};

const nodeStatus = (node: NodeRecord) => String(node.status || "OFFLINE");

function endpointLabel(node: NodeRecord) {
  if (node.isLocal) return "panel host · Docker socket";
  const host = node.fqdn || node.hostname || node.publicIp || "address pending";
  const port = node.behindProxy ? 443 : node.apiPort;
  return `${host}:${port}`;
}

export default function NodesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const staff = user?.role === "admin" || user?.role === "owner";
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "attention">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<NodeRecord | null>(null);
  const [logsFor, setLogsFor] = useState<NodeRecord | null>(null);
  const [reinstallFor, setReinstallFor] = useState<NodeRecord | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await axios.get(staff ? "/api/nodes" : "/api/nodes/public", { timeout: 20000 });
      if (!Array.isArray(response.data)) throw new Error("The node inventory response was invalid.");
      setNodes(response.data);
      setLoadError("");
    } catch (error: any) {
      setLoadError(errorMessage(error, "Unable to load nodes."));
    } finally {
      setLoading(false);
    }
  }, [staff]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(
    () =>
      nodes.filter((node) => {
        const matchesQuery = `${node.name} ${node.hostname} ${node.fqdn} ${node.publicIp} ${node.location}`.toLowerCase().includes(query.toLowerCase());
        const online = nodeStatus(node) === "ONLINE";
        const matchesFilter = filter === "all" || (filter === "online" ? online : !online);
        return matchesQuery && matchesFilter;
      }),
    [nodes, query, filter],
  );

  const stats = useMemo(() => {
    const online = nodes.filter((node) => nodeStatus(node) === "ONLINE").length;
    const servers = nodes.reduce((total, node) => total + Number(node.lastStats?.servers?.total || 0), 0);
    const running = nodes.reduce((total, node) => total + Number(node.lastStats?.servers?.running || 0), 0);
    const cpuValues = nodes.map((node) => Number(node.lastStats?.cpuUsage)).filter((value) => Number.isFinite(value));
    return { online, servers, running, cpu: cpuValues.length ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : null };
  }, [nodes]);

  const act = async (node: NodeRecord, action: string, label: string, method: "post" | "delete" | "get" = "post") => {
    setBusy(`${node.id}:${action}`);
    try {
      await axios({ method, url: `/api/nodes/${node.id}/${action}` });
      toast.success(`${label} completed`, `${node.name} responded successfully.`);
      await load();
    } catch (error: any) {
      toast.error(`${label} failed`, errorMessage(error, "The node did not accept the request."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (node: NodeRecord) => {
    const approved = await confirm({
      title: `Delete ${node.name}?`,
      description: "The panel record, its stored credential hashes and registration tokens are removed. Servers must be reassigned or deleted first. This cannot be undone.",
      confirmLabel: "Delete node",
      tone: "danger",
    });
    if (!approved) return;
    setBusy(`${node.id}:delete`);
    try {
      await axios.delete(`/api/nodes/${node.id}`);
      toast.success("Node deleted", `${node.name} is no longer part of the fleet.`);
      await load();
    } catch (error: any) {
      toast.error("Delete failed", errorMessage(error, "The node could not be deleted."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Infrastructure"
        eyebrowIcon={Waypoints}
        title="Nodes"
        description="Every node appears online only after an authenticated agent registration followed by a valid heartbeat. Tokens alone never mark a node online."
        actions={
          staff ? (
            <>
              <Button icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button>
              <Button tone="primary" icon={Plus} onClick={() => setWizardOpen(true)}>Create node</Button>
            </>
          ) : (
            <Button icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button>
          )
        }
      />

      {loadError ? (
        <div className="pn-callout pn-callout--danger" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>{loadError} Last known inventory is retained.</span>
        </div>
      ) : null}

      {staff ? (
        <div className="pn-kpis">
          <Card className="pn-stat">
            <div className="pn-stat-top"><div><div className="pn-stat-label">Registered nodes</div><div className="pn-stat-value">{nodes.length}</div><div className="pn-stat-caption">{stats.online} online right now</div></div><div className="pn-stat-icon"><Waypoints aria-hidden="true" /></div></div>
            <div className="pn-quiet"><Activity size={11} aria-hidden="true" /> heartbeat window {Math.round(Number(45))}s</div>
          </Card>
          <Card className="pn-stat">
            <div className="pn-stat-top"><div><div className="pn-stat-label">Workloads</div><div className="pn-stat-value">{stats.running}<small> / {stats.servers}</small></div><div className="pn-stat-caption">running / total across nodes</div></div><div className="pn-stat-icon"><Server aria-hidden="true" /></div></div>
          </Card>
          <Card className="pn-stat">
            <div className="pn-stat-top"><div><div className="pn-stat-label">Average node CPU</div><div className="pn-stat-value">{stats.cpu === null ? "—" : formatPercent(stats.cpu, 0)}</div><div className="pn-stat-caption">reported by online agents</div></div><div className="pn-stat-icon"><Cpu aria-hidden="true" /></div></div>
            <Meter value={stats.cpu ?? 0} />
          </Card>
          <Card className="pn-stat">
            <div className="pn-stat-top"><div><div className="pn-stat-label">Needs attention</div><div className="pn-stat-value">{nodes.length - stats.online}</div><div className="pn-stat-caption">offline, error or maintenance</div></div><div className="pn-stat-icon"><Wrench aria-hidden="true" /></div></div>
          </Card>
        </div>
      ) : null}

      <div className="pn-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search nodes by name, address or location…" />
        <Segmented
          value={filter}
          onChange={setFilter}
          label="Filter nodes"
          options={[
            { value: "all", label: "All" },
            { value: "online", label: "Online" },
            { value: "attention", label: "Attention" },
          ]}
        />
      </div>

      {loading && nodes.length === 0 ? (
        <div className="pn-node-grid">{[0, 1].map((key) => <Skeleton key={key} height={320} radius={16} />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Waypoints}
            title={nodes.length ? "No nodes match this view" : staff ? "Connect your first node" : "No public nodes available"}
            description={nodes.length ? "Try a different search or status filter." : staff ? "Create a node to receive a secure, one-time registration command you run once on the VPS." : "Staff have not published any nodes yet."}
            action={staff && !nodes.length ? <Button tone="primary" icon={Plus} onClick={() => setWizardOpen(true)}>Create node</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="pn-node-grid">
          {filtered.map((node) => {
            const status = nodeStatus(node);
            const stats = node.lastStats || {};
            const memory = stats.memory || {};
            const disk = stats.disk || {};
            const online = status === "ONLINE";
            const usage = {
              cpu: Number(stats.cpuUsage),
              memory: Number(memory.total) > 0 ? (Number(memory.used) / Number(memory.total)) * 100 : 0,
              disk: Number(disk.total) > 0 ? (Number(disk.used) / Number(disk.total)) * 100 : 0,
            };
            return (
              <Card key={node.id} className={`pn-node-card ${online ? "is-online" : ""}`}>
                <div className="pn-node-head">
                  <div className="pn-node-ident">
                    <div className="pn-node-icon"><Server aria-hidden="true" /></div>
                    <div style={{ minWidth: 0 }}>
                      <h3>{node.name}</h3>
                      <div className="pn-node-addr">{endpointLabel(node)}</div>
                      <div className="pn-quiet" style={{ marginTop: 5 }}>
                        {node.isLocal ? "Panel host runtime" : node.os || "Linux agent"}
                        {node.location ? <> · <MapPin size={10} aria-hidden="true" /> {node.location}</> : null}
                      </div>
                    </div>
                  </div>
                  <Badge tone={statusTone(status)} dot live={online}>{statusLabel(status)}</Badge>
                </div>
                <div className="pn-node-body">
                  <div className="pn-node-metrics">
                    <div className="pn-node-metric">
                      <span><Cpu aria-hidden="true" /> CPU</span>
                      <b>{Number.isFinite(usage.cpu) ? formatPercent(usage.cpu, 0) : "—"}</b>
                      <Meter value={usage.cpu || 0} />
                    </div>
                    <div className="pn-node-metric">
                      <span><MemoryStick aria-hidden="true" /> RAM</span>
                      <b>{memory.used ? formatBytes(Number(memory.used)) : "—"}</b>
                      <Meter value={usage.memory} tone="info" />
                    </div>
                    <div className="pn-node-metric">
                      <span><HardDrive aria-hidden="true" /> Disk</span>
                      <b>{disk.used ? formatBytes(Number(disk.used)) : "—"}</b>
                      <Meter value={usage.disk} tone="warn" />
                    </div>
                  </div>
                  <div className="pn-between" style={{ fontSize: 10.5 }}>
                    <span className="pn-quiet"><Clock size={11} aria-hidden="true" /> heartbeat <b>{online ? timeAgo(node.lastHeartbeat) : node.lastHeartbeat ? timeAgo(node.lastHeartbeat) : "never"}</b></span>
                    <span className="pn-quiet">{stats.servers ? <><Server size={10} aria-hidden="true" /> {stats.servers.running}/{stats.servers.total} servers</> : "no workload data"}</span>
                  </div>
                  <div className="pn-between" style={{ fontSize: 10.5 }}>
                    <span className="pn-quiet">daemon <b>{node.daemonVersion || "pending"}</b></span>
                    <span className="pn-quiet">uptime <b>{uptimeLabel(stats.uptime)}</b></span>
                    {node.disabled ? <Badge tone="offline">Disabled</Badge> : null}
                  </div>
                  {stats.docker === false ? (
                    <div className="pn-callout pn-callout--danger" style={{ padding: "8px 10px", fontSize: 10.5 }}>
                      <AlertTriangle aria-hidden="true" /> Docker is unavailable on this node. Install/start Docker Engine and check the socket permissions.
                    </div>
                  ) : null}
                </div>
                {staff ? (
                  <div className="pn-node-foot">
                    <Button size="sm" icon={Wrench} onClick={() => void act(node, "health", "Health check", "get")} loading={busy === `${node.id}:health`}>Health</Button>
                    <Button size="sm" icon={Pencil} onClick={() => setEditing(node)}>Edit</Button>
                    <Button size="sm" icon={FileClock} onClick={() => setLogsFor(node)}>Logs</Button>
                    <Button size="sm" icon={KeyRound} onClick={() => setReinstallFor(node)}>Reinstall</Button>
                    <Button size="sm" icon={Power} onClick={() => void act(node, node.maintenance ? "maintenance" : "maintenance", node.maintenance ? "Exit maintenance" : "Maintenance", node.maintenance ? "delete" : "post")} loading={busy === `${node.id}:maintenance`}>{node.maintenance ? "Resume" : "Maint."}</Button>
                    <Button size="sm" icon={Trash2} onClick={() => void remove(node)} loading={busy === `${node.id}:delete`} title="Delete node" aria-label="Delete node" />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {wizardOpen ? <NodeWizard onClose={() => setWizardOpen(false)} onCreated={() => void load()} /> : null}
      {editing ? <EditNodeModal node={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : null}
      {reinstallFor ? <ReinstallModal node={reinstallFor} onClose={() => setReinstallFor(null)} /> : null}
      {logsFor ? <LogsModal node={logsFor} onClose={() => setLogsFor(null)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create wizard                                                       */
/* ------------------------------------------------------------------ */

type WizardForm = {
  name: string;
  location: string;
  description: string;
  hostname: string;
  publicIp: string;
  memoryGb: string;
  diskGb: string;
  cpu: string;
  maxServers: string;
  apiPort: string;
  sftpPort: string;
  tls: boolean;
  tlsVerify: boolean;
  behindProxy: boolean;
};

const INITIAL_FORM: WizardForm = {
  name: "",
  location: "",
  description: "",
  hostname: "",
  publicIp: "",
  memoryGb: "16",
  diskGb: "100",
  cpu: "400",
  maxServers: "20",
  apiPort: "6768",
  sftpPort: "2022",
  tls: false,
  tlsVerify: true,
  behindProxy: false,
};

const STEPS = ["Basic details", "Resources", "Security", "Connect VPS"];

function NodeWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [command, setCommand] = useState("");
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [nodeStatus, setNodeStatus] = useState("WAITING");
  const [regenerating, setRegenerating] = useState(false);

  const update = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.name.trim()) return "Give the node a name.";
      if (!form.hostname.trim()) return "Enter the node's public IP address or hostname.";
      if (!/^[A-Za-z0-9.-]+$/.test(form.hostname.trim())) return "Use a valid IPv4 address or hostname (letters, digits, dots and dashes).";
    }
    if (step === 1) {
      const numeric = [form.memoryGb, form.diskGb, form.cpu, form.maxServers, form.apiPort, form.sftpPort];
      if (numeric.some((value) => !Number.isFinite(Number(value)))) return "All resource fields must be numbers.";
      if (Number(form.memoryGb) < 1) return "Memory must be at least 1 GB.";
      if (Number(form.diskGb) < 1) return "Disk must be at least 1 GB.";
      if (Number(form.cpu) < 1) return "CPU allocation must be at least 1%.";
      if (!Number.isInteger(Number(form.apiPort)) || Number(form.apiPort) < 1 || Number(form.apiPort) > 65535) return "Daemon port must be 1–65535.";
      if (!Number.isInteger(Number(form.sftpPort)) || Number(form.sftpPort) < 1 || Number(form.sftpPort) > 65535) return "SFTP port must be 1–65535.";
    }
    return "";
  };

  const next = () => {
    const problem = validateStep();
    if (problem) { setError(problem); return; }
    setError("");
    setStep((current) => Math.min(3, current + 1));
  };

  const createNode = async () => {
    const problem = validateStep();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      const response = await axios.post("/api/nodes", {
        name: form.name.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        hostname: form.hostname.trim(),
        fqdn: form.hostname.trim(),
        publicIp: form.publicIp.trim() || form.hostname.trim(),
        apiPort: Number(form.apiPort),
        sftpPort: Number(form.sftpPort),
        memory: Math.round(Number(form.memoryGb) * 1024),
        disk: Number(form.diskGb),
        cpu: Number(form.cpu),
        maxServers: Number(form.maxServers),
        memoryOverallocate: 0,
        diskOverallocate: 0,
        tls: form.tls,
        tlsVerify: form.tlsVerify,
        behindProxy: form.behindProxy,
        visibility: "public",
        createCloudflareDns: false,
      });
      const node = response.data;
      const setupToken = String(node.setupToken || "");
      setCreated(node);
      setToken(setupToken);
      setExpiresAt(Date.now() + 15 * 60 * 1000);
      setCommand(
        `curl -fsSL ${window.location.origin}/node.sh | sudo bash -s -- --panel ${window.location.origin} --node-id ${node.id} --setup-token ${setupToken} --port ${node.apiPort}`,
      );
      setStep(3);
      onCreated();
      toast.success("Node created", "One-time registration token generated. Run the command on your VPS.");
    } catch (requestError: any) {
      setError(errorMessage(requestError, "The node could not be created."));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!created?.id || step !== 3) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await axios.get(`/api/nodes/${created.id}`, { timeout: 8000 });
        if (!active) return;
        const status = String(response.data?.status || "WAITING");
        setNodeStatus(status);
        if (status === "ONLINE") onCreated();
      } catch { /* keep waiting */ }
    };
    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [created?.id, step, onCreated]);

  const regenerate = async () => {
    if (!created?.id) return;
    setRegenerating(true);
    try {
      const response = await axios.post(`/api/nodes/${created.id}/setup-token`);
      setToken(response.data.setupToken);
      setCommand(response.data.command);
      setExpiresAt(Date.parse(response.data.expiresAt));
      setNodeStatus("WAITING");
      toast.success("New token issued", "The previous token was invalidated.");
    } catch (requestError: any) {
      toast.error("Token regeneration failed", errorMessage(requestError, "Try again."));
    } finally {
      setRegenerating(false);
    }
  };

  const minutesLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000)) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Create a node"
      description="Four short steps. No Linux expertise required — the panel writes the install command for you."
      size="wide"
      labelId="pn-node-wizard-title"
      footer={
        <>
          <span style={{ marginRight: "auto", fontSize: 11, color: "var(--pn-dim)" }}>Step {step + 1} of 4 · {STEPS[step]}</span>
          {step > 0 && step < 3 ? <Button tone="ghost" onClick={() => setStep((current) => current - 1)}>Back</Button> : null}
          {step < 2 ? <Button tone="primary" onClick={next}>Continue</Button> : null}
          {step === 2 ? <Button tone="primary" loading={saving} icon={ShieldCheck} onClick={() => void createNode()}>Create node & generate token</Button> : null}
          {step === 3 ? (
            <>
              <Button tone="ghost" onClick={regenerate} loading={regenerating} icon={RefreshCw}>New token</Button>
              <Button tone="primary" onClick={onClose}>{nodeStatus === "ONLINE" ? "Done" : "Close"}</Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="pn-wizard-steps" role="list">
        {STEPS.map((label, index) => (
          <div key={label} role="listitem" className={`pn-step ${index === step ? "is-active" : index < step ? "is-done" : ""}`}>
            <i>{index < step ? <Check size={11} aria-hidden="true" /> : index + 1}</i>
            {label}
          </div>
        ))}
      </div>
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

        {step === 0 ? (
          <>
            <div className="pn-callout pn-callout--accent">
              <Terminal aria-hidden="true" />
              <span>The panel creates the node record and a unique identifier automatically. You only describe where the machine lives.</span>
            </div>
            <div className="pn-grid-2">
              <Field label="Node name" hint="Shown throughout the panel, for example “Frankfurt · Ryzen 9”.">
                <input className="pn-input" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Frankfurt · Ryzen 9" autoFocus />
              </Field>
              <Field label="Location" hint="Optional region or datacenter label.">
                <input className="pn-input" value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Frankfurt, DE" />
              </Field>
            </div>
            <Field label="Description" hint="Optional note about purpose, provider or hardware.">
              <textarea className="pn-textarea" rows={2} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Primary Minecraft workloads · EU region" />
            </Field>
            <div className="pn-grid-2">
              <Field label="Public IP or hostname" hint="The address the panel will use to reach this node. A domain is recommended for TLS.">
                <input className="pn-input mono" value={form.hostname} onChange={(event) => update("hostname", event.target.value)} placeholder="node-eu.example.com or 203.0.113.10" />
              </Field>
              <Field label="Public IP address" hint="Optional. Used for display and allocation records.">
                <input className="pn-input mono" value={form.publicIp} onChange={(event) => update("publicIp", event.target.value)} placeholder="203.0.113.10" />
              </Field>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="pn-callout">
              <MemoryStick aria-hidden="true" />
              <span>These are the maximum resources this node may allocate to servers. The agent reports real usage separately.</span>
            </div>
            <div className="pn-grid-3">
              <Field label="Memory allocation (GB)">
                <input className="pn-input mono" inputMode="numeric" value={form.memoryGb} onChange={(event) => update("memoryGb", event.target.value)} placeholder="16" />
              </Field>
              <Field label="Disk allocation (GB)">
                <input className="pn-input mono" inputMode="numeric" value={form.diskGb} onChange={(event) => update("diskGb", event.target.value)} placeholder="100" />
              </Field>
              <Field label="CPU allocation (%)" hint="100% = one full core. 400% = four cores.">
                <input className="pn-input mono" inputMode="numeric" value={form.cpu} onChange={(event) => update("cpu", event.target.value)} placeholder="400" />
              </Field>
            </div>
            <div className="pn-grid-3">
              <Field label="Maximum servers" hint="0 means unlimited.">
                <input className="pn-input mono" inputMode="numeric" value={form.maxServers} onChange={(event) => update("maxServers", event.target.value)} placeholder="20" />
              </Field>
              <Field label="Daemon port" hint="The agent API port.">
                <input className="pn-input mono" inputMode="numeric" value={form.apiPort} onChange={(event) => update("apiPort", event.target.value)} placeholder="6768" />
              </Field>
              <Field label="SFTP port" hint="File transfer port.">
                <input className="pn-input mono" inputMode="numeric" value={form.sftpPort} onChange={(event) => update("sftpPort", event.target.value)} placeholder="2022" />
              </Field>
            </div>
            <div className="pn-callout pn-callout--accent">
              <HardDrive aria-hidden="true" />
              <span>Available game ports are managed through <b>Allocations</b> after the node is online. Servers can only use allocated ports.</span>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="pn-callout pn-callout--accent">
              <ShieldCheck aria-hidden="true" />
              <span>Registration uses a single-use token, stored only as a SHA-256 hash and valid for 15 minutes. The agent receives its long-lived credential once.</span>
            </div>
            <Switch checked={form.tls} onChange={(value) => update("tls", value)} label="Use HTTPS/TLS for daemon communication" description="Recommended when the node is reachable over the public internet or a domain with a certificate." />
            {form.tls ? <Switch checked={form.tlsVerify} onChange={(value) => update("tlsVerify", value)} label="Verify the node certificate" description="Turn off only for self-signed certificates you control." /> : null}
            <Switch checked={form.behindProxy} onChange={(value) => update("behindProxy", value)} label="Node is behind a reverse proxy or Cloudflare Tunnel" description="The panel connects over port 443 using the hostname instead of the daemon port." />
            <div className="pn-card" style={{ background: "#050506" }}>
              <div className="pn-card-body" style={{ display: "grid", gap: 8 }}>
                <div className="pn-between"><span className="pn-dim" style={{ fontSize: 11.5 }}>Node name</span><b style={{ fontSize: 12 }}>{form.name || "—"}</b></div>
                <div className="pn-between"><span className="pn-dim" style={{ fontSize: 11.5 }}>Endpoint</span><b className="mono" style={{ fontSize: 11.5 }}>{form.hostname}{form.behindProxy ? ":443" : `:${form.apiPort}`}</b></div>
                <div className="pn-between"><span className="pn-dim" style={{ fontSize: 11.5 }}>Allocation</span><b style={{ fontSize: 12 }}>{form.memoryGb} GB RAM · {form.cpu}% CPU · {form.diskGb} GB disk</b></div>
                <div className="pn-between"><span className="pn-dim" style={{ fontSize: 11.5 }}>Maximum servers</span><b style={{ fontSize: 12 }}>{form.maxServers === "0" ? "Unlimited" : form.maxServers}</b></div>
              </div>
            </div>
          </>
        ) : null}

        {step === 3 && created ? (
          <>
            <div className="pn-between">
              <div>
                <div className="pn-section-label">Node identifier</div>
                <div className="mono" style={{ fontSize: 11.5, marginTop: 4 }}>{created.id}</div>
              </div>
              <Badge tone={statusTone(nodeStatus === "WAITING" ? "PENDING" : nodeStatus)} dot live={nodeStatus === "ONLINE"}>
                {nodeStatus === "WAITING" ? "Waiting for agent" : statusLabel(nodeStatus)}
              </Badge>
            </div>

            {nodeStatus === "ONLINE" ? (
              <div className="pn-callout pn-callout--accent">
                <CheckCircle2 aria-hidden="true" />
                <span><b style={{ color: "var(--pn-text)" }}>Node is online.</b> An authenticated heartbeat was received. You can deploy servers on it now.</span>
              </div>
            ) : (
              <div className="pn-callout">
                <Activity aria-hidden="true" />
                <span>This page checks for a registered heartbeat every 3 seconds. The node stays <b>offline</b> until the agent registers with this token and reports in.</span>
              </div>
            )}

            <div>
              <div className="pn-between" style={{ marginBottom: 7 }}>
                <span className="pn-section-label">Step 1 · Run this once on the VPS as root</span>
                <span className="pn-quiet"><Clock size={11} aria-hidden="true" /> {minutesLeft === null ? "15 min" : `${minutesLeft} min left`}</span>
              </div>
              <div className="pn-command">
                {command}
                <span className="pn-copy"><CopyButton value={command} label="Copy installation command" /></span>
              </div>
            </div>

            <div>
              <div className="pn-section-label" style={{ marginBottom: 6 }}>One-time registration token</div>
              <div className="pn-token">{token}</div>
              <div className="pn-field-hint" style={{ marginTop: 6 }}>Shown once. Only its hash is stored; it expires after 15 minutes or first use.</div>
            </div>

            <div className="pn-card" style={{ background: "#050506" }}>
              <div className="pn-card-body" style={{ display: "grid", gap: 11 }}>
                <span className="pn-section-label">What the command does</span>
                {[
                  "Installs Docker Engine and Node.js on Ubuntu/Debian if they are missing.",
                  "Downloads the SNCK node agent and writes its protected configuration.",
                  "Registers with this panel using the one-time token, then discards it.",
                  "Starts the systemd service and begins authenticated heartbeats every 10 seconds.",
                ].map((line, index) => (
                  <div key={line} style={{ display: "flex", gap: 10, fontSize: 11.5, color: "var(--pn-muted)", lineHeight: 1.55 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 99, border: "1px solid var(--pn-line-strong)", display: "grid", placeItems: "center", fontSize: 9.5, flex: "0 0 18px" }}>{index + 1}</span>
                    {line}
                  </div>
                ))}
                <div className="pn-field-hint">Requirements: root access, Ubuntu 22.04/24.04 or Debian, outbound HTTPS, and inbound port {form.behindProxy ? "443" : form.apiPort} reachable from the panel.</div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Edit                                                               */
/* ------------------------------------------------------------------ */

function EditNodeModal({ node, onClose, onSaved }: { node: NodeRecord; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: String(node.name || ""),
    description: String(node.description || ""),
    location: String(node.location || ""),
    hostname: String(node.fqdn || node.hostname || node.publicIp || ""),
    publicIp: String(node.publicIp || ""),
    apiPort: String(node.apiPort || 6768),
    sftpPort: String(node.sftpPort || 2022),
    memory: String(Math.round(Number(node.memory || 0) / 1024) || 16),
    disk: String(node.disk || 100),
    cpu: String(node.cpu || 400),
    maxServers: String(node.maxServers ?? 0),
    tls: node.tls !== false,
    tlsVerify: node.tlsVerify !== false,
    behindProxy: Boolean(node.behindProxy),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await axios.patch(`/api/nodes/${node.id}`, {
        name: form.name.trim(),
        description: form.description,
        location: form.location,
        hostname: form.hostname.trim(),
        fqdn: form.hostname.trim(),
        publicIp: form.publicIp,
        apiPort: Number(form.apiPort),
        sftpPort: Number(form.sftpPort),
        memory: Math.round(Number(form.memory) * 1024),
        disk: Number(form.disk),
        cpu: Number(form.cpu),
        maxServers: Number(form.maxServers) || 0,
        tls: form.tls,
        tlsVerify: form.tlsVerify,
        behindProxy: form.behindProxy,
      });
      toast.success("Node updated", `${form.name} configuration saved.`);
      onSaved();
    } catch (requestError: any) {
      setError(errorMessage(requestError, "The node could not be updated."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${node.name}`}
      description="Connection and capacity settings. The node credential is never displayed or replaced here."
      size="wide"
      footer={<><Button tone="ghost" onClick={onClose}>Cancel</Button><Button tone="primary" loading={saving} onClick={() => void save()}>Save changes</Button></>}
    >
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}
        <div className="pn-grid-2">
          <Field label="Node name"><input className="pn-input" value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
          <Field label="Location"><input className="pn-input" value={form.location} onChange={(event) => set("location", event.target.value)} /></Field>
        </div>
        <Field label="Description"><textarea className="pn-textarea" rows={2} value={form.description} onChange={(event) => set("description", event.target.value)} /></Field>
        <div className="pn-grid-2">
          <Field label="Public IP or hostname"><input className="pn-input mono" value={form.hostname} onChange={(event) => set("hostname", event.target.value)} /></Field>
          <Field label="Public IP"><input className="pn-input mono" value={form.publicIp} onChange={(event) => set("publicIp", event.target.value)} /></Field>
        </div>
        <div className="pn-grid-3">
          <Field label="Memory (GB)"><input className="pn-input mono" value={form.memory} onChange={(event) => set("memory", event.target.value)} /></Field>
          <Field label="Disk (GB)"><input className="pn-input mono" value={form.disk} onChange={(event) => set("disk", event.target.value)} /></Field>
          <Field label="CPU (%)"><input className="pn-input mono" value={form.cpu} onChange={(event) => set("cpu", event.target.value)} /></Field>
        </div>
        <div className="pn-grid-3">
          <Field label="Maximum servers" hint="0 = unlimited"><input className="pn-input mono" value={form.maxServers} onChange={(event) => set("maxServers", event.target.value)} /></Field>
          <Field label="Daemon port"><input className="pn-input mono" value={form.apiPort} onChange={(event) => set("apiPort", event.target.value)} /></Field>
          <Field label="SFTP port"><input className="pn-input mono" value={form.sftpPort} onChange={(event) => set("sftpPort", event.target.value)} /></Field>
        </div>
        <Switch checked={form.tls} onChange={(value) => set("tls", value)} label="HTTPS/TLS daemon communication" />
        <Switch checked={form.behindProxy} onChange={(value) => set("behindProxy", value)} label="Behind reverse proxy / tunnel" description="Connect over port 443 using the hostname." />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Reinstall / token                                                  */
/* ------------------------------------------------------------------ */

function ReinstallModal({ node, onClose }: { node: NodeRecord; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(`/api/nodes/${node.id}/setup-token`);
      setData(response.data);
    } catch (requestError: any) {
      setError(errorMessage(requestError, "A new token could not be generated."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void generate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reinstall agent · ${node.name}`}
      description="Issue a fresh single-use token. The previous token is invalidated and the agent replaces its credential on registration."
      footer={<><Button tone="ghost" onClick={onClose}>Close</Button><Button tone="primary" icon={RefreshCw} loading={loading} onClick={() => void generate()}>Generate another</Button></>}
    >
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}
        {node.isLocal ? (
          <div className="pn-callout"><Server aria-hidden="true" /><span>This is the panel host node. It uses the local Docker socket and does not need an agent install command.</span></div>
        ) : data ? (
          <>
            <div className="pn-callout pn-callout--accent"><ShieldCheck aria-hidden="true" /><span>Run this command as root on the target VPS. It expires at {new Date(data.expiresAt).toLocaleTimeString()}.</span></div>
            <div className="pn-command">{data.command}<span className="pn-copy"><CopyButton value={data.command} label="Copy install command" /></span></div>
            <div>
              <div className="pn-section-label" style={{ marginBottom: 6 }}>Registration token</div>
              <div className="pn-token">{data.setupToken}</div>
            </div>
            <Button size="sm" tone="ghost" icon={Copy} onClick={async () => { await navigator.clipboard.writeText(data.command); toast.success("Command copied"); }}>Copy command</Button>
          </>
        ) : loading ? <Skeleton height={80} radius={10} /> : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Logs                                                               */
/* ------------------------------------------------------------------ */

function LogsModal({ node, onClose }: { node: NodeRecord; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios.get(`/api/nodes/${node.id}/connection-logs`)
      .then((response) => { if (active) setData(response.data); })
      .catch((requestError) => { if (active) setError(errorMessage(requestError, "Logs could not be loaded.")); });
    return () => { active = false; };
  }, [node.id]);

  return (
    <Modal open onClose={onClose} title={`Connection logs · ${node.name}`} description="Audit-backed node events and the latest health snapshot." size="wide">
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}
        {!data && !error ? <Skeleton height={140} radius={12} /> : null}
        {data ? (
          <>
            <div className="pn-statline">
              <div><span>Status</span><b>{statusLabel(data.status)}</b></div>
              <div><span>Last heartbeat</span><b style={{ fontSize: 12 }}>{data.lastHeartbeat ? timeAgo(data.lastHeartbeat) : "never"}</b></div>
              <div><span>Daemon</span><b style={{ fontSize: 12 }}>{data.daemonVersion || "—"}</b></div>
              <div><span>Endpoint</span><b style={{ fontSize: 11 }}>{data.endpoint?.hostname}:{data.endpoint?.port}</b></div>
            </div>
            <div className="pn-card" style={{ background: "#050506", overflow: "hidden" }}>
              <div className="pn-table-wrap">
                <table className="pn-table">
                  <thead><tr><th>Event</th><th>When</th><th>Context</th></tr></thead>
                  <tbody>
                    {data.events?.length ? data.events.map((event: any) => (
                      <tr key={event.id}>
                        <td><strong>{String(event.action || "").replace(/[._]/g, " ")}</strong></td>
                        <td>{timeAgo(event.at)}</td>
                        <td className="num">{event.metadata?.ip || event.metadata?.name || "—"}</td>
                      </tr>
                    )) : <tr><td colSpan={3} style={{ textAlign: "center", padding: 26, color: "var(--pn-dim)" }}>No node events recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
