import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  Bell,
  Check,
  Cpu,
  Gauge,
  KeyRound,
  LockKeyhole,
  Palette,
  Save,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  Waypoints,
  Wrench,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { useOverview } from "../../hooks/useOverview";
import {
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  SectionCard,
  Switch,
  formatBytes,
  formatPercent,
  uptimeLabel,
  useToast,
} from "../../components/ui";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: User },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "servers", label: "Server defaults", icon: Server },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "freeservice", label: "Free service", icon: Sparkles },
  { id: "api", label: "API access", icon: KeyRound },
  { id: "advanced", label: "Advanced", icon: SlidersHorizontal },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

const ACCENTS = [
  { id: "lime", color: "#c6ff3d" },
  { id: "emerald", color: "#43e08a" },
  { id: "cyan", color: "#4de8e0" },
  { id: "blue", color: "#63a9ff" },
  { id: "indigo", color: "#8b9cff" },
  { id: "purple", color: "#b39cff" },
  { id: "pink", color: "#ff8bc6" },
  { id: "red", color: "#ff6b6b" },
];

const errorMessage = (error: any, fallback: string) => error?.response?.data?.error || error?.response?.data?.details || error?.message || fallback;

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const { fetchSettings, accent, setAccent, backgroundEffect, setBackgroundEffect, reducedMotion, setReducedMotion } = useSettings() as any;
  const toast = useToast();
  const { data: overview } = useOverview(30000);
  const isOwner = user?.role === "owner";
  const staff = user?.role === "admin" || user?.role === "owner";
  const [section, setSection] = useState<SectionId>("general");
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [general, setGeneral] = useState({ panelName: "Snck", enableRegistration: true, enableTutorial: true, enableLoginAnimation: true, enablePlayit: false });
  const [defaults, setDefaults] = useState({ ram: 4, cpu: 150, disk: 10, autoRestart: false });
  const [notifications, setNotifications] = useState({ cpuThreshold: 85, memoryThreshold: 90, diskThreshold: 90, nodeOfflineAlerts: true });
  const [maintenance, setMaintenance] = useState({ enabled: false, message: "" });
  const [freeService, setFreeService] = useState({ enabled: false, ram: 2, cpu: 100, disk: 5, maxServers: 1, durationHours: 168 });

  const [passwordForm, setPasswordForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [usernameForm, setUsernameForm] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    axios.get("/api/system/settings", { timeout: 12000 })
      .then((response) => {
        const value = response.data || {};
        setSettings(value);
        setGeneral({
          panelName: value.panelName || "Snck",
          enableRegistration: value.enableRegistration !== false,
          enableTutorial: value.enableTutorial !== false,
          enableLoginAnimation: value.enableLoginAnimation !== false,
          enablePlayit: Boolean(value.enablePlayit),
        });
        setDefaults({ ram: Number(value.serverDefaults?.ram ?? 4), cpu: Number(value.serverDefaults?.cpu ?? 150), disk: Number(value.serverDefaults?.disk ?? 10), autoRestart: Boolean(value.serverDefaults?.autoRestart) });
        setNotifications({
          cpuThreshold: Number(value.notificationSettings?.cpuThreshold ?? 85),
          memoryThreshold: Number(value.notificationSettings?.memoryThreshold ?? 90),
          diskThreshold: Number(value.notificationSettings?.diskThreshold ?? 90),
          nodeOfflineAlerts: value.notificationSettings?.nodeOfflineAlerts !== false,
        });
        setMaintenance({ enabled: Boolean(value.maintenance?.enabled), message: String(value.maintenance?.message || "") });
        if (value.freeService) setFreeService(value.freeService);
      })
      .catch((requestError) => setError(errorMessage(requestError, "Settings could not be loaded.")));
    setUsernameForm(String(user?.username || ""));
  }, [user?.username]);

  const savePanel = async (payload: Record<string, any>, label: string) => {
    setSaving(true);
    setError("");
    try {
      await axios.put("/api/system/settings", payload);
      await fetchSettings?.();
      toast.success(`${label} saved`, "The panel configuration was updated.");
      setSettings((current: any) => ({ ...(current || {}), ...payload }));
    } catch (requestError: any) {
      setError(errorMessage(requestError, "Settings could not be saved."));
      toast.error("Save failed", errorMessage(requestError, "Check the values and try again."));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword.length < 8) { toast.error("Password too short", "Use at least 8 characters."); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error("Passwords do not match"); return; }
    setAccountBusy(true);
    try {
      await axios.put("/api/auth/password", { oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword });
      toast.success("Password changed", "Other sessions were invalidated. Sign in again with the new password.");
      setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    } catch (requestError: any) {
      toast.error("Password change failed", errorMessage(requestError, "Verify your current password."));
    } finally {
      setAccountBusy(false);
    }
  };

  const changeUsername = async () => {
    const clean = usernameForm.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(clean)) { toast.error("Invalid username", "Use 3–32 lowercase letters, numbers, dots, underscores or hyphens."); return; }
    setAccountBusy(true);
    try {
      await axios.put("/api/auth/username", { newUsername: clean });
      await refreshUser?.();
      toast.success("Username updated", `You are now ${clean}.`);
    } catch (requestError: any) {
      toast.error("Username change failed", errorMessage(requestError, "Choose another username."));
    } finally {
      setAccountBusy(false);
    }
  };

  const activeSection = useMemo(() => SECTIONS.find((entry) => entry.id === section) || SECTIONS[0], [section]);

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Configuration"
        eyebrowIcon={Settings}
        title="Settings"
        description="Every control on this page is connected to the panel API. Sections that are not implemented are deliberately absent rather than simulated."
      />

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      <div className="pn-settings-layout">
        <nav className="pn-settings-nav" aria-label="Settings sections">
          {SECTIONS.filter((entry) => entry.id !== "freeservice" || isOwner).map((entry) => {
            const Icon = entry.icon;
            return (
              <button key={entry.id} type="button" className={section === entry.id ? "is-active" : ""} onClick={() => setSection(entry.id)}>
                <Icon aria-hidden="true" /> {entry.label}
              </button>
            );
          })}
        </nav>

        <div className="pn-settings-panel">
          <div className="pn-between">
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>{activeSection.label}</h2>
              <p className="pn-dim" style={{ fontSize: 11.5, marginTop: 4 }}>{sectionDescription(activeSection.id)}</p>
            </div>
            {!staff ? <Badge tone="warning">Read only</Badge> : <Badge tone="online" dot>Admin controls</Badge>}
          </div>

          {section === "general" ? (
            <Card>
              <div className="pn-card-head"><div><h3>Panel identity & features</h3><p>Shown to every visitor, including the sign-in screen.</p></div></div>
              <div className="pn-card-body pn-settings-section">
                <Field label="Panel name" hint="Used in the sidebar, browser title and auth screens.">
                  <input className="pn-input" value={general.panelName} onChange={(event) => setGeneral((current) => ({ ...current, panelName: event.target.value }))} disabled={!staff} maxLength={48} />
                </Field>
                <Switch checked={general.enableRegistration} onChange={(value) => setGeneral((current) => ({ ...current, enableRegistration: value }))} label="Public registration" description="Allow visitors to create their own account." disabled={!staff} />
                <Switch checked={general.enableTutorial} onChange={(value) => setGeneral((current) => ({ ...current, enableTutorial: value }))} label="First-login guide" description="Stored preference for the onboarding tour." disabled={!staff} />
                <Switch checked={general.enableLoginAnimation} onChange={(value) => setGeneral((current) => ({ ...current, enableLoginAnimation: value }))} label="Login animation" description="Ambient branding motion on the authentication screen." disabled={!staff} />
                <Switch checked={general.enablePlayit} onChange={(value) => setGeneral((current) => ({ ...current, enablePlayit: value }))} label="Playit tunnel tab" description="Expose the optional Playit tunnel controls inside servers." disabled={!staff} />
                <div className="pn-settings-actions">
                  <Button tone="primary" icon={Save} loading={saving} disabled={!staff} onClick={() => void savePanel({ ...general, panelName: general.panelName.trim() || "Snck" }, "General settings")}>Save general settings</Button>
                </div>
              </div>
            </Card>
          ) : null}

          {section === "appearance" ? (
            <Card>
              <div className="pn-card-head"><div><h3>Appearance</h3><p>Accent and motion are applied instantly to the black design system.</p></div></div>
              <div className="pn-card-body pn-settings-section">
                <div>
                  <div className="pn-field-label" style={{ marginBottom: 9 }}>Accent colour</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {ACCENTS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        aria-label={`Use ${entry.id} accent`}
                        aria-pressed={accent === entry.id}
                        onClick={() => setAccent(entry.id)}
                        style={{
                          width: 34, height: 34, borderRadius: 9, background: entry.color, border: accent === entry.id ? "2px solid #fff" : "1px solid rgba(255,255,255,.18)",
                          display: "grid", placeItems: "center", color: "#050505",
                        }}
                      >
                        {accent === entry.id ? <Check size={15} aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Background effect" hint="Subtle ambient treatment behind the panel. “None” is the fastest option.">
                  <select className="pn-select" value={backgroundEffect} onChange={(event) => setBackgroundEffect(event.target.value)}>
                    <option value="none">None (flat black)</option>
                    <option value="aurora">Aurora glow</option>
                    <option value="grid">Technical grid</option>
                    <option value="starfield">Starfield</option>
                    <option value="nebula">Nebula</option>
                    <option value="animated-gradient">Animated gradient</option>
                  </select>
                </Field>
                <Switch checked={Boolean(reducedMotion)} onChange={(value) => setReducedMotion(value)} label="Reduce motion" description="Disable non-essential animation across the panel." />
                <div className="pn-settings-actions">
                  <Button tone="primary" icon={Save} loading={saving} disabled={!staff} onClick={() => void savePanel({ accent, backgroundEffect, reducedMotion }, "Appearance")}>Save appearance</Button>
                </div>
              </div>
            </Card>
          ) : null}

          {section === "account" ? (
            <>
              <Card>
                <div className="pn-card-head"><div><h3>Account details</h3><p>Signed in as {user?.username} · {user?.role}</p></div><Badge tone="info">{user?.role}</Badge></div>
                <div className="pn-card-body pn-settings-section">
                  <Field label="Username" hint="3–32 lowercase letters, numbers, dots, underscores or hyphens.">
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="pn-input" value={usernameForm} onChange={(event) => setUsernameForm(event.target.value)} maxLength={32} />
                      <Button icon={Save} loading={accountBusy} onClick={() => void changeUsername()} disabled={usernameForm.trim().toLowerCase() === String(user?.username || "").toLowerCase()}>Update</Button>
                    </div>
                  </Field>
                  <div className="pn-callout"><ShieldCheck aria-hidden="true" /><span>Your email on this account: <b style={{ color: "var(--pn-text)" }}>{user?.email || "not set"}</b>. Email changes require an administrator update to the account record.</span></div>
                </div>
              </Card>
              <Card>
                <div className="pn-card-head"><div><h3>Password</h3><p>Changing the password invalidates other sessions.</p></div></div>
                <div className="pn-card-body pn-settings-section">
                  <Field label="Current password"><input className="pn-input" type="password" autoComplete="current-password" value={passwordForm.oldPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))} /></Field>
                  <div className="pn-grid-2">
                    <Field label="New password"><input className="pn-input" type="password" autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} /></Field>
                    <Field label="Confirm new password"><input className="pn-input" type="password" autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></Field>
                  </div>
                  <div className="pn-settings-actions">
                    <Button tone="primary" icon={LockKeyhole} loading={accountBusy} onClick={() => void changePassword()}>Change password</Button>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {section === "security" ? (
            <>
              <Card>
                <div className="pn-card-head"><div><h3>Session & authentication</h3><p>Server-enforced security facts for this account.</p></div></div>
                <div className="pn-card-body">
                  <div className="pn-kv">
                    <div className="pn-kv-row"><span>Role</span><b>{user?.role || "user"}</b></div>
                    <div className="pn-kv-row"><span>Session storage</span><b>Bearer token · localStorage/sessionStorage</b></div>
                    <div className="pn-kv-row"><span>Password hashing</span><b>bcrypt</b></div>
                    <div className="pn-kv-row"><span>API access</span><b>{staff ? "Available with scoped keys" : "Not permitted"}</b></div>
                  </div>
                  <div className="pn-callout pn-callout--accent" style={{ marginTop: 12 }}><ShieldCheck aria-hidden="true" /><span>Role and password-version claims are re-checked against the database on every request, so demotions and password resets take effect immediately.</span></div>
                </div>
              </Card>
              <Card>
                <div className="pn-card-head"><div><h3>End this session</h3><p>Sign out of this browser.</p></div></div>
                <div className="pn-card-body pn-between">
                  <span className="pn-dim" style={{ fontSize: 12 }}>Stored credentials are removed from this device only.</span>
                  <Button tone="danger" icon={LockKeyhole} onClick={() => logout()}>Sign out</Button>
                </div>
              </Card>
            </>
          ) : null}

          {section === "servers" ? (
            <Card>
              <div className="pn-card-head"><div><h3>Server defaults</h3><p>Pre-filled values in the deployment wizard. Limits remain editable per server.</p></div></div>
              <div className="pn-card-body pn-settings-section">
                <div className="pn-grid-3">
                  <Field label="Default RAM (GB)"><input className="pn-input mono" value={defaults.ram} onChange={(event) => setDefaults((current) => ({ ...current, ram: Number(event.target.value) }))} inputMode="numeric" disabled={!staff} /></Field>
                  <Field label="Default CPU (%)"><input className="pn-input mono" value={defaults.cpu} onChange={(event) => setDefaults((current) => ({ ...current, cpu: Number(event.target.value) }))} inputMode="numeric" disabled={!staff} /></Field>
                  <Field label="Default disk (GB)"><input className="pn-input mono" value={defaults.disk} onChange={(event) => setDefaults((current) => ({ ...current, disk: Number(event.target.value) }))} inputMode="numeric" disabled={!staff} /></Field>
                </div>
                <Switch checked={defaults.autoRestart} onChange={(value) => setDefaults((current) => ({ ...current, autoRestart: value }))} label="Prefer automatic restart policy" description="Stored as a default for new deployments." disabled={!staff} />
                <div className="pn-settings-actions"><Button tone="primary" icon={Save} loading={saving} disabled={!staff} onClick={() => void savePanel({ serverDefaults: defaults }, "Server defaults")}>Save defaults</Button></div>
              </div>
            </Card>
          ) : null}

          {section === "notifications" ? (
            <Card>
              <div className="pn-card-head"><div><h3>Alert thresholds</h3><p>These values drive the notification bell and dashboard alerts.</p></div><Badge tone="accent">Live checks</Badge></div>
              <div className="pn-card-body pn-settings-section">
                <div className="pn-grid-3">
                  <Field label="CPU warning at (%)"><input className="pn-input mono" value={notifications.cpuThreshold} onChange={(event) => setNotifications((current) => ({ ...current, cpuThreshold: Number(event.target.value) }))} inputMode="numeric" disabled={!staff} /></Field>
                  <Field label="Memory warning at (%)"><input className="pn-input mono" value={notifications.memoryThreshold} onChange={(event) => setNotifications((current) => ({ ...current, memoryThreshold: Number(event.target.value) }))} inputMode="numeric" disabled={!staff} /></Field>
                  <Field label="Disk warning at (%)"><input className="pn-input mono" value={notifications.diskThreshold} onChange={(event) => setNotifications((current) => ({ ...current, diskThreshold: Number(event.target.value) }))} inputMode="numeric" disabled={!staff} /></Field>
                </div>
                <Switch checked={notifications.nodeOfflineAlerts} onChange={(value) => setNotifications((current) => ({ ...current, nodeOfflineAlerts: value }))} label="Node offline alerts" description="Surface node heartbeat failures in the notification bell." disabled={!staff} />
                <div className="pn-settings-actions"><Button tone="primary" icon={Save} loading={saving} disabled={!staff} onClick={() => void savePanel({ notificationSettings: notifications }, "Notification settings")}>Save thresholds</Button></div>
              </div>
            </Card>
          ) : null}

          {section === "maintenance" ? (
            <Card className={maintenance.enabled ? "pn-danger-zone" : ""}>
              <div className="pn-card-head"><div><h3>Maintenance mode</h3><p>Pauses non-staff server mutations while leaving stop available.</p></div>{maintenance.enabled ? <Badge tone="warning" dot>Active</Badge> : <Badge tone="offline">Off</Badge>}</div>
              <div className="pn-card-body pn-settings-section">
                <Switch checked={maintenance.enabled} onChange={(value) => setMaintenance((current) => ({ ...current, enabled: value }))} label="Enable maintenance mode" description="Staff can still operate. Non-staff POST/PUT/DELETE requests to server endpoints return 503 until disabled." disabled={!staff} />
                <Field label="Public message" hint="Shown in the banner and returned to blocked requests.">
                  <textarea className="pn-textarea" rows={3} value={maintenance.message} onChange={(event) => setMaintenance((current) => ({ ...current, message: event.target.value }))} maxLength={240} disabled={!staff} placeholder="Scheduled maintenance in progress. We'll be back shortly." />
                </Field>
                <div className="pn-settings-actions"><Button tone={maintenance.enabled ? "danger" : "primary"} icon={Wrench} loading={saving} disabled={!staff} onClick={() => void savePanel({ maintenance }, "Maintenance settings")}>{maintenance.enabled ? "Save maintenance notice" : "Save maintenance settings"}</Button></div>
              </div>
            </Card>
          ) : null}

          {section === "freeservice" && isOwner ? (
            <Card>
              <div className="pn-card-head"><div><h3>Free service quotas</h3><p>Applies to non-staff accounts. Enforced by the server creation endpoint.</p></div><Badge tone="info">Owner only</Badge></div>
              <div className="pn-card-body pn-settings-section">
                <Switch checked={Boolean(freeService.enabled)} onChange={(value) => setFreeService((current) => ({ ...current, enabled: value }))} label="Allow free server creation" description="When disabled, non-staff accounts cannot deploy servers." />
                <div className="pn-grid-3">
                  <Field label="RAM limit (GB)"><input className="pn-input mono" value={freeService.ram} onChange={(event) => setFreeService((current) => ({ ...current, ram: Number(event.target.value) }))} inputMode="numeric" /></Field>
                  <Field label="CPU limit (%)"><input className="pn-input mono" value={freeService.cpu} onChange={(event) => setFreeService((current) => ({ ...current, cpu: Number(event.target.value) }))} inputMode="numeric" /></Field>
                  <Field label="Disk limit (GB)"><input className="pn-input mono" value={freeService.disk} onChange={(event) => setFreeService((current) => ({ ...current, disk: Number(event.target.value) }))} inputMode="numeric" /></Field>
                </div>
                <div className="pn-grid-2">
                  <Field label="Max servers per user"><input className="pn-input mono" value={freeService.maxServers} onChange={(event) => setFreeService((current) => ({ ...current, maxServers: Number(event.target.value) }))} inputMode="numeric" /></Field>
                  <Field label="Default lifetime (hours)" hint="0 means permanent."><input className="pn-input mono" value={freeService.durationHours} onChange={(event) => setFreeService((current) => ({ ...current, durationHours: Number(event.target.value) }))} inputMode="numeric" /></Field>
                </div>
                <div className="pn-settings-actions"><Button tone="primary" icon={Save} loading={saving} onClick={() => void savePanel({ freeService }, "Free service limits")}>Save free service</Button></div>
              </div>
            </Card>
          ) : null}

          {section === "api" ? (
            <Card>
              <div className="pn-card-head"><div><h3>API access</h3><p>Keys are issued and revoked on a dedicated page.</p></div></div>
              <div className="pn-card-body pn-settings-section">
                <div className="pn-callout pn-callout--accent"><KeyRound aria-hidden="true" /><span>Use scoped API keys for automation. Full-access keys inherit your role and should be short-lived.</span></div>
                <div className="pn-row">
                  <Link to="/api-keys" className="pn-btn pn-btn--primary">Manage API keys</Link>
                  <Button tone="ghost" onClick={() => setSection("security")}>Security overview</Button>
                </div>
                <div className="pn-kv">
                  <div className="pn-kv-row"><span>Authentication header</span><b>Authorization: Bearer</b></div>
                  <div className="pn-kv-row"><span>Key storage</span><b>SHA-256 hash</b></div>
                  <div className="pn-kv-row"><span>Scopes</span><b>user:access · admin:access · *</b></div>
                </div>
              </div>
            </Card>
          ) : null}

          {section === "advanced" ? (
            <>
              <Card>
                <div className="pn-card-head"><div><h3>Runtime facts</h3><p>Read directly from the running panel process.</p></div><Badge tone="online" dot>Measured</Badge></div>
                <div className="pn-card-body">
                  {overview ? (
                    <div className="pn-kv">
                      <div className="pn-kv-row"><span>Host</span><b>{overview.panel.hostname}</b></div>
                      <div className="pn-kv-row"><span>Platform</span><b>{overview.panel.platform}</b></div>
                      <div className="pn-kv-row"><span>Cores</span><b>{overview.panel.cores}</b></div>
                      <div className="pn-kv-row"><span>Uptime</span><b>{uptimeLabel(overview.panel.uptime)}</b></div>
                      <div className="pn-kv-row"><span>CPU</span><b>{formatPercent(overview.panel.cpu)}</b></div>
                      <div className="pn-kv-row"><span>Memory</span><b>{formatBytes(overview.panel.memory.used)} / {formatBytes(overview.panel.memory.total)}</b></div>
                      <div className="pn-kv-row"><span>Disk</span><b>{overview.panel.disk ? `${formatBytes(overview.panel.disk.used)} / ${formatBytes(overview.panel.disk.total)}` : "unavailable"}</b></div>
                      <div className="pn-kv-row"><span>Network counters</span><b>{overview.panel.network.available ? "available" : "unavailable"}</b></div>
                    </div>
                  ) : <span className="pn-dim" style={{ fontSize: 12 }}>Collecting runtime facts…</span>}
                </div>
              </Card>
              <Card>
                <div className="pn-card-head"><div><h3>Data & persistence</h3><p>This build stores panel state in atomic JSON files under the data directory.</p></div></div>
                <div className="pn-card-body pn-settings-section">
                  <div className="pn-callout"><ShieldCheck aria-hidden="true" /><span>Writes are serialized and atomic per file. Back up the data directory and node server roots together for a consistent restore. The PostgreSQL schema in <code className="mono">database/schema.sql</code> is available for relational deployments.</span></div>
                  <div className="pn-kv">
                    <div className="pn-kv-row"><span>Server data directory</span><b>.data/</b></div>
                    <div className="pn-kv-row"><span>Node-dir default</span><b>/var/lib/shironex/servers</b></div>
                    <div className="pn-kv-row"><span>SFTP port</span><b>6868</b></div>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {section === "advanced" && staff ? (
            <Card>
              <div className="pn-card-head"><div><h3>Shortcuts</h3><p>Deep configuration lives with the subsystem it belongs to.</p></div></div>
              <div className="pn-card-body pn-row">
                <Link to="/nodes" className="pn-btn pn-btn--secondary"><Waypoints size={14} aria-hidden="true" /> Node settings</Link>
                <Link to="/allocations" className="pn-btn pn-btn--secondary"><Gauge size={14} aria-hidden="true" /> Port allocations</Link>
                <Link to="/snck-theme" className="pn-btn pn-btn--secondary"><Palette size={14} aria-hidden="true" /> appearance studio</Link>
                <Link to="/admin" className="pn-btn pn-btn--secondary"><Cpu size={14} aria-hidden="true" /> control center</Link>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function sectionDescription(id: SectionId) {
  switch (id) {
    case "general": return "Panel name and feature switches applied panel-wide.";
    case "appearance": return "Accent colour, ambient background and motion preferences.";
    case "account": return "Your username and password.";
    case "security": return "Session facts and sign-out controls.";
    case "servers": return "Defaults used when a new server wizard opens.";
    case "notifications": return "Thresholds used to generate real alerts.";
    case "maintenance": return "Temporarily pause non-staff server mutations.";
    case "freeservice": return "Quotas for non-staff deployments.";
    case "api": return "Programmatic access and scopes.";
    case "advanced": return "Runtime facts, persistence and subsystem shortcuts.";
    default: return "";
  }
}
