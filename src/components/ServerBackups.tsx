import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Archive,
  CheckCircle2,
  Clock,
  Download,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge, Button, EmptyState, SectionCard, Skeleton, formatBytes, timeAgo, useConfirm, useToast } from "./ui";

type Backup = { filename: string; size: number; createdAt: string };
type Schedule = {
  enabled: boolean;
  intervalHours: number;
  retention: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: "never" | "success" | "failed";
  lastFilename: string | null;
  lastError: string | null;
};

const intervalOptions = [
  { value: 1, label: "Every hour" },
  { value: 6, label: "Every 6 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Daily" },
  { value: 168, label: "Weekly" },
];

const messageOf = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.details || error?.message || fallback;

export default function ServerBackups({ serverId }: { serverId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [verified, setVerified] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [listResponse, scheduleResponse] = await Promise.all([
        axios.get<Backup[]>(`/api/servers/${serverId}/backups`),
        axios.get<Schedule>(`/api/servers/${serverId}/backup-schedule`).catch(() => null),
      ]);
      setBackups(Array.isArray(listResponse.data) ? listResponse.data : []);
      if (scheduleResponse) setSchedule(scheduleResponse.data);
    } catch (error: any) {
      toast.error("Unable to load backups", messageOf(error, "The backup service did not respond."));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy("create");
    try {
      const response = await axios.post(`/api/servers/${serverId}/backups`);
      toast.success("Backup created", response.data?.filename || "The archive is ready to download.");
      await load();
    } catch (error: any) {
      toast.error("Backup failed", messageOf(error, "The archive could not be created."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (backup: Backup) => {
    const approved = await confirm({ title: `Delete ${backup.filename}?`, description: "The archive is removed from disk immediately.", confirmLabel: "Delete archive", tone: "danger" });
    if (!approved) return;
    setBusy(`delete:${backup.filename}`);
    try {
      await axios.delete(`/api/servers/${serverId}/backups/${encodeURIComponent(backup.filename)}`);
      await load();
    } catch (error: any) {
      toast.error("Delete failed", messageOf(error, "The archive could not be deleted."));
    } finally {
      setBusy(null);
    }
  };

  const download = async (backup: Backup) => {
    setBusy(`download:${backup.filename}`);
    try {
      const response = await axios.get(`/api/servers/${serverId}/backups/${encodeURIComponent(backup.filename)}`, { responseType: "blob", timeout: 300000 });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", backup.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
    } catch (error: any) {
      toast.error("Download failed", messageOf(error, "The archive could not be downloaded."));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (backup: Backup) => {
    setBusy(`verify:${backup.filename}`);
    try {
      const response = await axios.post(`/api/servers/${serverId}/backups/${encodeURIComponent(backup.filename)}/verify`);
      const result = response.data;
      const summary = `${result.entries} entries${result.hasLevelData ? " · level.dat present" : " · no level.dat"}`;
      setVerified((current) => ({ ...current, [backup.filename]: summary }));
      toast.success("Archive verified", summary);
    } catch (error: any) {
      toast.error("Verification failed", messageOf(error, "The archive is unreadable or unsafe."));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: Backup) => {
    const approved = await confirm({
      title: `Restore ${backup.filename}?`,
      description: "Every current server file is replaced by the archive. A pre-restore safety backup is created first and the server must be stopped.",
      confirmLabel: "Restore archive",
      tone: "danger",
    });
    if (!approved) return;
    setBusy(`restore:${backup.filename}`);
    try {
      const response = await axios.post(`/api/servers/${serverId}/backups/${encodeURIComponent(backup.filename)}/restore`, {}, { timeout: 600000 });
      toast.success("Backup restored", response.data?.message || "Start the server when ready.");
      await load();
    } catch (error: any) {
      toast.error("Restore failed", messageOf(error, "The archive could not be restored."));
    } finally {
      setBusy(null);
    }
  };

  const saveSchedule = async () => {
    if (!schedule) return;
    setBusy("schedule");
    try {
      const response = await axios.put(`/api/servers/${serverId}/backup-schedule`, {
        enabled: schedule.enabled,
        intervalHours: schedule.intervalHours,
        retention: schedule.retention,
      });
      setSchedule(response.data);
      toast.success("Schedule saved", response.data.enabled ? `Next archive ${response.data.nextRunAt ? timeAgo(response.data.nextRunAt) : "scheduled"}.` : "Automatic backups are disabled.");
    } catch (error: any) {
      toast.error("Schedule not saved", messageOf(error, "Check the interval and retention values."));
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    setBusy("run");
    try {
      const response = await axios.post(`/api/servers/${serverId}/backup-schedule/run`);
      toast.success("Scheduled backup complete", `${response.data.filename}${response.data.pruned?.length ? ` · pruned ${response.data.pruned.length} old archives` : ""}`);
      await load();
    } catch (error: any) {
      toast.error("Scheduled backup failed", messageOf(error, "The archive could not be created."));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div style={{ display: "grid", gap: 14 }}><Skeleton height={120} radius={12} /><Skeleton height={240} radius={12} /></div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionCard
        title="Managed backups"
        description="Archives are written to the server's backup store. Restores are verified and always create a safety copy first."
        action={<div className="pn-row" style={{ gap: 8 }}><Button size="sm" icon={RefreshCw} onClick={() => void load()}>Refresh</Button><Button size="sm" tone="primary" icon={Plus} loading={busy === "create"} onClick={() => void create()}>Create backup</Button></div>}
      >
        {backups.length === 0 ? (
          <EmptyState icon={Archive} title="No backups yet" description="Create one now, or enable a schedule below to keep automatic archives with retention limits." action={<Button tone="primary" icon={Plus} loading={busy === "create"} onClick={() => void create()}>Create the first backup</Button>} />
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {backups.map((backup) => (
              <article key={backup.filename} className="pn-card" style={{ padding: 13 }}>
                <div className="pn-between" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                    <div className="pn-node-icon" style={{ width: 34, height: 34, flexBasis: 34 }}><Archive aria-hidden="true" /></div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "var(--pn-mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{backup.filename}</p>
                      <p className="pn-dim" style={{ fontSize: 10.5, marginTop: 3 }}>{formatBytes(backup.size)} · {new Date(backup.createdAt).toLocaleString()} · {timeAgo(backup.createdAt)}</p>
                      {verified[backup.filename] ? <p style={{ fontSize: 10.5, marginTop: 3, color: "var(--pn-green)" }}><ShieldCheck size={11} style={{ display: "inline", marginRight: 3 }} aria-hidden="true" />{verified[backup.filename]}</p> : null}
                    </div>
                  </div>
                  <div className="pn-row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <Button size="sm" icon={ShieldCheck} loading={busy === `verify:${backup.filename}`} onClick={() => void verify(backup)}>Verify</Button>
                    <Button size="sm" icon={RotateCcw} loading={busy === `restore:${backup.filename}`} onClick={() => void restore(backup)}>Restore</Button>
                    <Button size="sm" icon={Download} loading={busy === `download:${backup.filename}`} onClick={() => void download(backup)}>Download</Button>
                    <Button size="sm" tone="ghost" icon={Trash2} loading={busy === `delete:${backup.filename}`} onClick={() => void remove(backup)} aria-label={`Delete ${backup.filename}`} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Automatic backups"
        description="The scheduler runs on the panel host, applies retention after every archive, and reports failures instead of failing silently."
        action={<Badge tone={schedule?.enabled ? "online" : "offline"} dot live={Boolean(schedule?.enabled)}>{schedule?.enabled ? "Scheduled" : "Disabled"}</Badge>}
      >
        {schedule ? (
          <div style={{ display: "grid", gap: 13 }}>
            <label className="pn-row" style={{ gap: 10, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--pn-accent)" }} />
              <span style={{ fontSize: 12.5 }}>Create archives automatically on this schedule</span>
            </label>
            <div className="pn-grid-2">
              <label className="pn-field">
                <span>Frequency</span>
                <select className="pn-input" value={schedule.intervalHours} onChange={(event) => setSchedule({ ...schedule, intervalHours: Number(event.target.value) })}>
                  {intervalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="pn-field">
                <span>Keep the newest (retention)</span>
                <input className="pn-input" type="number" min={1} max={365} value={schedule.retention} onChange={(event) => setSchedule({ ...schedule, retention: Number(event.target.value) })} />
              </label>
            </div>
            <div className="pn-kv">
              <div className="pn-kv-row"><span>Last scheduled run</span><b>{schedule.lastRunAt ? `${new Date(schedule.lastRunAt).toLocaleString()} (${schedule.lastStatus})` : "never"}</b></div>
              <div className="pn-kv-row"><span>Next run</span><b>{schedule.nextRunAt ? timeAgo(schedule.nextRunAt) : "not scheduled"}</b></div>
              <div className="pn-kv-row"><span>Latest archive</span><b>{schedule.lastFilename || "—"}</b></div>
            </div>
            {schedule.lastError ? <div className="pn-callout pn-callout--warning"><Clock aria-hidden="true" /><span>{schedule.lastError}</span></div> : null}
            <div className="pn-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button tone="primary" icon={CheckCircle2} loading={busy === "schedule"} onClick={() => void saveSchedule()}>Save schedule</Button>
              <Button icon={History} loading={busy === "run"} onClick={() => void runNow()}>Run scheduled backup now</Button>
              <span className="pn-dim" style={{ fontSize: 10.5, alignSelf: "center" }}>Retention removes the oldest archives after each successful run.</span>
            </div>
          </div>
        ) : (
          <EmptyState icon={Clock} title="Schedule unavailable" description="The backup schedule endpoint did not answer. Manual backups remain available." action={<Button onClick={() => void load()}>Retry</Button>} />
        )}
      </SectionCard>
    </div>
  );
}
