import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  SearchInput,
  Skeleton,
  statusLabel,
  timeAgo,
  useConfirm,
  useToast,
} from "../../components/ui";

type UserRecord = Record<string, any>;

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.details || error?.message || fallback;

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isOwner = user?.role === "owner";
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await axios.get("/api/system/users", { timeout: 15000 });
      setUsers(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (requestError: any) {
      setError(errorMessage(requestError, "Users could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => users.filter((entry) => `${entry.username} ${entry.email} ${entry.role}`.toLowerCase().includes(query.toLowerCase())),
    [users, query],
  );

  const changeRole = async (entry: UserRecord, role: string) => {
    setBusy(`${entry.id}:role`);
    try {
      await axios.put(`/api/system/users/${entry.id}/role`, { role });
      toast.success("Role updated", `${entry.username} is now ${role}.`);
      await load();
    } catch (requestError: any) {
      toast.error("Role change failed", errorMessage(requestError, "Only the Owner can change roles."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (entry: UserRecord) => {
    const approved = await confirm({
      title: `Delete ${entry.username}?`,
      description: "The account is removed immediately. Servers owned by this user remain in the fleet but lose their owner account. This cannot be undone.",
      confirmLabel: "Delete account",
      tone: "danger",
    });
    if (!approved) return;
    setBusy(`${entry.id}:delete`);
    try {
      await axios.delete(`/api/system/users/${entry.id}`);
      toast.success("User deleted", `${entry.username} no longer has access.`);
      await load();
    } catch (requestError: any) {
      toast.error("Delete failed", errorMessage(requestError, "The account could not be deleted."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Access control"
        eyebrowIcon={UserCog}
        title="Users & access"
        description="Role-based accounts with hashed passwords. Owners administer roles; admins manage day-to-day operations."
        actions={<><Button icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button><Button tone="primary" icon={Plus} onClick={() => setCreateOpen(true)}>Create user</Button></>}
      />

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      <div className="pn-kpis">
        <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Accounts</div><div className="pn-stat-value">{users.length}</div><div className="pn-stat-caption">registered identities</div></div><div className="pn-stat-icon"><Users aria-hidden="true" /></div></div></Card>
        <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Owners</div><div className="pn-stat-value">{users.filter((entry) => entry.role === "owner").length}</div><div className="pn-stat-caption">full control center access</div></div><div className="pn-stat-icon"><ShieldCheck aria-hidden="true" /></div></div></Card>
        <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Administrators</div><div className="pn-stat-value">{users.filter((entry) => entry.role === "admin").length}</div><div className="pn-stat-caption">fleet and node operators</div></div><div className="pn-stat-icon"><UserCog aria-hidden="true" /></div></div></Card>
        <Card className="pn-stat"><div className="pn-stat-top"><div><div className="pn-stat-label">Standard users</div><div className="pn-stat-value">{users.filter((entry) => entry.role === "user").length}</div><div className="pn-stat-caption">scoped server access</div></div><div className="pn-stat-icon"><KeyRound aria-hidden="true" /></div></div></Card>
      </div>

      <div className="pn-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search username, email or role…" />
      </div>

      <Card>
        {loading ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>{[0, 1, 2].map((key) => <Skeleton key={key} height={42} radius={8} />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={users.length ? Search : Users} title={users.length ? "No users match" : "No accounts yet"} description={users.length ? "Try another search term." : "Create the first operator account."} />
        ) : (
          <div className="pn-table-wrap">
            <table className="pn-table">
              <thead><tr><th>User</th><th>Role</th><th>Created</th><th>Auth</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="pn-avatar" style={{ width: 30, height: 30, flexBasis: 30, fontSize: 10.5 }}>{String(entry.username || "?").slice(0, 2).toUpperCase()}</span>
                        <div>
                          <strong>{entry.username}</strong>
                          <div className="pn-dim" style={{ fontSize: 10.5, marginTop: 2 }}>{entry.email || entry.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {isOwner && entry.role !== "owner" && entry.id !== user?.id ? (
                        <select className="pn-select" value={entry.role || "user"} disabled={busy === `${entry.id}:role`} onChange={(event) => void changeRole(entry, event.target.value)} style={{ minHeight: 30, padding: "4px 28px 4px 9px", fontSize: 11 }}>
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <Badge tone={entry.role === "owner" ? "accent" : entry.role === "admin" ? "info" : "offline"}>{entry.role || "user"}</Badge>
                      )}
                    </td>
                    <td className="num">{entry.createdAt ? timeAgo(entry.createdAt) : "—"}</td>
                    <td>{entry.isGoogleUser ? <Badge tone="info">Google</Badge> : <span className="pn-dim">Password</span>}</td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                        <IconButton icon={KeyRound} label={`Reset password for ${entry.username}`} disabled={busy === `${entry.id}:password`} onClick={() => setPasswordFor(entry)} />
                        {entry.role !== "owner" && entry.id !== user?.id ? <IconButton icon={Trash2} label={`Delete ${entry.username}`} disabled={busy === `${entry.id}:delete`} onClick={() => void remove(entry)} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="pn-callout">
        <ShieldCheck aria-hidden="true" />
        <span>Owner accounts cannot be demoted or deleted. Server and node permissions are enforced by the API on every request — changing a role takes effect immediately for existing sessions.</span>
      </div>

      {createOpen ? <CreateUser onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void load(); }} /> : null}
      {passwordFor ? <ResetPassword user={passwordFor} onClose={() => setPasswordFor(null)} /> : null}
    </div>
  );
}

function CreateUser({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await axios.post("/api/system/users", { username: username.trim(), password, role });
      toast.success("User created", `${username} can now sign in.`);
      onCreated();
    } catch (requestError: any) {
      setError(errorMessage(requestError, "The account could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create a user"
      description="Passwords are bcrypt-hashed before storage."
      size="sm"
      footer={<><Button tone="ghost" onClick={onClose}>Cancel</Button><Button tone="primary" loading={saving} onClick={() => void submit()} disabled={!username.trim() || password.length < 8}>Create account</Button></>}
    >
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}
        <Field label="Username" hint="3–32 characters: letters, numbers, dots, underscores, hyphens.">
          <input className="pn-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="new.operator" autoFocus />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters. The user can change it in settings.">
          <input className="pn-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="new-password" />
        </Field>
        <Field label="Role">
          <select className="pn-select" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="user">User — scoped server access</option>
            <option value="admin">Admin — fleet, nodes and users</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await axios.put(`/api/system/users/${user.id}/password`, { newPassword: password });
      toast.success("Password reset", `${user.username} must use the new password next time.`);
      onClose();
    } catch (requestError: any) {
      setError(errorMessage(requestError, "Password could not be reset."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password · ${user.username}`}
      description="Existing sessions for this account are invalidated immediately."
      size="sm"
      footer={<><Button tone="ghost" onClick={onClose}>Cancel</Button><Button tone="primary" loading={saving} onClick={() => void submit()} disabled={password.length < 8}>Reset password</Button></>}
    >
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}
        <Field label="New password" hint="8–256 characters.">
          <input className="pn-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
