import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  Cpu,
  Globe,
  HardDrive,
  Layers,
  MemoryStick,
  Package,
  Play,
  Server,
  ShieldCheck,
  Sparkles,
  Waypoints,
  Zap,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import {
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  Skeleton,
  useToast,
} from "../../components/ui";

const SOFTWARE = [
  { id: "PAPER", name: "Paper", tag: "Recommended", blurb: "High-performance Spigot fork with plugin support and excellent stability." },
  { id: "PURPUR", name: "Purpur", tag: "Plugins", blurb: "Paper fork with extra gameplay and performance configuration." },
  { id: "VANILLA", name: "Vanilla", tag: "Official", blurb: "Unmodified Minecraft server straight from Mojang." },
  { id: "FABRIC", name: "Fabric", tag: "Mods", blurb: "Lightweight, fast mod loader with a huge mod ecosystem." },
  { id: "FORGE", name: "Forge", tag: "Mods", blurb: "The classic modding platform for large modpacks." },
  { id: "NEOFORGE", name: "NeoForge", tag: "Mods", blurb: "Modern Forge-compatible loader for current Minecraft versions." },
  { id: "FOLIA", name: "Folia", tag: "Performance", blurb: "Regionised Paper fork built for very high player counts." },
  { id: "SPIGOT", name: "Spigot", tag: "Plugins", blurb: "Widely compatible plugin server software." },
  { id: "BUKKIT", name: "Bukkit", tag: "Legacy", blurb: "Classic plugin API for older Minecraft versions." },
  { id: "VELOCITY", name: "Velocity", tag: "Proxy", blurb: "Modern, secure Minecraft proxy for network routing." },
  { id: "BUNGEECORD", name: "BungeeCord", tag: "Proxy", blurb: "Established proxy for linking multiple servers." },
  { id: "WATERFALL", name: "Waterfall", tag: "Proxy", blurb: "Paper's BungeeCord fork with performance improvements." },
] as const;

type NodeRecord = Record<string, any>;
type Allocation = Record<string, any>;

const errorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data;
  return [data?.error, data?.details, data?.hint].filter(Boolean).join(" — ") || error?.message || fallback;
};

