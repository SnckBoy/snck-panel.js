import { Request, Response } from "express";
import { getBackupSchedule, saveBackupSchedule, removeBackupSchedule, runScheduledBackup } from "../services/backupScheduler.js";
import { restoreBackup, verifyBackup } from "../services/backups.js";
import { audit } from "../services/security.js";

const isOwnerOrStaff = (req: Request) => {
  const user = (req as any).user;
  const server = (req as any).server;
  return user?.role === "admin" || user?.role === "owner" || server?.owner === user?.id;
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
  try {
    res.json(await getBackupSchedule(req.params.id));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to read the backup schedule." });
  }
};

export const putScheduleHandler = async (req: Request, res: Response) => {
  if (!isOwnerOrStaff(req)) return res.status(403).json({ error: "Only the server owner or staff can change backup schedules." });
  try {
    const schedule = await saveBackupSchedule(req.params.id, req.body || {});
    await audit("backup.schedule_updated", req, { serverId: req.params.id, enabled: schedule.enabled, intervalHours: schedule.intervalHours, retention: schedule.retention });
    res.json(schedule);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Invalid backup schedule." });
  }
};

export const deleteScheduleHandler = async (req: Request, res: Response) => {
  if (!isOwnerOrStaff(req)) return res.status(403).json({ error: "Only the server owner or staff can change backup schedules." });
  try {
    await removeBackupSchedule(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to remove the backup schedule." });
  }
};

export const runScheduleNowHandler = async (req: Request, res: Response) => {
  if (!isOwnerOrStaff(req)) return res.status(403).json({ error: "Only the server owner or staff can run scheduled backups." });
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
  if (!isLocal(req, res)) return;
  try {
    res.json(await verifyBackup(req.params.id, req.params.filename));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Backup verification failed." });
  }
};

export const restoreBackupHandler = async (req: Request, res: Response) => {
  if (!isOwnerOrStaff(req)) return res.status(403).json({ error: "Only the server owner or staff can restore a backup." });
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
