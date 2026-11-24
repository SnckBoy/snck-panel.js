import express from "express";
import { readJSON } from "../services/db.js";
import { requireAuth } from "../middleware/auth.js";
import { getHostMetrics, recordFleetPoint, getFleetHistory } from "../services/metrics.js";

const router = express.Router();
router.use(requireAuth);

const HEARTBEAT_TIMEOUT_MS = Math.max(30_000, Number(process.env.NODE_HEARTBEAT_TIMEOUT_MS || 45_000));

type NodeLike = Record<string, any>;

function nodeStatus(node: NodeLike, now = Date.now()): string {
  if (node.maintenance) return "MAINTENANCE";
  if (node.restartingAt && Number.isFinite(Date.parse(node.restartingAt)) && now - Date.parse(node.restartingAt) < 90_000) return "RESTARTING";
  if (node.installing) return "INSTALLING";
  if (node.error) return "ERROR";
  if (node.disabled) return "DISABLED";
  if (node.isLocal && node.localReady === true) return "ONLINE";
  if (node.isLocal && !node.credentialHash) return "SETUP_REQUIRED";
  const heartbeat = node.lastHeartbeat ? Date.parse(node.lastHeartbeat) : NaN;
  return Number.isFinite(heartbeat) && now - heartbeat <= HEARTBEAT_TIMEOUT_MS ? "ONLINE" : "OFFLINE";
}

function nodeResources(node: NodeLike) {
  const stats = node.lastStats || {};
  const memory = stats.memory || {};
  const disk = stats.disk || {};
  const cpu = Number(stats.cpuUsage);
  return {
    cpu: Number.isFinite(cpu) ? Number(cpu.toFixed(1)) : null,
    memoryUsed: Number(memory.used) || 0,
    memoryTotal: Number(memory.total) || 0,
    diskUsed: Number(disk.used) || 0,
    diskTotal: Number(disk.total) || 0,
    network: stats.network || null,
    servers: stats.servers || null,
    docker: stats.docker,
    uptime: Number(stats.uptime) || null,
  };
}

function networkTotals(network: any) {
  if (!network || typeof network !== "object") return { rx: 0, tx: 0 };
  const rx = Number(network.rx ?? network.rxBytes ?? network.rx_bytes ?? 0);
  const tx = Number(network.tx ?? network.txBytes ?? network.tx_bytes ?? 0);
  return { rx: Number.isFinite(rx) ? rx : 0, tx: Number.isFinite(tx) ? tx : 0 };
}

function actionLabel(action: string, metadata: any = {}) {
  const target = metadata.name || metadata.nodeId || metadata.serverId || "";
  const labels: Record<string, string> = {
    "node.created": "Node created",
    "node.deleted": "Node deleted",
    "node.credentials.rotated": "Node credentials rotated",
    "node.maintenance.enabled": "Node entered maintenance",
    "node.maintenance.disabled": "Node left maintenance",
    "node.reconnected": "Node reconnected",
    "node.restart_requested": "Node restart requested",
    "node.disabled": "Node disabled",
    "node.enabled": "Node enabled",
    "node.local.created": "Local node created",
    "node.local.reused": "Local node refreshed",
    "server.started": "Server started",
    "server.stopped": "Server stopped",
    "server.created": "Server created",
    "server.deleted": "Server deleted",
    "server.suspended": "Server suspended",
    "server.unsuspended": "Server unsuspended",
    "backup.created": "Backup created",
    "apikey.created": "API key created",
    "apikey.revoked": "API key revoked",
    "user.created": "User created",
    "user.deleted": "User deleted",
  };
  return `${labels[action] || action.replace(/[._]/g, " ")}${target ? ` · ${target}` : ""}`;
}

