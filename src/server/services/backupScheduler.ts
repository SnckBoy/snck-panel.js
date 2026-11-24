import fs from "fs-extra";
import path from "path";
import { readJSON, writeJSON, updateJSON } from "./db.js";
import { createBackupArchive, pruneBackups } from "./backups.js";

export type BackupSchedule = {
  enabled: boolean;
  intervalHours: number;
  retention: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: "never" | "success" | "failed";
  lastFilename: string | null;
  lastError: string | null;
};

const STORE = "backup_schedules.json";
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 24 * 365;
const MAX_RETENTION = 365;
const running = new Set<string>();
let timer: NodeJS.Timeout | null = null;

export const defaultSchedule = (): BackupSchedule => ({
  enabled: false,
  intervalHours: 24,
  retention: 7,
  lastRunAt: null,
  nextRunAt: null,
  lastStatus: "never",
  lastFilename: null,
  lastError: null,
});

export function normalizeSchedule(input: any, previous: BackupSchedule = defaultSchedule()): BackupSchedule {
  const enabled = Boolean(input?.enabled);
  const interval = Math.floor(Number(input?.intervalHours));
  const retention = Math.floor(Number(input?.retention));
  if (!Number.isFinite(interval) || interval < MIN_INTERVAL_HOURS || interval > MAX_INTERVAL_HOURS) {
    throw new Error(`Backup interval must be a whole number of hours between ${MIN_INTERVAL_HOURS} and ${MAX_INTERVAL_HOURS}.`);
  }
  if (!Number.isFinite(retention) || retention < 1 || retention > MAX_RETENTION) {
    throw new Error(`Backup retention must be between 1 and ${MAX_RETENTION} archives.`);
  }
  const nextRunAt = enabled
    ? previous.nextRunAt && previous.enabled && previous.intervalHours === interval
      ? previous.nextRunAt
      : new Date(Date.now() + interval * 3_600_000).toISOString()
    : null;
  return {
    ...previous,
    enabled,
    intervalHours: interval,
    retention,
    nextRunAt,
    lastError: enabled ? previous.lastError : null,
  };
}

export async function readScheduleStore(): Promise<Record<string, BackupSchedule>> {
  const stored = await readJSON(STORE);
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, BackupSchedule> : {};
}

export async function getBackupSchedule(serverId: string): Promise<BackupSchedule> {
  const store = await readScheduleStore();
  return { ...defaultSchedule(), ...(store[serverId] || {}) };
}

export async function saveBackupSchedule(serverId: string, input: any): Promise<BackupSchedule> {
  const previous = await getBackupSchedule(serverId);
  const normalized = normalizeSchedule(input, previous);
  await updateJSON<Record<string, BackupSchedule>>(STORE, (store) => {
    const next = store && typeof store === "object" && !Array.isArray(store) ? store : {};
    next[serverId] = normalized;
    return next;
  }, {});
  return normalized;
}

export async function removeBackupSchedule(serverId: string): Promise<void> {
  await updateJSON<Record<string, BackupSchedule>>(STORE, (store) => {
    const next = store && typeof store === "object" && !Array.isArray(store) ? store : {};
    delete next[serverId];
    return next;
  }, {});
}

export type ScheduledBackupResult = { filename: string; pruned: string[]; schedule: BackupSchedule };

/**
 * Run one scheduled backup immediately and persist its outcome. The backup is
 * only attempted for servers owned by the local node, because the panel host
 * owns the filesystem these archives are built from.
 */
export async function runScheduledBackup(serverId: string): Promise<ScheduledBackupResult> {
  if (running.has(serverId)) throw new Error("A backup for this server is already running.");
  running.add(serverId);
  const schedule = await getBackupSchedule(serverId);
  try {
    const servers = await readJSON("servers.json") || [];
    const server = Array.isArray(servers) ? servers.find((candidate: any) => String(candidate.id) === String(serverId)) : null;
    if (!server) throw new Error("Server no longer exists; the schedule was left untouched so it can be reviewed.");
    if (server.nodeId && server.nodeId !== "local") {
      throw new Error("Scheduled archives are built on the panel node. Create backups from the node-local file path or use the manual backup action for remote nodes.");
    }
    const archive = await createBackupArchive(serverId, "scheduled");
    const pruned = await pruneBackups(serverId, schedule.retention);
    const now = new Date();
    const next: BackupSchedule = {
      ...schedule,
      lastRunAt: now.toISOString(),
      nextRunAt: schedule.enabled ? new Date(now.getTime() + schedule.intervalHours * 3_600_000).toISOString() : null,
      lastStatus: "success",
      lastFilename: archive.filename,
      lastError: null,
    };
    await updateJSON<Record<string, BackupSchedule>>(STORE, (store) => {
      const current = store && typeof store === "object" && !Array.isArray(store) ? store : {};
      current[serverId] = next;
      return current;
    }, {});
    return { filename: archive.filename, pruned, schedule: next };
  } catch (error: any) {
    const failed: BackupSchedule = {
      ...schedule,
      lastRunAt: new Date().toISOString(),
      nextRunAt: schedule.enabled ? new Date(Date.now() + Math.max(1, schedule.intervalHours) * 3_600_000).toISOString() : null,
      lastStatus: "failed",
      lastError: String(error?.message || error).slice(0, 300),
    };
    await updateJSON<Record<string, BackupSchedule>>(STORE, (store) => {
      const current = store && typeof store === "object" && !Array.isArray(store) ? store : {};
      current[serverId] = failed;
      return current;
    }, {}).catch(() => undefined);
    throw error;
  } finally {
    running.delete(serverId);
  }
}

async function tick(): Promise<void> {
  const schedules = await readScheduleStore();
  const now = Date.now();
  for (const [serverId, schedule] of Object.entries(schedules)) {
    if (!schedule?.enabled) continue;
    const due = !schedule.nextRunAt || Number.isNaN(Date.parse(schedule.nextRunAt)) || Date.parse(schedule.nextRunAt) <= now;
    if (!due) continue;
    await runScheduledBackup(serverId).catch((error) => {
      console.error(`Scheduled backup failed for ${serverId}:`, error?.message || error);
    });
  }
}

export function startBackupScheduler(): void {
  if (timer) return;
  const initial = setTimeout(() => { void tick().catch(() => undefined); }, 12_000);
  initial.unref();
  timer = setInterval(() => { void tick().catch(() => undefined); }, 60_000);
  timer.unref();
}

export function stopBackupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
