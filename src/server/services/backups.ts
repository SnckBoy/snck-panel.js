import fs from "fs-extra";
import path from "path";
import { ZipArchive } from "archiver";
import { listSafeZipEntries, extractZipSafely } from "./archiveSafety.js";
import { serverDirectory } from "./worlds.js";

const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.zip$/;

export function backupsDirectory(serverId: string): string {
  return path.resolve(process.cwd(), ".data", "backups", String(serverId));
}

export function assertBackupFilename(value: unknown): string {
  const filename = path.basename(String(value ?? ""));
  if (!FILENAME_RE.test(filename)) throw new Error("Invalid backup filename.");
  return filename;
}

export function resolveBackupFile(serverId: string, filename: unknown): string {
  const safe = assertBackupFilename(filename);
  const directory = backupsDirectory(serverId);
  const target = path.resolve(directory, safe);
  if (!target.startsWith(`${directory}${path.sep}`)) throw new Error("Backup path escapes the backup directory.");
  return target;
}

export type BackupRecord = { filename: string; size: number; createdAt: string };

export async function listBackups(serverId: string): Promise<BackupRecord[]> {
  const directory = backupsDirectory(serverId);
  await fs.ensureDir(directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const records: BackupRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".zip") || !FILENAME_RE.test(entry.name)) continue;
    const stats = await fs.stat(path.join(directory, entry.name));
    records.push({ filename: entry.name, size: stats.size, createdAt: stats.birthtime.toISOString() });
  }
  records.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.filename.localeCompare(left.filename));
  return records;
}

export type CreateBackupResult = { filename: string; size: number; createdAt: string };

export async function createBackupArchive(serverId: string, prefix = "backup"): Promise<CreateBackupResult> {
  const source = serverDirectory(serverId);
  await fs.ensureDir(source);
  const directory = backupsDirectory(serverId);
  await fs.ensureDir(directory);
  const safePrefix = prefix.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40) || "backup";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${safePrefix}-${stamp}.zip`;
  const target = path.join(directory, filename);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(target);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(source, false);
    void archive.finalize();
  });

  const stats = await fs.stat(target);
  return { filename, size: stats.size, createdAt: stats.birthtime.toISOString() };
}

/** Remove oldest archives beyond the retention count. Returns deleted filenames. */
export async function pruneBackups(serverId: string, retention: number): Promise<string[]> {
  const keep = Math.floor(Number(retention));
  if (!Number.isFinite(keep) || keep < 1) return [];
  const records = await listBackups(serverId);
  const surplus = records.slice(keep);
  for (const record of surplus) {
    await fs.remove(resolveBackupFile(serverId, record.filename)).catch(() => undefined);
  }
  return surplus.map((record) => record.filename);
}

export type BackupVerification = {
  valid: boolean;
  filename: string;
  size: number;
  entries: number;
  hasServerProperties: boolean;
  hasLevelData: boolean;
};

export async function verifyBackup(serverId: string, filename: unknown): Promise<BackupVerification> {
  const target = resolveBackupFile(serverId, filename);
  if (!(await fs.pathExists(target))) throw new Error("Backup not found.");
  const stats = await fs.stat(target);
  const entries = await listSafeZipEntries(target);
  return {
    valid: entries.length > 0,
    filename: path.basename(target),
    size: stats.size,
    entries: entries.length,
    hasServerProperties: entries.some((entry) => entry === "server.properties" || entry.endsWith("/server.properties")),
    hasLevelData: entries.some((entry) => entry === "level.dat" || entry.endsWith("/level.dat")),
  };
}

/**
 * Replace the server directory with the backup contents. The caller must stop
 * the server first; this function refuses nothing on its own because the route
 * enforces the running-state check against the authoritative server record.
 */
export async function restoreBackup(serverId: string, filename: unknown): Promise<{ restoredFiles: number; safetyBackup: string }> {
  const target = resolveBackupFile(serverId, filename);
  if (!(await fs.pathExists(target))) throw new Error("Backup not found.");
  await listSafeZipEntries(target);

  const safety = await createBackupArchive(serverId, "pre-restore");
  const staging = path.join(process.cwd(), ".data", "temp", `restore-${serverId}-${Date.now()}`);
  try {
    const entries = await extractZipSafely(target, staging);
    const serverRoot = serverDirectory(serverId);
    await fs.ensureDir(serverRoot);
    const existing = await fs.readdir(serverRoot);
    for (const entry of existing) await fs.remove(path.join(serverRoot, entry));
    const restored = await fs.readdir(staging);
    for (const entry of restored) await fs.move(path.join(staging, entry), path.join(serverRoot, entry), { overwrite: true });
    return { restoredFiles: entries.length, safetyBackup: safety.filename };
  } finally {
    await fs.remove(staging).catch(() => undefined);
  }
}
