import { Request, Response } from "express";
import { getBackupSchedule, saveBackupSchedule, removeBackupSchedule, runScheduledBackup } from "../services/backupScheduler.js";
import { restoreBackup, verifyBackup } from "../services/backups.js";
import { audit } from "../services/security.js";
import { hasServerPermission, isServerOwnerOrStaff } from "../services/serverPermissions.js";

/**
 * Granular backup authorization. The route guard enforces the same canonical
 * permissions; these checks keep every handler safe on its own.
 *
 * - backups.read    listing, downloading, schedule viewing, verification
 * - backups.create  creating archives and running the schedule
 * - backups.restore restoring an archive
 * - backups.delete  deleting an archive
 *
 * Changing or deleting the schedule itself is reserved for the server owner
 * and staff; it is never delegated through backups.create.
 */
const requireBackupPermission = (
  req: Request,
  res: Response,
  permission: "backups.read" | "backups.create" | "backups.restore" | "backups.delete",
): boolean => {
  const server = (req as any).server;
  const user = (req as any).user;
  if (hasServerPermission(server, user, permission)) return true;
  res.status(403).json({ error: `Sub-user permission required: ${permission}` });
  return false;
};

/** Rewriting or deleting a schedule requires the server owner or staff. */
const requireScheduleOwner = (req: Request, res: Response): boolean => {
  const server = (req as any).server;
  const user = (req as any).user;
  if (isServerOwnerOrStaff(server, user)) return true;
  res.status(403).json({ error: "Only the server owner or staff can change the backup schedule." });
  return false;
};

const isLocal = (req: Request, res: Response): boolean => {
  const server = (req as any).server;
  if (server?.nodeId && server.nodeId !== "local") {
    res.status(409).json({
      error: "Archive restore and verification run on the panel's local node. Use the remote node's daemon file tools for this server.",
      remoteNodeUnsupported: true,
    });
    return false;
  }
  return true;
};

export const getScheduleHandler = async (req: Request, res: Response) => {
  if (!requireBackupPermission(req, res, "backups.read")) return;
  try {
    res.json(await getBackupSchedule(req.params.id));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to read the backup schedule." });
  }
};

export const putScheduleHandler = async (req: Request, res: Response) => {
  if (!requireScheduleOwner(req, res)) return;
  try {
    const schedule = await saveBackupSchedule(req.params.id, req.body || {});
    await audit("backup.schedule_updated", req, { serverId: req.params.id, enabled: schedule.enabled, intervalHours: schedule.intervalHours, retention: schedule.retention });
    res.json(schedule);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Invalid backup schedule." });
  }
};

export const deleteScheduleHandler = async (req: Request, res: Response) => {
  if (!requireScheduleOwner(req, res)) return;
  try {
    await removeBackupSchedule(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to remove the backup schedule." });
  }
};

export const runScheduleNowHandler = async (req: Request, res: Response) => {
  if (!requireBackupPermission(req, res, "backups.create")) return;
  if (!isLocal(req, res)) return;
  try {
    const result = await runScheduledBackup(req.params.id);
    await audit("backup.scheduled_run", req, { serverId: req.params.id, filename: result.filename, pruned: result.pruned.length });
    res.json(result);
  } catch (error: any) {
    res.status(409).json({ error: error?.message || "Scheduled backup failed." });
  }
};

export const verifyBackupHandler = async (req: Request, res: Response) => {
  if (!requireBackupPermission(req, res, "backups.read")) return;
  if (!isLocal(req, res)) return;
  try {
    res.json(await verifyBackup(req.params.id, req.params.filename));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Backup verification failed." });
  }
};

export const restoreBackupHandler = async (req: Request, res: Response) => {
  if (!requireBackupPermission(req, res, "backups.restore")) return;
  if (!isLocal(req, res)) return;
  const server = (req as any).server;
  if (String(server?.status || "").toLowerCase() === "online") {
    return res.status(409).json({ error: "Stop the server before restoring a backup. The archive replaces every file in the server directory." });
  }
  try {
    const result = await restoreBackup(req.params.id, req.params.filename);
    await audit("backup.restored", req, { serverId: req.params.id, filename: req.params.filename, restoredFiles: result.restoredFiles, safetyBackup: result.safetyBackup });
    res.json({
      ...result,
      message: `Restored ${result.restoredFiles} entries. The previous files were saved as ${result.safetyBackup}. Start the server when ready.`,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Backup restore failed." });
  }
};