/** Aggregated, permission-scoped overview used by the dashboard and notifications. */
router.get("/", async (req: any, res) => {
  try {
    const user = req.user || {};
    const staff = user.role === "admin" || user.role === "owner";
    const [serversRaw, nodesRaw, usersRaw, auditRaw, settings] = await Promise.all([
      readJSON("servers.json"),
      readJSON("nodes.json"),
      readJSON("users.json"),
      readJSON("audit_logs.json"),
      readJSON("settings.json"),
    ]);
    const servers: any[] = Array.isArray(serversRaw) ? serversRaw : [];
    const nodes: any[] = Array.isArray(nodesRaw) ? nodesRaw : [];
    const users: any[] = Array.isArray(usersRaw) ? usersRaw : [];
    const audit: any[] = Array.isArray(auditRaw) ? auditRaw : [];

    const visibleServers = staff
      ? servers
      : servers.filter((server) => server.owner === user.id || server.subUsers?.some((entry: any) => entry?.userId === user.id));
    const visibleNodes = staff ? nodes : nodes.filter((node) => node.visibility !== "private");
    const now = Date.now();
    const decoratedNodes = visibleNodes.map((node) => ({ ...node, status: nodeStatus(node, now), resources: nodeResources(node) }));

    const onlineServers = visibleServers.filter((server) => server.status === "online").length;
    const suspendedServers = visibleServers.filter((server) => server.suspended).length;
    const onlineNodes = decoratedNodes.filter((node) => node.status === "ONLINE").length;

    const aggregate = decoratedNodes.reduce(
      (accumulator, node) => {
        const resource = node.resources;
        if (resource.cpu !== null) {
          accumulator.cpuSum += resource.cpu;
          accumulator.cpuCount += 1;
        }
        accumulator.memoryUsed += resource.memoryUsed;
        accumulator.memoryTotal += resource.memoryTotal;
        accumulator.diskUsed += resource.diskUsed;
        accumulator.diskTotal += resource.diskTotal;
        const nodeNetwork = networkTotals(resource.network);
        accumulator.rx += nodeNetwork.rx;
        accumulator.tx += nodeNetwork.tx;
        return accumulator;
      },
      { cpuSum: 0, cpuCount: 0, memoryUsed: 0, memoryTotal: 0, diskUsed: 0, diskTotal: 0, rx: 0, tx: 0 },
    );

    const host = getHostMetrics();
    recordFleetPoint({ serversOnline: onlineServers, nodesOnline: onlineNodes });

    const notificationSettings = settings?.notificationSettings || {};
    const cpuThreshold = Number(notificationSettings.cpuThreshold) || 85;
    const memoryThreshold = Number(notificationSettings.memoryThreshold) || 90;
    const diskThreshold = Number(notificationSettings.diskThreshold) || 90;
    const alerts: any[] = [];
    const pushAlert = (severity: string, title: string, detail: string, target?: string) => {
      alerts.push({ id: `${severity}-${alerts.length}-${title}`, severity, title, detail, target });
    };

    if (settings?.maintenance?.enabled) {
      pushAlert("warning", "Maintenance mode is active", settings.maintenance.message || "Non-staff server operations are paused.", "/settings");
    }
    if (!staff && visibleServers.length === 0) {
      pushAlert("info", "No servers yet", "Deploy your first Minecraft server to get started.", "/servers/create");
    }
    if (staff && nodes.length === 0) {
      pushAlert("info", "No nodes connected", "Create a node to obtain its one-time registration command.", "/nodes");
    }
    for (const node of decoratedNodes) {
      if (node.disabled) continue;
      if (node.status === "OFFLINE" || node.status === "ERROR") {
        pushAlert("danger", `${node.name} is ${node.status.toLowerCase()}`, node.isLocal ? "The panel host Docker runtime is unavailable." : "No authenticated heartbeat has arrived within the timeout window.", "/nodes");
      } else if (node.status === "MAINTENANCE") {
        pushAlert("warning", `${node.name} is in maintenance`, "New deployments are blocked on this node.", "/nodes");
      }
      const resource = node.resources;
      if (resource.cpu !== null && resource.cpu >= cpuThreshold) pushAlert("warning", `High CPU on ${node.name}`, `${resource.cpu.toFixed(1)}% used (threshold ${cpuThreshold}%).`, "/nodes");
      if (resource.memoryTotal > 0 && (resource.memoryUsed / resource.memoryTotal) * 100 >= memoryThreshold) pushAlert("warning", `Memory pressure on ${node.name}`, `${Math.round((resource.memoryUsed / resource.memoryTotal) * 100)}% of node memory is in use.`, "/nodes");
      if (resource.diskTotal > 0 && (resource.diskUsed / resource.diskTotal) * 100 >= diskThreshold) pushAlert("warning", `Disk pressure on ${node.name}`, `${Math.round((resource.diskUsed / resource.diskTotal) * 100)}% of node disk is in use.`, "/nodes");
    }
    if (host.cpu >= cpuThreshold) pushAlert("warning", "High panel CPU usage", `${host.cpu.toFixed(1)}% of the panel host CPU is in use.`, "/admin");
    if (host.memory.percent >= memoryThreshold) pushAlert("warning", "Panel memory pressure", `${host.memory.percent}% of panel host memory is in use.`, "/admin");
    if (host.disk && host.disk.percent >= diskThreshold) pushAlert("warning", "Panel disk pressure", `${host.disk.percent}% of the panel disk is in use.`, "/admin");
    if (staff && suspendedServers > 0) pushAlert("info", `${suspendedServers} suspended server${suspendedServers === 1 ? "" : "s"}`, "Suspension blocks access until it is removed.", "/servers");

    const scopedActivity = (staff ? audit : audit.filter((entry) => entry.actorId === user.id))
      .slice()
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

    const recentServers = visibleServers
      .slice()
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, 4)
      .map((server) => ({
        id: server.id,
        name: server.name,
        status: server.status,
        type: server.type,
        version: server.version,
        nodeName: nodes.find((node) => node.id === (server.nodeId || "local"))?.name || "Unassigned node",
        createdAt: server.createdAt,
      }));

    const createdLastDay = visibleServers.filter((server) => Date.parse(server.createdAt || 0) > now - 86_400_000).length;

    res.json({
      generatedAt: new Date().toISOString(),
      role: user.role,
      maintenance: {
        enabled: Boolean(settings?.maintenance?.enabled),
        message: String(settings?.maintenance?.message || ""),
      },
      servers: {
        total: visibleServers.length,
        online: onlineServers,
        offline: visibleServers.length - onlineServers,
        suspended: suspendedServers,
        maintenance: visibleServers.filter((server) => server.status === "maintenance").length,
        createdLastDay,
      },
      nodes: {
        total: visibleNodes.length,
        online: onlineNodes,
        offline: visibleNodes.length - onlineNodes,
        maintenance: decoratedNodes.filter((node) => node.status === "MAINTENANCE").length,
      },
      users: {
        total: staff ? users.length : null,
        admins: staff ? users.filter((entry) => entry.role === "admin" || entry.role === "owner").length : null,
      },
      panel: host,
      fleet: {
        cpuAverage: aggregate.cpuCount ? Number((aggregate.cpuSum / aggregate.cpuCount).toFixed(1)) : null,
        memoryUsed: aggregate.memoryUsed,
        memoryTotal: aggregate.memoryTotal,
        diskUsed: aggregate.diskUsed,
        diskTotal: aggregate.diskTotal,
        network: {
          rxBytes: aggregate.rx + host.network.rxTotal,
          txBytes: aggregate.tx + host.network.txTotal,
          rxPerSecond: host.network.rxPerSecond,
          txPerSecond: host.network.txPerSecond,
          available: aggregate.rx > 0 || host.network.available,
        },
      },
      nodeHealth: decoratedNodes.map((node) => ({
        id: node.id,
        name: node.name,
        status: node.status,
        isLocal: Boolean(node.isLocal),
        location: node.location || "",
        cpu: node.resources.cpu,
        memoryUsed: node.resources.memoryUsed,
        memoryTotal: node.resources.memoryTotal,
        diskUsed: node.resources.diskUsed,
        diskTotal: node.resources.diskTotal,
        lastHeartbeat: node.lastHeartbeat || null,
        servers: node.resources.servers,
        docker: node.resources.docker,
      })),
      recentServers,
      activity: scopedActivity.slice(0, 8).map((entry) => ({
        id: entry.id,
        action: entry.action,
        label: actionLabel(String(entry.action || ""), entry.metadata || {}),
        actorId: entry.actorId,
        at: entry.createdAt,
        ip: entry.ip,
      })),
      history: getFleetHistory(),
      alerts: alerts.slice(0, 8),
    });
  } catch (error: any) {
    res.status(500).json({ error: "Could not build the panel overview", details: String(error?.message || error) });
  }
});

