import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { listWorlds, createWorld, activateWorld, duplicateWorld, archiveWorld, importWorldArchive, deleteWorld, readServerProperties, assertWorldName, resolveWorldPath } from "../src/server/services/worlds.js";
import { createBackupArchive, listBackups, pruneBackups, verifyBackup, restoreBackup } from "../src/server/services/backups.js";
import { saveBackupSchedule, getBackupSchedule, runScheduledBackup, stopBackupScheduler } from "../src/server/services/backupScheduler.js";
import { readJSON, writeJSON } from "../src/server/services/db.js";

const execFileAsync = promisify(execFile);
const originalCwd = process.cwd();
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "snck-worlds-backups-"));
let checks = 0;
const check = (label: string, condition: boolean) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`  ✓ ${label}`);
};

try {
  process.chdir(workspace);
  const serverId = "server-test";
  const serverRoot = path.join(workspace, ".data", "servers", serverId);
  await fs.ensureDir(path.join(serverRoot, "world"));
  await fs.outputFile(path.join(serverRoot, "world", "level.dat"), "level");
  await fs.outputFile(path.join(serverRoot, "world", "region", "r.0.0.mca"), "regions");
  await fs.ensureDir(path.join(serverRoot, "world_nether"));
  await fs.outputFile(path.join(serverRoot, "world_nether", "level.dat"), "nether");
  await fs.outputFile(path.join(serverRoot, "server.properties"), "# managed by Minecraft\nlevel-name=world\nmotd=SNCK test\nmax-players=20\n");
  await writeJSON("servers.json", [{ id: serverId, name: "Test", nodeId: "local", status: "offline", owner: "u1" }]);

  console.log("Worlds");
  const listing = await listWorlds(serverId);
  check("lists only folders containing level.dat", listing.worlds.length === 2 && listing.worlds.every((world) => world.hasLevelData));
  check("detects the active world from server.properties", listing.activeWorld === "world" && listing.worlds.find((world) => world.active)?.name === "world");

  await createWorld(serverId, { name: "fresh", seed: "12345", gamemode: "creative", difficulty: "hard" });
  const properties = await readServerProperties(serverId);
  check("new world activates through server.properties", properties["level-name"] === "fresh");
  check("seed, game mode and difficulty are persisted", properties["level-seed"] === "12345" && properties.gamemode === "creative" && properties.difficulty === "hard");
  check("unrelated properties and comments are preserved", properties.motd === "SNCK test" && (await fs.readFile(path.join(serverRoot, "server.properties"), "utf8")).includes("# managed by Minecraft"));

  await fs.ensureDir(path.join(serverRoot, "fresh"));
  await fs.outputFile(path.join(serverRoot, "fresh", "level.dat"), "fresh-level");
  const activation = await activateWorld(serverId, "fresh");
  check("activate switches the level name", activation.activeWorld === "fresh" && (await readServerProperties(serverId))["level-name"] === "fresh");

  await duplicateWorld(serverId, "world", "world-copy");
  check("duplicate copies the entire world", await fs.pathExists(path.join(serverRoot, "world-copy", "region", "r.0.0.mca")));

  await assert.rejects(() => activateWorld(serverId, "../etc"), /World names/);
  assert.throws(() => assertWorldName("../escape"), /World names/);
  assert.throws(() => resolveWorldPath(serverId, ".."), /World names/);
  assert.throws(() => assertWorldName("bad/name"), /World names/);
  check("path traversal names are rejected", true);

  const archivedWorld = await archiveWorld(serverId, "world");
  check("world archive lands in managed backups", await fs.pathExists(path.join(workspace, ".data", "backups", serverId, archivedWorld.filename)));

  const staging = path.join(workspace, "staging-world");
  await fs.ensureDir(staging);
  await fs.outputFile(path.join(staging, "level.dat"), "imported");
  const zipPath = path.join(workspace, "import.zip");
  await execFileAsync("zip", ["-q", "-r", zipPath, "."], { cwd: staging });
  const imported = await importWorldArchive(serverId, zipPath, "imported-world");
  check("world import extracts a validated archive", imported.name === "imported-world" && (await fs.pathExists(path.join(serverRoot, "imported-world", "level.dat"))));
  await assert.rejects(() => importWorldArchive(serverId, zipPath, "imported-world"), /already exists/);
  check("import refuses to overwrite an existing world", true);

  await deleteWorld(serverId, "world-copy");
  check("delete removes an inactive world", !(await fs.pathExists(path.join(serverRoot, "world-copy"))));
  await assert.rejects(() => deleteWorld(serverId, "fresh"), /active world/);
  check("active world cannot be deleted", true);

  console.log("Backups");
  const first = await createBackupArchive(serverId);
  check("backup archive is created", (await listBackups(serverId)).some((backup) => backup.filename === first.filename));
  const verification = await verifyBackup(serverId, first.filename);
  check("verification reports entries and level data", verification.valid && verification.entries > 0 && verification.hasLevelData && verification.hasServerProperties);

  await fs.writeFile(path.join(serverRoot, "marker.txt"), "created after backup");
  await fs.writeFile(path.join(serverRoot, "server.properties"), "level-name=corrupted\n");
  const restore = await restoreBackup(serverId, first.filename);
  check("restore replaces server files with archive contents", restore.restoredFiles > 0 && !(await fs.pathExists(path.join(serverRoot, "marker.txt"))));
  check("restore recovers server.properties", (await readServerProperties(serverId))["level-name"] === "fresh");
  check("restore writes a pre-restore safety backup", (await listBackups(serverId)).some((backup) => backup.filename === restore.safetyBackup));

  const second = await createBackupArchive(serverId);
  const pruned = await pruneBackups(serverId, 1);
  const remaining = await listBackups(serverId);
  check("retention deletes older archives", pruned.length >= 1 && remaining.length === 1 && remaining[0].filename === second.filename);

  console.log("Scheduler");
  const saved = await saveBackupSchedule(serverId, { enabled: true, intervalHours: 6, retention: 2 });
  check("schedule validates and stores a next run", saved.enabled && saved.intervalHours === 6 && saved.retention === 2 && Boolean(saved.nextRunAt));
  await assert.rejects(() => saveBackupSchedule(serverId, { enabled: true, intervalHours: 0, retention: 2 }), /interval/i);
  await assert.rejects(() => saveBackupSchedule(serverId, { enabled: true, intervalHours: 6, retention: 0 }), /retention/i);
  check("invalid schedules are rejected", true);

  const scheduled = await runScheduledBackup(serverId);
  check("scheduled run creates a backup", (await listBackups(serverId)).some((backup) => backup.filename === scheduled.filename));
  const afterRun = await getBackupSchedule(serverId);
  check("scheduled run records success and the next run", afterRun.lastStatus === "success" && afterRun.lastFilename === scheduled.filename && Boolean(afterRun.nextRunAt));
  check("scheduled retention is applied", (await listBackups(serverId)).length <= 2);

  await writeJSON("servers.json", []);
  await assert.rejects(() => runScheduledBackup(serverId), /no longer exists/);
  check("scheduler reports a missing server instead of writing silently", (await getBackupSchedule(serverId)).lastStatus === "failed");

  console.log(`\n${checks} checks passed.`);
} finally {
  stopBackupScheduler();
  process.chdir(originalCwd);
  await fs.remove(workspace);
}
