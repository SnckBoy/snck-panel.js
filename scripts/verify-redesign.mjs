/**
 * End-to-end verification for the SNCK panel redesign.
 *
 * Exercises real HTTP endpoints against a running panel:
 * first-run setup, login, node one-time-token registration, authenticated
 * heartbeat, overview aggregation, activity, settings, maintenance gating,
 * user roles and API keys.
 *
 * Usage: PANEL_URL=http://127.0.0.1:3000 node scripts/verify-redesign.mjs
 */

import fs from "node:fs";

const BASE = (process.env.PANEL_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const results = [];
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(method, path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}

const run = async () => {
  const stamp = Date.now().toString(36);
  const ownerUsername = `verify_owner_${stamp}`;
  const ownerPassword = "VerifyOwnerPass123!";
  const serverHealth = await api("GET", "/health");
  check("Panel health endpoint responds", serverHealth.status === 200 && serverHealth.data?.ok === true);

  // First-run setup may already be complete on a reused data directory.
  const setup = await api("POST", "/api/auth/setup", {
    username: ownerUsername,
    email: `${ownerUsername}@example.test`,
    password: ownerPassword,
    confirmPassword: ownerPassword,
  });
  check("Owner setup endpoint is protected and idempotent", setup.status === 201 || setup.status === 409, `HTTP ${setup.status}`);

  let ownerToken = null;
  if (setup.status === 201) {
    const login = await api("POST", "/api/auth/login", { username: ownerUsername, password: ownerPassword });
    ownerToken = login.data?.token;
    check("New owner can sign in", login.status === 200 && Boolean(ownerToken));
  } else {
    // Reused installation: sign in with an existing owner from previous runs.
    const users = JSON.parse(fs.readFileSync(".data/users.json", "utf8"));
    const owner = users.find((entry) => entry.role === "owner");
    const password = process.env.VERIFY_OWNER_PASSWORD || "VerifyOwnerPass123!";
    const login = await api("POST", "/api/auth/login", { username: owner.username, password: password });
    ownerToken = login.data?.token;
    check("Existing owner can sign in for verification", login.status === 200 && Boolean(ownerToken), `HTTP ${login.status}`);
  }

  if (!ownerToken) {
    console.log("\nCannot continue without an owner session.");
    process.exit(1);
  }

  const me = await api("GET", "/api/auth/me", null, ownerToken);
  check("Authenticated identity is returned", me.status === 200 && me.data?.user?.role === "owner");

  const overviewBefore = await api("GET", "/api/overview", null, ownerToken);
  check("Overview returns real aggregate data", overviewBefore.status === 200 && typeof overviewBefore.data?.servers?.total === "number" && typeof overviewBefore.data?.panel?.cpu === "number", `servers=${overviewBefore.data?.servers?.total}`);

  const nodeName = `Verify node ${stamp}`;
  const createdNode = await api("POST", "/api/nodes", {
    name: nodeName,
    description: "Automated verification node",
    location: "Local test",
    hostname: "127.0.0.1",
    publicIp: "127.0.0.1",
    apiPort: 6799,
    sftpPort: 2023,
    memory: 8192,
    disk: 50,
    cpu: 200,
    maxServers: 5,
    tls: false,
    visibility: "private",
    createCloudflareDns: false,
  }, ownerToken);
  const nodeId = createdNode.data?.id;
  const setupToken = createdNode.data?.setupToken;
  check("Node creation returns a one-time setup token", createdNode.status === 201 && Boolean(nodeId) && Boolean(setupToken), `HTTP ${createdNode.status}`);

  const immediateStatus = await api("GET", `/api/nodes/${nodeId}`, null, ownerToken);
  check("New node is offline before any heartbeat", immediateStatus.data?.status === "OFFLINE" || immediateStatus.data?.status === "SETUP_REQUIRED", `status=${immediateStatus.data?.status}`);

  const registration = await api("POST", "/api/node-agent/register", { setupToken, nodeId, daemonVersion: "1.1.0" });
  const credential = registration.data?.credential;
  check("Agent registers with the hashed one-time token", registration.status === 200 && Boolean(credential));

  const reusedToken = await api("POST", "/api/node-agent/register", { setupToken, nodeId, daemonVersion: "1.1.0" });
  check("Setup token rejects a second registration", reusedToken.status === 401, `HTTP ${reusedToken.status}`);

  const heartbeat = await api("POST", "/api/node-agent/heartbeat", {
    nodeId,
    stats: {
      cpuUsage: 12.5,
      memory: { total: 8 * 1024 ** 3, free: 6 * 1024 ** 3, used: 2 * 1024 ** 3 },
      disk: { total: 50 * 1024 ** 3, free: 40 * 1024 ** 3, used: 10 * 1024 ** 3 },
      network: { rx: 1024, tx: 2048 },
      docker: true,
      servers: { total: 0, running: 0, stopped: 0 },
      daemonVersion: "1.1.0",
      uptime: 3600,
    },
  }, credential);
  check("Authenticated heartbeat is accepted", heartbeat.status === 200 && heartbeat.data?.ok === true);

  const afterHeartbeat = await api("GET", `/api/nodes/${nodeId}`, null, ownerToken);
  check("Node becomes ONLINE only after a valid heartbeat", afterHeartbeat.data?.status === "ONLINE", `status=${afterHeartbeat.data?.status}`);

  const overviewAfter = await api("GET", "/api/overview", null, ownerToken);
  const healthEntry = overviewAfter.data?.nodeHealth?.find((entry) => entry.id === nodeId);
  check("Overview aggregates the node heartbeat", Boolean(healthEntry) && healthEntry.status === "ONLINE" && healthEntry.cpu === 12.5);
  check("Overview exposes measured panel telemetry", Number.isFinite(overviewAfter.data?.panel?.memory?.percent) && Array.isArray(overviewAfter.data?.panel?.load));

  const newToken = await api("POST", `/api/nodes/${nodeId}/setup-token`, null, ownerToken);
  check("Registration token can be regenerated", newToken.status === 201 && Boolean(newToken.data?.command) && newToken.data.command.includes(nodeId));

  const nodeLogs = await api("GET", `/api/nodes/${nodeId}/connection-logs`, null, ownerToken);
  check("Node connection logs are audit-backed", nodeLogs.status === 200 && Array.isArray(nodeLogs.data?.events) && nodeLogs.data.events.length > 0);

  const search = await api("GET", `/api/overview/search?q=${encodeURIComponent("Verify node")}`, null, ownerToken);
  check("Global search finds the node", search.status === 200 && (search.data?.nodes || []).some((entry) => entry.id === nodeId));

  const activity = await api("GET", "/api/overview/activity?limit=20", null, ownerToken);
  check("Activity feed returns audit events", activity.status === 200 && (activity.data?.items || []).some((entry) => entry.action === "node.created"));

  const coreSettings = await api("PUT", "/api/system/settings", {
    maintenance: { enabled: true, message: "Automated verification window" },
    notificationSettings: { cpuThreshold: 70, memoryThreshold: 80, diskThreshold: 85, nodeOfflineAlerts: true },
    serverDefaults: { ram: 6, cpu: 200, disk: 15, autoRestart: true },
    accent: "lime",
  }, ownerToken);
  check("Settings accept maintenance, alerts and server defaults", coreSettings.status === 200 && coreSettings.data?.success === true);

  const savedSettings = await api("GET", "/api/system/settings", null, ownerToken);
  check("Settings persist with validation", savedSettings.data?.maintenance?.enabled === true && savedSettings.data?.notificationSettings?.cpuThreshold === 70 && savedSettings.data?.serverDefaults?.ram === 6);

  const userName = `verify_user_${stamp}`;
  const createdUser = await api("POST", "/api/system/users", { username: userName, password: "VerifyUserPass123!", role: "user" }, ownerToken);
  check("Admin can create a user account", createdUser.status === 200 && Boolean(createdUser.data?.id));

  const userLogin = await api("POST", "/api/auth/login", { username: userName, password: "VerifyUserPass123!" });
  const userToken = userLogin.data?.token;
  check("New user can sign in", userLogin.status === 200 && Boolean(userToken));

  const blockedByMaintenance = await api("POST", "/api/servers/does-not-exist/start", null, userToken);
  check("Maintenance mode blocks non-staff server mutations", blockedByMaintenance.status === 503 && blockedByMaintenance.data?.maintenance === true, `HTTP ${blockedByMaintenance.status}`);

  const userSearch = await api("GET", "/api/overview/search?q=Verify", null, userToken);
  check("Search results are permission-scoped for standard users", (userSearch.data?.nodes || []).length === 0);

  const apiKey = await api("POST", "/api/admin/api-keys", { label: `Verification key ${stamp}`, scopes: ["user:access"] }, ownerToken);
  check("API key is issued once with a scoped secret", apiKey.status === 200 && String(apiKey.data?.key || "").startsWith("shironex-"));
  const keyList = await api("GET", "/api/admin/api-keys", null, ownerToken);
  check("Issued key is listed without its secret", keyList.status === 200 && (keyList.data || []).some((entry) => entry.id === apiKey.data?.id) && !JSON.stringify(keyList.data || []).includes(apiKey.data?.key));
  const keyDelete = await api("DELETE", `/api/admin/api-keys/${apiKey.data?.id}`, null, ownerToken);
  check("API key can be revoked", keyDelete.status === 200);

  const promote = await api("PUT", `/api/system/users/${createdUser.data?.id}/role`, { role: "admin" }, ownerToken);
  check("Owner can change a role", promote.status === 200 && promote.data?.role === "admin");
  const nodesAfterPromotion = await api("GET", "/api/nodes", null, userToken);
  check("Role changes apply immediately to an existing session", nodesAfterPromotion.status === 200 && Array.isArray(nodesAfterPromotion.data));
  await api("PUT", `/api/system/users/${createdUser.data?.id}/role`, { role: "user" }, ownerToken);

  const maintenanceOff = await api("PUT", "/api/system/settings", { maintenance: { enabled: false, message: "" } }, ownerToken);
  check("Maintenance mode can be disabled", maintenanceOff.status === 200);
  const unblocked = await api("POST", "/api/servers/does-not-exist/start", null, userToken);
  check("Server mutations are unblocked after maintenance", unblocked.status === 404, `HTTP ${unblocked.status}`);

  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures > 0) process.exit(1);
};

run().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