/** Audit/activity feed, scoped to the caller. */
router.get("/activity", async (req: any, res) => {
  try {
    const user = req.user || {};
    const staff = user.role === "admin" || user.role === "owner";
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 60));
    const raw = await readJSON("audit_logs.json");
    const entries: any[] = Array.isArray(raw) ? raw : [];
    const items = (staff ? entries : entries.filter((entry) => entry.actorId === user.id))
      .slice()
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        action: entry.action,
        label: actionLabel(String(entry.action || ""), entry.metadata || {}),
        actorId: entry.actorId,
        ip: entry.ip,
        at: entry.createdAt,
        metadata: entry.metadata || {},
      }));
    res.json({ items, total: items.length, scopedToCaller: !staff });
  } catch {
    res.status(500).json({ error: "Could not load activity" });
  }
});

/** Role-scoped global search used by the command palette. */
router.get("/search", async (req: any, res) => {
  try {
    const user = req.user || {};
    const staff = user.role === "admin" || user.role === "owner";
    const query = String(req.query.q || "").trim().toLowerCase().slice(0, 80);
    if (!query) return res.json({ servers: [], nodes: [], users: [] });
    const [serverRaw, nodeRaw, userRaw] = await Promise.all([
      readJSON("servers.json"),
      readJSON("nodes.json"),
      readJSON("users.json"),
    ]);
    const servers: any[] = Array.isArray(serverRaw) ? serverRaw : [];
    const nodes: any[] = Array.isArray(nodeRaw) ? nodeRaw : [];
    const users: any[] = Array.isArray(userRaw) ? userRaw : [];
    const visibleServers = staff ? servers : servers.filter((server) => server.owner === user.id || server.subUsers?.some((entry: any) => entry?.userId === user.id));
    const matchedServers = visibleServers
      .filter((server) => `${server.name} ${server.id} ${server.type} ${server.version}`.toLowerCase().includes(query))
      .slice(0, 8)
      .map((server) => ({
        id: server.id,
        name: server.name,
        status: server.status,
        nodeName: nodes.find((node) => node.id === (server.nodeId || "local"))?.name || "Unassigned node",
      }));
    const matchedNodes = staff
      ? nodes
          .filter((node) => `${node.name} ${node.hostname} ${node.fqdn} ${node.publicIp} ${node.location}`.toLowerCase().includes(query))
          .slice(0, 6)
          .map((node) => ({ id: node.id, name: node.name, status: nodeStatus(node), hostname: node.fqdn || node.hostname }))
      : [];
    const matchedUsers = staff
      ? users
          .filter((entry) => `${entry.username} ${entry.email || ""}`.toLowerCase().includes(query))
          .slice(0, 6)
          .map((entry) => ({ id: entry.id, username: entry.username, role: entry.role }))
      : [];
    res.json({ servers: matchedServers, nodes: matchedNodes, users: matchedUsers });
  } catch {
    res.status(500).json({ error: "Search is temporarily unavailable" });
  }
});

export default router;