export default function CreateServerPage() {
  const { user } = useAuth();
  const { serverDefaults } = useSettings() as any;
  const toast = useToast();
  const navigate = useNavigate();
  const staff = user?.role === "admin" || user?.role === "owner";

  const [step, setStep] = useState(0);
  const [type, setType] = useState("PAPER");
  const [version, setVersion] = useState("latest");
  const [versions, setVersions] = useState<string[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocationId, setAllocationId] = useState("");
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [name, setName] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [owner, setOwner] = useState("");
  const [ram, setRam] = useState(String(serverDefaults?.ram ?? 4));
  const [cpu, setCpu] = useState(String(serverDefaults?.cpu ?? 150));
  const [disk, setDisk] = useState(String(serverDefaults?.disk ?? 10));
  const [javaVersion, setJavaVersion] = useState("");
  const [javaVersions, setJavaVersions] = useState<string[]>([]);
  const [lifetimeHours, setLifetimeHours] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  useEffect(() => {
    let active = true;
    setNodesLoading(true);
    axios.get(staff ? "/api/nodes" : "/api/nodes/public", { timeout: 15000 })
      .then((response) => {
        if (!active) return;
        const list = (Array.isArray(response.data) ? response.data : []).filter((node: any) => !node.disabled && !node.maintenance);
        setNodes(list);
        if (list.length === 1) setNodeId(String(list[0].id));
      })
      .catch(() => { if (active) setNodes([]); })
      .finally(() => { if (active) setNodesLoading(false); });
    return () => { active = false; };
  }, [staff]);

  useEffect(() => {
    let active = true;
    if (!staff) return;
    axios.get("/api/system/users", { timeout: 15000 })
      .then((response) => {
        if (!active) return;
        const list = Array.isArray(response.data) ? response.data : [];
        setUsers(list);
        setOwner((current) => current || String(user?.id || ""));
      })
      .catch(() => { if (active) setUsers([]); });
    return () => { active = false; };
  }, [staff, user?.id]);

  useEffect(() => {
    let active = true;
    setVersionsLoading(true);
    setVersion("latest");
    axios.get("/api/system/versions", { params: { type }, timeout: 15000 })
      .then((response) => { if (active) setVersions(Array.isArray(response.data) ? response.data : ["latest"]); })
      .catch(() => { if (active) setVersions(["latest"]); })
      .finally(() => { if (active) setVersionsLoading(false); });
    return () => { active = false; };
  }, [type]);

  useEffect(() => {
    let active = true;
    axios.get("/api/system/java-versions", { timeout: 10000 })
      .then((response) => { if (active) setJavaVersions(Array.isArray(response.data) ? response.data : []); })
      .catch(() => { if (active) setJavaVersions([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!nodeId) { setAllocations([]); setAllocationId(""); return; }
    let active = true;
    setAllocationLoading(true);
    setAllocationId("");
    axios.get("/api/allocations/available", { timeout: 15000 })
      .then((response) => {
        if (!active) return;
        const list = (Array.isArray(response.data) ? response.data : []).filter((allocation: any) => String(allocation.nodeId) === String(nodeId));
        setAllocations(list);
        if (list.length === 1) setAllocationId(String(list[0].id));
      })
      .catch((requestError) => {
        if (!active) return;
        setAllocations([]);
        if (requestError?.response?.status !== 403) setError(errorMessage(requestError, "Allocations could not be loaded."));
      })
      .finally(() => { if (active) setAllocationLoading(false); });
    return () => { active = false; };
  }, [nodeId]);

  const selectedNode = useMemo(() => nodes.find((node) => String(node.id) === String(nodeId)), [nodes, nodeId]);
  const selectedAllocation = useMemo(() => allocations.find((allocation) => String(allocation.id) === String(allocationId)), [allocations, allocationId]);
  const selectedSoftware = SOFTWARE.find((software) => software.id === type);
  const port = selectedAllocation ? Number(selectedAllocation.portStart ?? selectedAllocation.port) : null;

  const validate = (targetStep: number) => {
    if (targetStep > 0) {
      if (!type) return "Choose server software.";
      if (!version) return "Choose a Minecraft version.";
    }
    if (targetStep > 1) {
      if (!nodeId) return "Choose a node with an authenticated heartbeat.";
      if (!selectedNode) return "The selected node is unavailable.";
      if (selectedNode.status !== "ONLINE" && !selectedNode.isLocal) return "The selected node is offline. Wait for its heartbeat or choose another node.";
      if (!allocationId) return "Choose an available port allocation.";
      if (!port) return "That allocation has no usable port.";
    }
    if (targetStep > 2) {
      if (!name.trim()) return "Give the server a name.";
      if (name.trim().length > 80) return "Server names are limited to 80 characters.";
      const ramValue = Number(ram), cpuValue = Number(cpu), diskValue = Number(disk);
      if (!Number.isFinite(ramValue) || ramValue <= 0 || ramValue > 1024) return "RAM must be between 1 and 1024 GB.";
      if (!Number.isFinite(cpuValue) || cpuValue <= 0 || cpuValue > 10000) return "CPU must be between 1 and 10000%.";
      if (!Number.isFinite(diskValue) || diskValue <= 0) return "Disk must be greater than zero.";
      if (!staff && !owner) setOwner(String(user?.id || ""));
    }
    return "";
  };

  const next = () => {
    const problem = validate(step + 1);
    if (problem) { setError(problem); return; }
    setError("");
    setStep((current) => Math.min(2, current + 1));
  };

  const submit = async () => {
    const problem = validate(3);
    if (problem) { setError(problem); return; }
    setCreating(true);
    setError("");
    try {
      const response = await axios.post("/api/servers", {
        name: name.trim(),
        ram: Number(ram),
        cpu: Number(cpu),
        disk: Number(disk),
        port,
        type,
        version,
        owner: staff ? owner || user?.id : user?.id,
        nodeId,
        allocationId,
        javaVersion: javaVersion || undefined,
        lifetimeHours: lifetimeHours || undefined,
      }, { timeout: 300000 });
      setCreated(response.data);
      toast.success("Server created", `${name} is being provisioned on ${selectedNode?.name || "the node"}.`);
    } catch (requestError: any) {
      setError(errorMessage(requestError, "The server could not be created."));
    } finally {
      setCreating(false);
    }
  };

  if (created) {
    return (
      <div className="pn-page" style={{ maxWidth: 720 }}>
        <PageHeader eyebrow="Deployment accepted" eyebrowIcon={CheckCircle2} title="Your server is on its way" description="The node is pulling the selected software and preparing the container. You can follow progress in the live console." />
        <Card className="pn-card--pad">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="pn-callout pn-callout--accent"><ShieldCheck aria-hidden="true" /><span>The server record exists and the container request was accepted by the node. Installation progress is real console output — not a mock animation.</span></div>
            <div className="pn-statline">
              <div><span>Software</span><b style={{ fontSize: 12 }}>{type} {version}</b></div>
              <div><span>Node</span><b style={{ fontSize: 12 }}>{selectedNode?.name || "—"}</b></div>
              <div><span>Port</span><b style={{ fontSize: 12 }}>{port || "—"}</b></div>
              <div><span>Resources</span><b style={{ fontSize: 12 }}>{ram} GB · {cpu}% · {disk} GB</b></div>
            </div>
            <div className="pn-row">
              <Button tone="primary" icon={Play} onClick={() => navigate(`/servers/${created.id}`)}>Open console</Button>
              <Button icon={Server} onClick={() => navigate("/servers")}>All servers</Button>
              <Button tone="ghost" onClick={() => { setCreated(null); setStep(0); setName(""); }}>Deploy another</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="pn-page" style={{ maxWidth: 1080 }}>
      <PageHeader
        eyebrow="Deploy"
        eyebrowIcon={Sparkles}
        title="Create a server"
        description="Three steps: choose software, pick a node and port, then size the resources. Every option maps to real backend capability."
        actions={<Button tone="ghost" icon={ArrowLeft} onClick={() => navigate("/servers")}>Back to fleet</Button>}
      />

      <div className="pn-wizard-steps" style={{ padding: "12px 14px", border: "1px solid var(--pn-line)", borderRadius: 12, background: "var(--pn-surface)" }}>
        {["Software & version", "Node & port", "Resources & review"].map((label, index) => (
          <div key={label} className={`pn-step ${index === step ? "is-active" : index < step ? "is-done" : ""}`}>
            <i>{index < step ? <Check size={11} aria-hidden="true" /> : index + 1}</i>
            {label}
          </div>
        ))}
      </div>

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      {step === 0 ? (
        <Card>
          <div className="pn-card-head"><div><h3>Server software</h3><p>Backed by the same version resolver the node uses to prepare the container.</p></div><Badge tone="accent">{SOFTWARE.length} supported</Badge></div>
          <div className="pn-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
              {SOFTWARE.map((software) => {
                const active = type === software.id;
                return (
                  <button
                    key={software.id}
                    type="button"
                    onClick={() => setType(software.id)}
                    aria-pressed={active}
                    style={{
                      textAlign: "left",
                      padding: 13,
                      borderRadius: 11,
                      border: `1px solid ${active ? "color-mix(in srgb, var(--pn-accent) 45%, transparent)" : "var(--pn-line)"}`,
                      background: active ? "color-mix(in srgb, var(--pn-accent) 5%, #060607)" : "#060607",
                      cursor: "pointer",
                    }}
                  >
                    <div className="pn-between" style={{ marginBottom: 7 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600 }}>
                        <Package size={14} aria-hidden="true" style={{ color: active ? "var(--pn-accent)" : "var(--pn-muted)" }} />
                        {software.name}
                      </span>
                      {active ? <Check size={13} style={{ color: "var(--pn-accent)" }} aria-hidden="true" /> : <span className="pn-dim" style={{ fontSize: 9.5, letterSpacing: ".08em" }}>{software.tag}</span>}
                    </div>
                    <p style={{ fontSize: 10.5, color: "var(--pn-dim)", lineHeight: 1.5 }}>{software.blurb}</p>
                  </button>
                );
              })}
            </div>
            <div className="pn-grid-2">
              <Field label="Minecraft version" hint={versionsLoading ? "Loading versions from the panel…" : "“latest” resolves to the newest supported build for this software."}>
                {versionsLoading ? <Skeleton height={38} radius={9} /> : (
                  <select className="pn-select" value={version} onChange={(event) => setVersion(event.target.value)}>
                    {versions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Java runtime" hint="Auto uses the image default matched to the selected version.">
                <select className="pn-select" value={javaVersion} onChange={(event) => setJavaVersion(event.target.value)}>
                  <option value="">Auto / image default</option>
                  {javaVersions.map((entry) => <option key={entry} value={entry}>Java {entry}</option>)}
                </select>
              </Field>
            </div>
            <div className="pn-between">
              <span className="pn-quiet"><Layers size={11} aria-hidden="true" /> Selected: <b>{selectedSoftware?.name}</b> · {version}</span>
              <Button tone="primary" onClick={next}>Continue <ArrowRight size={14} aria-hidden="true" /></Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="pn-grid-2" style={{ alignItems: "start" }}>
          <Card>
            <div className="pn-card-head"><div><h3>Target node</h3><p>Only online nodes with capacity are listed as selectable.</p></div></div>
            <div className="pn-card-body" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {nodesLoading ? <Skeleton height={70} radius={10} /> : nodes.length === 0 ? (
                <div className="pn-callout pn-callout--warning"><Waypoints aria-hidden="true" /><span>No nodes are available. Create and register a node first.</span></div>
              ) : nodes.map((node) => {
                const online = node.status === "ONLINE";
                const active = String(nodeId) === String(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setNodeId(String(node.id))}
                    style={{
                      display: "flex", alignItems: "center", gap: 11, padding: 12, borderRadius: 10, textAlign: "left",
                      border: `1px solid ${active ? "color-mix(in srgb, var(--pn-accent) 45%, transparent)" : "var(--pn-line)"}`,
                      background: active ? "color-mix(in srgb, var(--pn-accent) 5%, #060607)" : "#060607",
                    }}
                  >
                    <span className="pn-node-icon" style={{ width: 34, height: 34, flexBasis: 34 }}><Server size={15} aria-hidden="true" /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 12.5 }}>{node.name}</b>
                      <span className="pn-dim" style={{ display: "block", fontSize: 10.5, marginTop: 3 }}>{node.location || node.fqdn || node.hostname} · {node.isLocal ? "panel host" : online ? "heartbeat live" : "offline"}</span>
                    </span>
                    <Badge tone={online ? "online" : "offline"} dot>{online ? "Online" : "Offline"}</Badge>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card>
            <div className="pn-card-head"><div><h3>Port allocation</h3><p>Available ports on the selected node. Servers can only bind allocated ports.</p></div></div>
            <div className="pn-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!nodeId ? <div className="pn-callout"><Globe aria-hidden="true" /><span>Select a node to load its free allocations.</span></div> : allocationLoading ? <Skeleton height={50} radius={10} /> : allocations.length === 0 ? (
                <div className="pn-callout pn-callout--warning"><AlertTriangle aria-hidden="true" /><span>No free allocations on this node. An administrator can add ports in <b>Allocations</b>.</span></div>
              ) : (
                <Field label="Available port" hint="The primary port is used by the game listener.">
                  <select className="pn-select" value={allocationId} onChange={(event) => setAllocationId(event.target.value)}>
                    <option value="">Select a port…</option>
                    {allocations.map((allocation) => (
                      <option key={allocation.id} value={allocation.id}>
                        Port {allocation.portStart}{allocation.portEnd && allocation.portEnd !== allocation.portStart ? `–${allocation.portEnd}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="pn-between">
                <span className="pn-quiet"><Zap size={11} aria-hidden="true" /> {selectedAllocation ? `Port ${port}` : "No port selected"}</span>
                <div className="pn-row">
                  <Button tone="ghost" onClick={() => setStep(0)}>Back</Button>
                  <Button tone="primary" onClick={next}>Continue <ArrowRight size={14} aria-hidden="true" /></Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="pn-grid-2" style={{ alignItems: "start" }}>
          <Card>
            <div className="pn-card-head"><div><h3>Identity & resources</h3><p>Limits are enforced by the container runtime.</p></div></div>
            <div className="pn-card-body" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <Field label="Server name"><input className="pn-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Survival SMP" maxLength={80} autoFocus /></Field>
              {staff ? (
                <Field label="Owner" hint="The account that receives full access to this server.">
                  <select className="pn-select" value={owner} onChange={(event) => setOwner(event.target.value)}>
                    <option value={String(user?.id || "")}>{user?.username || "me"} (me)</option>
                    {users.filter((entry) => entry.id !== user?.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.username} · {entry.role}</option>)}
                  </select>
                </Field>
              ) : null}
              <div className="pn-grid-3">
                <Field label="RAM (GB)"><input className="pn-input mono" value={ram} onChange={(event) => setRam(event.target.value)} inputMode="numeric" /></Field>
                <Field label="CPU (%)"><input className="pn-input mono" value={cpu} onChange={(event) => setCpu(event.target.value)} inputMode="numeric" /></Field>
                <Field label="Disk (GB)"><input className="pn-input mono" value={disk} onChange={(event) => setDisk(event.target.value)} inputMode="numeric" /></Field>
              </div>
              {staff ? (
                <Field label="Lifetime" hint="Blank keeps the server until deleted.">
                  <select className="pn-select" value={lifetimeHours} onChange={(event) => setLifetimeHours(event.target.value)}>
                    <option value="">Permanent</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                    <option value="2160">90 days</option>
                  </select>
                </Field>
              ) : null}
              <div className="pn-row" style={{ justifyContent: "flex-end" }}>
                <Button tone="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button tone="primary" icon={Server} loading={creating} onClick={() => void submit()}>Create server</Button>
              </div>
            </div>
          </Card>
          <Card>
            <div className="pn-card-head"><div><h3>Review</h3><p>Exactly what will be requested from the node.</p></div><Badge tone="accent">Live contract</Badge></div>
            <div className="pn-card-body">
              <div className="pn-kv">
                {[
                  { label: "Software", value: `${type} ${version}`, icon: Box },
                  { label: "Node", value: selectedNode?.name || "—", icon: Server },
                  { label: "Address", value: selectedNode?.publicIp || selectedNode?.fqdn || selectedNode?.hostname || "—", icon: Globe },
                  { label: "Port", value: port ? String(port) : "—", icon: Zap },
                  { label: "Memory", value: `${ram} GB`, icon: MemoryStick },
                  { label: "CPU", value: `${cpu}%`, icon: Cpu },
                  { label: "Disk", value: `${disk} GB`, icon: HardDrive },
                  { label: "Java", value: javaVersion ? `Java ${javaVersion}` : "Auto", icon: Layers },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div className="pn-kv-row" key={row.label}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon size={12} aria-hidden="true" /> {row.label}</span>
                      <b>{row.value}</b>
                    </div>
                  );
                })}
              </div>
              <div className="pn-callout pn-callout--accent" style={{ marginTop: 14 }}>
                <CheckCircle2 aria-hidden="true" />
                <span>Creation may take a few minutes while the node pulls the image. Progress is visible in the console.</span>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
