import fs from "fs-extra";
import path from "path";
import { ZipArchive } from "archiver";
import { extractZipSafely } from "./archiveSafety.js";

const MAX_WORLD_BYTES = 20 * 1024 * 1024 * 1024;
const WORLD_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9 _.-]{0,63}$/;

export function serverDirectory(serverId: string): string {
  return path.resolve(process.cwd(), ".data", "servers", String(serverId));
}

export function assertWorldName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!WORLD_NAME_RE.test(name) || name === "." || name === ".." || name.includes("..")) {
    throw new Error("World names may use letters, numbers, spaces, dots, dashes and underscores (max 64 characters).");
  }
  return name;
}

export function resolveWorldPath(serverId: string, name: unknown): string {
  const safeName = assertWorldName(name);
  const root = serverDirectory(serverId);
  const target = path.resolve(root, safeName);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("World path escapes the server directory");
  return target;
}

export type WorldRecord = {
  name: string;
  active: boolean;
  hasLevelData: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
};

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(target);
    else if (entry.isFile()) {
      const stats = await fs.stat(target);
      total += stats.size;
      if (total > MAX_WORLD_BYTES) return total;
    }
  }
  return total;
}

/** Minimal, comment-preserving server.properties reader. */
export async function readServerProperties(serverId: string): Promise<Record<string, string>> {
  const file = path.join(serverDirectory(serverId), "server.properties");
  if (!(await fs.pathExists(file))) return {};
  const text = await fs.readFile(file, "utf8");
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1);
  }
  return values;
}

/**
 * Set server.properties keys while retaining unrelated lines and comments.
 * Minecraft rewrites this file on start, so a plain key/value file is valid.
 */
export async function writeServerProperties(serverId: string, updates: Record<string, string>): Promise<void> {
  const root = serverDirectory(serverId);
  await fs.ensureDir(root);
  const file = path.join(root, "server.properties");
  const previous = (await fs.pathExists(file)) ? await fs.readFile(file, "utf8") : "";
  const remaining = new Map(Object.entries(updates));
  const lines = previous.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) return line;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return line;
    const key = trimmed.slice(0, separator).trim();
    if (!remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  const output = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, output, "utf8");
  await fs.rename(temporary, file);
}

export async function getActiveWorldName(serverId: string): Promise<string> {
  const properties = await readServerProperties(serverId);
  return properties["level-name"] || "world";
}

export async function listWorlds(serverId: string): Promise<{ activeWorld: string; worlds: WorldRecord[] }> {
  const root = serverDirectory(serverId);
  await fs.ensureDir(root);
  const activeWorld = await getActiveWorldName(serverId);
  const worlds: WorldRecord[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (entry.name === "plugins" || entry.name === "mods" || entry.name === "config" || entry.name === "logs" || entry.name === "cache" || entry.name === "crash-reports") continue;
    const directory = path.join(root, entry.name);
    const hasLevelData = await fs.pathExists(path.join(directory, "level.dat"));
    if (!hasLevelData) continue;
    const stats = await fs.stat(directory);
    worlds.push({
      name: entry.name,
      active: entry.name === activeWorld,
      hasLevelData,
      sizeBytes: await directorySize(directory),
      modifiedAt: stats.mtime.toISOString(),
    });
  }
  // Nether/end worlds are independent folders but share the active world prefix.
  worlds.sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));
  return { activeWorld, worlds };
}

export type CreateWorldOptions = {
  name: unknown;
  seed?: unknown;
  gamemode?: unknown;
  difficulty?: unknown;
  activate?: boolean;
};

export async function createWorld(serverId: string, options: CreateWorldOptions): Promise<{ name: string; requiresRestart: boolean }> {
  const name = assertWorldName(options.name);
  const target = resolveWorldPath(serverId, name);
  if (await fs.pathExists(target)) throw new Error(`A world named “${name}” already exists. Activate it instead.`);

  const updates: Record<string, string> = {};
  if (options.activate !== false) updates["level-name"] = name;
  const seed = String(options.seed ?? "").trim();
  if (seed) updates["level-seed"] = seed.slice(0, 128);
  const gamemode = String(options.gamemode ?? "").toLowerCase();
  if (["survival", "creative", "adventure", "spectator"].includes(gamemode)) updates["gamemode"] = gamemode;
  const difficulty = String(options.difficulty ?? "").toLowerCase();
  if (["peaceful", "easy", "normal", "hard"].includes(difficulty)) updates["difficulty"] = difficulty;
  await writeServerProperties(serverId, updates);
  // The world directory is generated by the Minecraft server on its next start,
  // unless a world of that name already exists. Nothing is simulated here.
  return { name, requiresRestart: true };
}

