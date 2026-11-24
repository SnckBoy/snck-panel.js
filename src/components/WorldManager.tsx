import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Archive,
  CheckCircle2,
  Copy,
  Download,
  FolderOpen,
  Globe2,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Button, EmptyState, Modal, SectionCard, Skeleton, formatBytes, timeAgo, useConfirm, useToast } from "./ui";

type World = {
  name: string;
  active: boolean;
  hasLevelData: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
};

const errorText = (error: any, fallback: string) =>
  [error?.response?.data?.error, error?.response?.data?.details].filter(Boolean).join(" — ") || error?.message || fallback;

export default function WorldManager({ serverId }: { serverId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [activeWorld, setActiveWorld] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<World | null>(null);
  const [form, setForm] = useState({ name: "world2", seed: "", gamemode: "survival", difficulty: "normal" });
  const [duplicateName, setDuplicateName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await axios.get(`/api/servers/${serverId}/worlds`);
      setWorlds(response.data.worlds || []);
      setActiveWorld(response.data.activeWorld || "world");
    } catch (requestError: any) {
      setError(errorText(requestError, "Unable to read this server's worlds."));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => ({
    count: worlds.length,
    size: worlds.reduce((sum, world) => sum + (Number(world.sizeBytes) || 0), 0),
  }), [worlds]);

  const run = async (key: string, task: () => Promise<string | void>) => {
    setBusy(key);
    setError("");
    try {
      const message = await task();
      await load();
      if (message) toast.success("World action complete", message);
    } catch (requestError: any) {
      const message = errorText(requestError, "The world action failed.");
      setError(message);
      toast.error("World action failed", message);
    } finally {
      setBusy(null);
    }
  };

  const createWorld = () => run("create", async () => {
    const response = await axios.post(`/api/servers/${serverId}/worlds`, { ...form, name: form.name.trim(), activate: true });
    setCreateOpen(false);
    return response.data.message || `“${form.name}” is queued for generation on the next server start.`;
  });

  const activate = (world: World) => run(`activate:${world.name}`, async () => {
    const approved = await confirm({
      title: `Activate “${world.name}”?`,
      description: "Minecraft loads the active world on startup. Restart the server to switch worlds.",
      confirmLabel: "Activate world",
      tone: "primary",
    });
    if (!approved) return;
    const response = await axios.post(`/api/servers/${serverId}/worlds/${encodeURIComponent(world.name)}/activate`);
    return response.data.message;
  });

  const remove = (world: World) => run(`delete:${world.name}`, async () => {
    const approved = await confirm({
      title: `Delete “${world.name}”?`,
      description: "Every region, player data and dimension folder in this world is permanently removed. Stop the server first.",
      confirmLabel: "Delete world",
      tone: "danger",
    });
    if (!approved) return;
    await axios.delete(`/api/servers/${serverId}/worlds/${encodeURIComponent(world.name)}`);
    return `“${world.name}” was deleted.`;
  });

  const archive = (world: World) => run(`backup:${world.name}`, async () => {
    const response = await axios.post(`/api/servers/${serverId}/worlds/${encodeURIComponent(world.name)}/backup`);
    return `${response.data.filename} was written to managed backups.`;
  });

  const download = async (world: World) => {
    setBusy(`download:${world.name}`);
    try {
      const response = await axios.get(`/api/servers/${serverId}/worlds/${encodeURIComponent(world.name)}/download`, { responseType: "blob", timeout: 300000 });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${world.name}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
    } catch (requestError: any) {
      toast.error("Download failed", errorText(requestError, "The world archive could not be downloaded."));
    } finally {
      setBusy(null);
    }
  };

  const duplicate = () => run("duplicate", async () => {
    if (!duplicateOf) return;
    await axios.post(`/api/servers/${serverId}/worlds/${encodeURIComponent(duplicateOf.name)}/duplicate`, { targetName: duplicateName.trim() });
    const created = duplicateName.trim();
    setDuplicateOf(null);
    setDuplicateName("");
    return `“${created}” was created from “${duplicateOf.name}”.`;
  });

  const importArchive = () => run("import", async () => {
    if (!importFile) throw new Error("Choose a .zip world archive.");
    const body = new FormData();
    body.append("archive", importFile);
    if (importName.trim()) body.append("name", importName.trim());
    const response = await axios.post(`/api/servers/${serverId}/worlds/import`, body, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
    setImportOpen(false);
    setImportFile(null);
    setImportName("");
    return response.data.message || "World imported.";
  });

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <Skeleton height={64} radius={12} />
        <Skeleton height={220} radius={12} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? <div className="pn-callout pn-callout--danger" role="alert"><Globe2 aria-hidden="true" /><span>{error}</span></div> : null}

      <SectionCard
        title="Worlds"
        description="Minecraft saves live in folders with a level.dat. Activate, archive, import and duplicate them without leaving the panel."
        action={
          <div className="pn-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Badge tone="info">{totals.count} world{totals.count === 1 ? "" : "s"} · {formatBytes(totals.size)}</Badge>
            <Button size="sm" icon={RefreshCw} loading={busy === "refresh"} onClick={() => run("refresh", async () => { await load(); })}>Refresh</Button>
            <Button size="sm" icon={Upload} onClick={() => setImportOpen(true)}>Import</Button>
            <Button size="sm" tone="primary" icon={Plus} onClick={() => { setForm({ name: "world2", seed: "", gamemode: "survival", difficulty: "normal" }); setCreateOpen(true); }}>New world</Button>
          </div>
        }
      >
        {worlds.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No worlds detected yet"
            description="Start the server once so Minecraft generates its first world, then refresh this list. You can also import an existing world archive."
            action={<Button tone="primary" icon={Upload} onClick={() => setImportOpen(true)}>Import a world</Button>}
          />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {worlds.map((world) => (
              <article
                key={world.name}
                className="pn-card"
                style={{ padding: 14, borderColor: world.active ? "rgba(163,230,53,.32)" : undefined, background: world.active ? "rgba(163,230,53,.03)" : undefined }}
              >
                <div className="pn-between" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 11, minWidth: 0 }}>
                    <div className="pn-node-icon" style={{ flexBasis: 36, width: 36, height: 36 }}><Globe2 aria-hidden="true" /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="pn-row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14 }}>{world.name}</b>
                        {world.active ? <Badge tone="online" dot live>Active</Badge> : null}
                      </div>
                      <div className="pn-dim" style={{ fontSize: 11, marginTop: 4 }}>
                        <HardDrive size={11} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" />
                        {formatBytes(world.sizeBytes)} · updated {world.modifiedAt ? timeAgo(world.modifiedAt) : "unknown"}
                      </div>
                    </div>
                  </div>
                  <div className="pn-row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {!world.active ? (
                      <Button size="sm" icon={CheckCircle2} loading={busy === `activate:${world.name}`} onClick={() => void activate(world)}>Activate</Button>
                    ) : null}
                    <Button size="sm" icon={Download} loading={busy === `download:${world.name}`} onClick={() => void download(world)}>Download</Button>
                    <Button size="sm" icon={Archive} loading={busy === `backup:${world.name}`} onClick={() => void archive(world)}>Archive</Button>
                    <Button size="sm" icon={Copy} onClick={() => { setDuplicateOf(world); setDuplicateName(`${world.name}-copy`); }}>Duplicate</Button>
                    <Button size="sm" tone="ghost" icon={Trash2} disabled={world.active} title={world.active ? "Activate another world before deleting this one" : "Delete world"} onClick={() => void remove(world)} aria-label={`Delete ${world.name}`} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="pn-callout pn-callout--warning">
        <Globe2 aria-hidden="true" />
        <span>World files are held open while the server runs. Stop the server before deleting, restoring or importing a world so no region data is lost.</span>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a new world"
        description="The server generates this world on its next start using the settings below. Existing worlds are untouched."
        size="sm"
        footer={<><Button tone="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button tone="primary" icon={Plus} loading={busy === "create"} disabled={!form.name.trim()} onClick={() => void createWorld()}>Create world</Button></>}
      >
        <div className="pn-modal-body" style={{ display: "grid", gap: 12 }}>
          <label className="pn-field"><span>World folder name</span><input className="pn-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="world2" maxLength={64} /></label>
          <label className="pn-field"><span>Seed (optional)</span><input className="pn-input" value={form.seed} onChange={(event) => setForm({ ...form, seed: event.target.value })} placeholder="Leave blank for a random seed" maxLength={128} /></label>
          <div className="pn-grid-2">
            <label className="pn-field"><span>Game mode</span><select className="pn-input" value={form.gamemode} onChange={(event) => setForm({ ...form, gamemode: event.target.value })}>{["survival", "creative", "adventure", "spectator"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
            <label className="pn-field"><span>Difficulty</span><select className="pn-input" value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>{["peaceful", "easy", "normal", "hard"].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(duplicateOf)}
        onClose={() => setDuplicateOf(null)}
        title={duplicateOf ? `Duplicate “${duplicateOf.name}”` : "Duplicate world"}
        description="Copies the entire world folder. Stop the server first to guarantee a consistent snapshot."
        size="sm"
        footer={<><Button tone="ghost" onClick={() => setDuplicateOf(null)}>Cancel</Button><Button tone="primary" icon={Copy} loading={busy === "duplicate"} disabled={!duplicateName.trim()} onClick={() => void duplicate()}>Duplicate</Button></>}
      >
        <div className="pn-modal-body">
          <label className="pn-field"><span>New world name</span><input className="pn-input" value={duplicateName} onChange={(event) => setDuplicateName(event.target.value)} maxLength={64} /></label>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import a world archive"
        description="Upload a .zip containing level.dat at its root or inside one top-level folder. Paths are validated before extraction."
        size="sm"
        footer={<><Button tone="ghost" onClick={() => setImportOpen(false)}>Cancel</Button><Button tone="primary" icon={Upload} loading={busy === "import"} disabled={!importFile} onClick={() => void importArchive()}>Import world</Button></>}
      >
        <div className="pn-modal-body" style={{ display: "grid", gap: 12 }}>
          <button type="button" className="pn-card" style={{ padding: 18, textAlign: "center", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
            {busy === "import" ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}
            <p style={{ marginTop: 8, fontSize: 12.5 }}>{importFile ? importFile.name : "Choose a .zip world archive"}</p>
            <p className="pn-dim" style={{ fontSize: 10.5, marginTop: 3 }}>Up to 2 GB · extraction is checked for traversal and symlinks</p>
          </button>
          <input ref={fileRef} type="file" accept=".zip" hidden onChange={(event) => { setImportFile(event.target.files?.[0] || null); event.target.value = ""; }} />
          <label className="pn-field"><span>World name (optional)</span><input className="pn-input" value={importName} onChange={(event) => setImportName(event.target.value)} placeholder="Detected from the archive" maxLength={64} /></label>
        </div>
      </Modal>
    </div>
  );
}
