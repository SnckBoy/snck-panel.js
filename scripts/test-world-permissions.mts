/**
 * HTTP integration tests for per-server authorization.
 *
 * Every request goes through the real Express router, the real JWT
 * authentication middleware and the real controllers; only the filesystem
 * state and the user/server records are fixtures.
 *
 * Covered principals: admin, server owner, read-only sub-user, world
 * sub-user, backup sub-users (read/create/restore/delete), no-permission
 * sub-user, user with a malformed permission value, unrelated user and an
 * unauthenticated caller.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import express from "express";
import { ZipArchive } from "archiver";

const originalCwd = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snck-perms-"));
process.env.JWT_SECRET = "server-perms-test-jwt-secret-long-enough";
process.env.NODE_ENCRYPTION_KEY = "server-perms-test-encryption-key";
process.chdir(tempDir);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let server: any;
let checks = 0;

const makeZip = async (entries: Record<string, string>): Promise<Buffer> => {
  const archive = new ZipArchive({ zlib: { level: 1 } });
  const collected: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => collected.push(Buffer.from(chunk)));
    archive.on("end", () => resolve(Buffer.concat(collected)));
    archive.on("error", reject);
  });
  for (const [name, content] of Object.entries(entries)) archive.append(Buffer.from(content), { name });
  await archive.finalize();
  return finished;
};

try {
  const dataDir = path.join(tempDir, ".data");
  const serverDir = path.join(dataDir, "servers", "srv1");
  await fs.mkdir(path.join(serverDir, "world", "region"), { recursive: true });
  await fs.writeFile(path.join(serverDir, "world", "level.dat"), "world-level");
  await fs.writeFile(path.join(serverDir, "world", "region", "r.0.0.mca"), "region");
  await fs.mkdir(path.join(serverDir, "inactive"), { recursive: true });
  await fs.writeFile(path.join(serverDir, "inactive", "level.dat"), "inactive-level");
  for (const trash of ["trash-worldmgr", "trash-readonly", "trash-admin"]) {
    await fs.mkdir(path.join(serverDir, trash), { recursive: true });
    await fs.writeFile(path.join(serverDir, trash, "level.dat"), trash);
  }
  await fs.writeFile(path.join(serverDir, "server.properties"), "level-name=world\nmotd=permission test\n");

  const ids = {
    admin: "admin-1",
    owner: "owner-1",
    readonly: "readonly-1",
    world: "world-1",
    worldLegacy: "world-legacy-1",
    backupRead: "backup-read-1",
    backupCreate: "backup-create-1",
    backupRestore: "backup-restore-1",
    backupDelete: "backup-delete-1",
    backupLegacy: "backup-legacy-1",
    none: "none-1",
    malformed: "malformed-1",
    foreign: "foreign-1",
  };

  const users = Object.entries(ids).map(([name, id]) => ({
    id,
    username: name,
    role: name === "admin" ? "admin" : "user",
    passwordVersion: 0,
  }));
  await fs.writeFile(path.join(dataDir, "users.json"), JSON.stringify(users));

  const serverRecord = {
    id: "srv1",
    name: "Permission Test Server",
    owner: ids.owner,
    nodeId: "local",
    status: "offline",
    containerId: null,
    subUsers: [
      { userId: ids.readonly, permissions: ["files"] },
      { userId: ids.world, permissions: ["worlds.manage"] },
      { userId: ids.worldLegacy, permissions: ["worlds"] },
      { userId: ids.backupRead, permissions: ["backups.read"] },
      { userId: ids.backupCreate, permissions: ["backups.create"] },
      { userId: ids.backupRestore, permissions: ["backups.restore"] },
      { userId: ids.backupDelete, permissions: ["backups.delete"] },
      { userId: ids.backupLegacy, permissions: ["backup"] },
      { userId: ids.none, permissions: [] },
      // Malformed grants (a bare string instead of an array) must never allow anything.
      { userId: ids.malformed, permissions: "worlds.manage" },
    ],
  };
  await fs.writeFile(path.join(dataDir, "servers.json"), JSON.stringify([serverRecord]));
  await fs.writeFile(path.join(dataDir, "nodes.json"), JSON.stringify([]));
  await fs.writeFile(path.join(dataDir, "allocations.json"), JSON.stringify([]));

  const serverRoutes = (await import(path.join(root, "src/server/routes/servers.ts"))).default;
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/servers", serverRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const tokenFor = (id: string, role: string) => jwt.sign({ id, role, passwordVersion: 0 }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  const headers = (id: string, role = "user") => ({ Authorization: `Bearer ${tokenFor(id, role)}` });
  const as = {
    admin: headers(ids.admin, "admin"),
    owner: headers(ids.owner),
    readonly: headers(ids.readonly),
    world: headers(ids.world),
    worldLegacy: headers(ids.worldLegacy),
    backupRead: headers(ids.backupRead),
    backupCreate: headers(ids.backupCreate),
    backupRestore: headers(ids.backupRestore),
    backupDelete: headers(ids.backupDelete),
    backupLegacy: headers(ids.backupLegacy),
    none: headers(ids.none),
    malformed: headers(ids.malformed),
    foreign: headers(ids.foreign),
    anonymous: {},
  };

  type Call = { method: string; url: string; headers: Record<string, string>; body?: any; form?: FormData; binary?: boolean };
  const send = async ({ method, url, headers: requestHeaders, body, form, binary }: Call) => {
    const init: any = { method, headers: { ...requestHeaders } };
    if (form) init.body = form;
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
    const response = await fetch(`${base}${url}`, init);
    let payload: any = null;
    if (!binary) {
      const text = await response.text();
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    } else {
      await response.arrayBuffer();
    }
    return { status: response.status, body: payload };
  };

  const expectStatus = async (label: string, call: Call, expected: number | number[]) => {
    const result = await send(call);
    checks += 1;
    const accepted = Array.isArray(expected) ? expected.includes(result.status) : result.status === expected;
    if (!accepted) {
      throw new Error(`${label}: expected ${String(expected)} but got ${result.status} ${JSON.stringify(result.body)?.slice(0, 300)}`);
    }
    return result;
  };

  const url = (suffix: string) => `/api/servers/srv1${suffix}`;
  const tempDirectory = path.join(dataDir, "temp");
  const tempEntries = async () => (await fs.readdir(tempDirectory).catch(() => [])).filter((entry) => !entry.startsWith("uploads") && !entry.startsWith("restore-"));
  const waitForCleanTemp = async (label: string) => {
    let entries = await tempEntries();
    for (let attempt = 0; attempt < 20 && entries.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      entries = await tempEntries();
    }
    assert.deepEqual(entries, [], label);
  };

  // ---------------------------------------------------------------------
  // Fixtures: create the backups used by the read/verify/delete/restore tests.
  // ---------------------------------------------------------------------
  const originalBackup = (await expectStatus("admin creates the source backup", { method: "POST", url: url("/backups"), headers: as.admin }, 200)).body.filename;
  assert.ok(originalBackup, "source backup filename is returned");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const deleteTarget = (await expectStatus("admin creates the delete-target backup", { method: "POST", url: url("/backups"), headers: as.admin }, 200)).body.filename;
  assert.ok(deleteTarget && deleteTarget !== originalBackup, "delete-target backup has a distinct filename");

  const worldArchive = await makeZip({ "level.dat": "imported-level", "region/r.0.0.mca": "imported-region" });
  const worldForm = (name: string) => {
    const form = new FormData();
    form.append("archive", new Blob([new Uint8Array(worldArchive)], { type: "application/zip" }), "world.zip");
    form.append("name", name);
    return form;
  };

  // ---------------------------------------------------------------------
  // World reads: listing and download require a read permission.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["admin", as.admin], ["owner", as.owner], ["read-only", as.readonly], ["worlds.manage", as.world], ["legacy worlds", as.worldLegacy]]) {
    await expectStatus(`${label} lists worlds`, { method: "GET", url: url("/worlds"), headers: header }, 200);
    await expectStatus(`${label} downloads a world`, { method: "GET", url: url("/worlds/world/download"), headers: header, binary: true }, 200);
  }
  for (const [label, header] of [["backups.read", as.backupRead], ["backups.create", as.backupCreate], ["backups.restore", as.backupRestore], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot list worlds`, { method: "GET", url: url("/worlds"), headers: header }, 403);
    await expectStatus(`${label} cannot download a world`, { method: "GET", url: url("/worlds/world/download"), headers: header }, 403);
  }
  await expectStatus("unauthenticated world list", { method: "GET", url: url("/worlds"), headers: as.anonymous }, 401);
  await expectStatus("unauthenticated world download", { method: "GET", url: url("/worlds/world/download"), headers: as.anonymous }, 401);

  // ---------------------------------------------------------------------
  // World mutations require worlds.manage.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["read-only", as.readonly], ["backups.read", as.backupRead], ["backups.create", as.backupCreate], ["backups.delete", as.backupDelete], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot create a world`, { method: "POST", url: url("/worlds"), headers: header, body: { name: "denied-world" } }, 403);
    await expectStatus(`${label} cannot activate a world`, { method: "POST", url: url("/worlds/inactive/activate"), headers: header }, 403);
    await expectStatus(`${label} cannot duplicate a world`, { method: "POST", url: url("/worlds/world/duplicate"), headers: header, body: { targetName: "denied-copy" } }, 403);
    await expectStatus(`${label} cannot archive a world`, { method: "POST", url: url("/worlds/world/backup"), headers: header }, 403);
    await expectStatus(`${label} cannot delete a world`, { method: "DELETE", url: url("/worlds/trash-readonly"), headers: header }, 403);
    await expectStatus(`${label} cannot import a world`, { method: "POST", url: url("/worlds/import"), headers: header, form: worldForm("denied-import") }, 403);
  }
  await expectStatus("unauthenticated world create", { method: "POST", url: url("/worlds"), headers: as.anonymous, body: { name: "nope" } }, 401);
  await expectStatus("unauthenticated world import", { method: "POST", url: url("/worlds/import"), headers: as.anonymous, form: worldForm("nope") }, 401);
  await waitForCleanTemp("rejected world uploads never leave files in the temp directory");

  for (const [label, header, name] of [["worlds.manage", as.world, "wm-world"], ["legacy worlds", as.worldLegacy, "legacy-world"], ["admin", as.admin, "admin-world"], ["owner", as.owner, "owner-world"]]) {
    await expectStatus(`${label} creates a world`, { method: "POST", url: url("/worlds"), headers: header, body: { name } }, 200);
  }
  await expectStatus("worlds.manage activates a world", { method: "POST", url: url("/worlds/inactive/activate"), headers: as.world }, 200);
  await expectStatus("worlds.manage duplicates a world", { method: "POST", url: url("/worlds/world/duplicate"), headers: as.world, body: { targetName: "copy-worldmgr" } }, 200);
  await expectStatus("worlds.manage archives a world", { method: "POST", url: url("/worlds/world/backup"), headers: as.world }, 200);
  await expectStatus("worlds.manage deletes a world", { method: "DELETE", url: url("/worlds/trash-worldmgr"), headers: as.world }, 200);
  await expectStatus("admin deletes a world", { method: "DELETE", url: url("/worlds/trash-admin"), headers: as.admin }, 200);
  await expectStatus("worlds.manage imports a world", { method: "POST", url: url("/worlds/import"), headers: as.world, form: worldForm("imported-wm") }, 200);
  await waitForCleanTemp("authorized world import cleans up its temp upload");

  // ---------------------------------------------------------------------
  // Backup listing and download require backups.read.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["admin", as.admin], ["owner", as.owner], ["backups.read", as.backupRead], ["legacy backup", as.backupLegacy]]) {
    await expectStatus(`${label} lists backups`, { method: "GET", url: url("/backups"), headers: header }, 200);
    await expectStatus(`${label} downloads a backup`, { method: "GET", url: url(`/backups/${originalBackup}`), headers: header, binary: true }, 200);
  }
  for (const [label, header] of [["backups.create", as.backupCreate], ["backups.restore", as.backupRestore], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot list backups`, { method: "GET", url: url("/backups"), headers: header }, 403);
    await expectStatus(`${label} cannot download a backup`, { method: "GET", url: url(`/backups/${originalBackup}`), headers: header }, 403);
  }
  await expectStatus("unauthenticated backup list", { method: "GET", url: url("/backups"), headers: as.anonymous }, 401);
  await expectStatus("unauthenticated backup download", { method: "GET", url: url(`/backups/${originalBackup}`), headers: as.anonymous }, 401);

  // ---------------------------------------------------------------------
  // Backup creation requires backups.create.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["backups.create", as.backupCreate], ["legacy backup", as.backupLegacy], ["admin", as.admin], ["owner", as.owner]]) {
    await expectStatus(`${label} creates a backup`, { method: "POST", url: url("/backups"), headers: header }, 200);
  }
  for (const [label, header] of [["backups.read", as.backupRead], ["backups.restore", as.backupRestore], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot create a backup`, { method: "POST", url: url("/backups"), headers: header }, 403);
  }
  await expectStatus("unauthenticated backup create", { method: "POST", url: url("/backups"), headers: as.anonymous }, 401);

  // ---------------------------------------------------------------------
  // Verification requires backups.read.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["admin", as.admin], ["backups.read", as.backupRead], ["legacy backup", as.backupLegacy]]) {
    await expectStatus(`${label} verifies a backup`, { method: "POST", url: url(`/backups/${originalBackup}/verify`), headers: header }, 200);
  }
  for (const [label, header] of [["backups.create", as.backupCreate], ["backups.restore", as.backupRestore], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot verify a backup`, { method: "POST", url: url(`/backups/${originalBackup}/verify`), headers: header }, 403);
  }
  await expectStatus("unauthenticated backup verify", { method: "POST", url: url(`/backups/${originalBackup}/verify`), headers: as.anonymous }, 401);

  // ---------------------------------------------------------------------
  // Deletion requires backups.delete.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["backups.read", as.backupRead], ["backups.create", as.backupCreate], ["backups.restore", as.backupRestore], ["read-only", as.readonly], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot delete a backup`, { method: "DELETE", url: url(`/backups/${deleteTarget}`), headers: header }, 403);
  }
  await expectStatus("unauthenticated backup delete", { method: "DELETE", url: url(`/backups/${deleteTarget}`), headers: as.anonymous }, 401);
  assert.ok((await expectStatus("backups.delete deletes a backup", { method: "DELETE", url: url(`/backups/${deleteTarget}`), headers: as.backupDelete }, 200)), "delete succeeded");
  const legacyDeleteTarget = (await expectStatus("admin creates a legacy delete target", { method: "POST", url: url("/backups"), headers: as.admin }, 200)).body.filename;
  await expectStatus("legacy backup grant deletes a backup", { method: "DELETE", url: url(`/backups/${legacyDeleteTarget}`), headers: as.backupLegacy }, 200);

  // ---------------------------------------------------------------------
  // Schedule reading requires backups.read. Running a scheduled backup requires
  // backups.create, but changing or deleting the schedule stays owner/staff-only.
  // ---------------------------------------------------------------------
  for (const [label, header] of [["admin", as.admin], ["owner", as.owner], ["backups.read", as.backupRead], ["legacy backup", as.backupLegacy]]) {
    await expectStatus(`${label} reads the backup schedule`, { method: "GET", url: url("/backup-schedule"), headers: header }, 200);
  }
  for (const [label, header] of [["backups.create", as.backupCreate], ["backups.restore", as.backupRestore], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot read the backup schedule`, { method: "GET", url: url("/backup-schedule"), headers: header }, 403);
  }
  // Nobody but the owner or staff may redefine or delete the schedule, even a
  // sub-user who can create and run backups.
  for (const [label, header] of [["backups.read", as.backupRead], ["backups.create", as.backupCreate], ["legacy backup", as.backupLegacy], ["backups.restore", as.backupRestore], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot change the backup schedule`, { method: "PUT", url: url("/backup-schedule"), headers: header, body: { enabled: true, intervalHours: 6, retention: 3 } }, 403);
    await expectStatus(`${label} cannot delete the backup schedule`, { method: "DELETE", url: url("/backup-schedule"), headers: header }, 403);
  }
  for (const [label, header] of [["backups.read", as.backupRead], ["backups.restore", as.backupRestore], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot run a scheduled backup`, { method: "POST", url: url("/backup-schedule/run"), headers: header }, 403);
  }
  await expectStatus("unauthenticated schedule read", { method: "GET", url: url("/backup-schedule"), headers: as.anonymous }, 401);
  await expectStatus("unauthenticated schedule change", { method: "PUT", url: url("/backup-schedule"), headers: as.anonymous, body: { enabled: true, intervalHours: 6, retention: 3 } }, 401);
  await expectStatus("unauthenticated scheduled run", { method: "POST", url: url("/backup-schedule/run"), headers: as.anonymous }, 401);

  const schedule = { enabled: true, intervalHours: 6, retention: 3 };
  for (const [label, header] of [["admin", as.admin], ["owner", as.owner]]) {
    await expectStatus(`${label} changes the backup schedule`, { method: "PUT", url: url("/backup-schedule"), headers: header, body: schedule }, 200);
  }
  for (const [label, header] of [["backups.create", as.backupCreate], ["admin", as.admin]]) {
    await expectStatus(`${label} runs a scheduled backup`, { method: "POST", url: url("/backup-schedule/run"), headers: header }, 200);
  }
  await expectStatus("owner runs a scheduled backup", { method: "POST", url: url("/backup-schedule/run"), headers: as.owner }, 200);
  for (const [label, header] of [["admin", as.admin], ["owner", as.owner]]) {
    await expectStatus(`${label} deletes the backup schedule`, { method: "DELETE", url: url("/backup-schedule"), headers: header }, 200);
  }

  // ---------------------------------------------------------------------
  // Restore requires backups.restore. Run last because it replaces the
  // server directory with the archive contents.
  // ---------------------------------------------------------------------
  // Scheduling retention above pruned the earliest archives, so take a fresh one.
  const restoreTarget = (await expectStatus("admin creates the restore target", { method: "POST", url: url("/backups"), headers: as.admin }, 200)).body.filename;
  for (const [label, header] of [["backups.read", as.backupRead], ["backups.create", as.backupCreate], ["backups.delete", as.backupDelete], ["read-only", as.readonly], ["no permissions", as.none], ["malformed permissions", as.malformed], ["unrelated", as.foreign]]) {
    await expectStatus(`${label} cannot restore a backup`, { method: "POST", url: url(`/backups/${restoreTarget}/restore`), headers: header }, 403);
  }
  await expectStatus("unauthenticated backup restore", { method: "POST", url: url(`/backups/${restoreTarget}/restore`), headers: as.anonymous }, 401);
  for (const [label, header] of [["backups.restore", as.backupRestore], ["admin", as.admin], ["owner", as.owner]]) {
    await expectStatus(`${label} restores a backup`, { method: "POST", url: url(`/backups/${restoreTarget}/restore`), headers: header }, 200);
  }
  // The restored archive brings the original world back, and world readers still work.
  const restored = await expectStatus("read-only lists worlds after restore", { method: "GET", url: url("/worlds"), headers: as.readonly }, 200);
  assert.ok(Array.isArray(restored.body?.worlds), "restored world listing is returned");

  // Unsupported remote nodes still answer 409 for an authorized caller rather than 403.
  const servers = JSON.parse(await fs.readFile(path.join(dataDir, "servers.json"), "utf8"));
  servers[0].nodeId = "node-remote";
  await fs.writeFile(path.join(dataDir, "servers.json"), JSON.stringify(servers));
  await expectStatus("authorized caller on a remote node gets 409", { method: "GET", url: url("/worlds"), headers: as.world }, 409);

  console.log(`World and backup permission security tests: PASS (${checks} HTTP assertions)`);
} finally {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
}