export async function activateWorld(serverId: string, name: unknown): Promise<{ activeWorld: string; requiresRestart: boolean }> {
  const safeName = assertWorldName(name);
  const target = resolveWorldPath(serverId, safeName);
  if (!(await fs.pathExists(path.join(target, "level.dat")))) throw new Error("That world does not contain a level.dat file.");
  await writeServerProperties(serverId, { "level-name": safeName });
  return { activeWorld: safeName, requiresRestart: true };
}

export async function deleteWorld(serverId: string, name: unknown): Promise<void> {
  const safeName = assertWorldName(name);
  if (safeName === (await getActiveWorldName(serverId))) throw new Error("The active world cannot be deleted. Activate another world first.");
  const target = resolveWorldPath(serverId, safeName);
  if (!(await fs.pathExists(target))) throw new Error("World not found.");
  await fs.remove(target);
}

export async function duplicateWorld(serverId: string, name: unknown, targetName: unknown): Promise<{ name: string }> {
  const source = resolveWorldPath(serverId, name);
  const destinationName = assertWorldName(targetName);
  const destination = resolveWorldPath(serverId, destinationName);
  if (!(await fs.pathExists(path.join(source, "level.dat")))) throw new Error("Source world not found.");
  if (await fs.pathExists(destination)) throw new Error(`A world named “${destinationName}” already exists.`);
  await fs.copy(source, destination, { errorOnExist: true, overwrite: false });
  return { name: destinationName };
}

/** Zip a world into the server's managed backup directory. */
export async function archiveWorld(serverId: string, name: unknown): Promise<{ filename: string; size: number }> {
  const safeName = assertWorldName(name);
  const source = resolveWorldPath(serverId, safeName);
  if (!(await fs.pathExists(path.join(source, "level.dat")))) throw new Error("World not found.");
  const targetDirectory = path.resolve(process.cwd(), ".data", "backups", String(serverId));
  await fs.ensureDir(targetDirectory);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `world-${safeName}-${stamp}.zip`;
  const target = path.join(targetDirectory, filename);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(target);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(source, safeName);
    void archive.finalize();
  });
  const stats = await fs.stat(target);
  return { filename, size: stats.size };
}

/** Download a world as a ZIP stream. The caller owns the response lifecycle. */
export async function streamWorldZip(serverId: string, name: unknown): Promise<{ archive: ZipArchive; filename: string }> {
  const safeName = assertWorldName(name);
  const source = resolveWorldPath(serverId, safeName);
  if (!(await fs.pathExists(path.join(source, "level.dat")))) throw new Error("World not found.");
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.directory(source, safeName);
  return { archive, filename: `${safeName}.zip` };
}

/**
 * Import an uploaded ZIP as a world. The archive may contain level.dat at its
 * root or inside one top-level folder (the usual "world/" shape).
 */
export async function importWorldArchive(serverId: string, archivePath: string, requestedName?: unknown): Promise<{ name: string }> {
  const root = serverDirectory(serverId);
  await fs.ensureDir(root);
  const staging = path.join(process.cwd(), ".data", "temp", `world-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    await extractZipSafely(archivePath, staging);
    let source = staging;
    if (!(await fs.pathExists(path.join(source, "level.dat")))) {
      const entries = (await fs.readdir(staging, { withFileTypes: true })).filter((entry) => entry.isDirectory());
      if (entries.length === 1 && (await fs.pathExists(path.join(staging, entries[0].name, "level.dat")))) {
        source = path.join(staging, entries[0].name);
      }
    }
    if (!(await fs.pathExists(path.join(source, "level.dat")))) throw new Error("The archive does not contain a Minecraft level.dat file.");
    const fallback = path.basename(source) === path.basename(staging) ? "imported-world" : path.basename(source);
    const name = assertWorldName(requestedName || fallback);
    const destination = resolveWorldPath(serverId, name);
    if (await fs.pathExists(destination)) throw new Error(`A world named “${name}” already exists.`);
    await fs.move(source, destination, { overwrite: false });
    return { name };
  } finally {
    await fs.remove(staging).catch(() => undefined);
  }
}
