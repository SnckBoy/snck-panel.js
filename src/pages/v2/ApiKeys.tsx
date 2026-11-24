import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, BookOpen, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  SectionCard,
  Skeleton,
  timeAgo,
  useConfirm,
  useToast,
} from "../../components/ui";

type ApiKey = Record<string, any>;
const errorMessage = (error: any, fallback: string) => error?.response?.data?.error || error?.message || fallback;

export default function ApiKeysPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ key: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await axios.get("/api/admin/api-keys", { timeout: 15000 });
      setKeys(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (requestError: any) {
      setError(errorMessage(requestError, "API keys could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const revoke = async (entry: ApiKey) => {
    const approved = await confirm({
      title: `Revoke “${entry.label}”?`,
      description: "Any integration using this key stops authenticating immediately. This cannot be undone.",
      confirmLabel: "Revoke key",
      tone: "danger",
    });
    if (!approved) return;
    try {
      await axios.delete(`/api/admin/api-keys/${entry.id}`);
      toast.success("API key revoked", entry.label);
      await load();
    } catch (requestError: any) {
      toast.error("Revoke failed", errorMessage(requestError, "The key could not be revoked."));
    }
  };

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Integrations"
        eyebrowIcon={KeyRound}
        title="API keys"
        description="Programmatic access with explicit scopes and optional expiry. Keys are shown once and stored only as SHA-256 hashes."
        actions={<><Button icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button><Button tone="primary" icon={Plus} onClick={() => setCreateOpen(true)}>Create key</Button></>}
      />

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      <Card>
        {loading ? (
          <div style={{ padding: 20 }}><Skeleton height={44} radius={8} /></div>
        ) : keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys" description="Create a scoped key for automation, CI or a monitoring integration." action={<Button tone="primary" icon={Plus} onClick={() => setCreateOpen(true)}>Create your first key</Button>} />
        ) : (
          <div className="pn-table-wrap">
            <table className="pn-table">
              <thead><tr><th>Label</th><th>Scopes</th><th>Expires</th><th>Last used</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {keys.map((entry) => (
                  <tr key={entry.id}>
                    <td><strong>{entry.label || "Unnamed key"}</strong><div className="pn-dim" style={{ fontSize: 10, marginTop: 2 }}>{entry.id}</div></td>
                    <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{(entry.scopes || []).map((scope: string) => <Badge key={scope} tone={scope === "*" ? "warning" : "info"}>{scope}</Badge>)}</div></td>
                    <td className="num">{entry.expires_at ? new Date(entry.expires_at).toLocaleDateString() : "Never"}</td>
                    <td className="num">{entry.last_used_at ? timeAgo(entry.last_used_at) : "Never"}</td>
                    <td>{entry.revoked ? <Badge tone="danger">Revoked</Badge> : entry.expires_at && Date.parse(entry.expires_at) < Date.now() ? <Badge tone="warning">Expired</Badge> : <Badge tone="online" dot>Active</Badge>}</td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <IconButton icon={Trash2} label={`Revoke ${entry.label}`} onClick={() => void revoke(entry)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SectionCard title="API documentation" description="Authentication and scope rules enforced by the panel." action={<Badge tone="accent"><BookOpen size={11} style={{ marginRight: 3 }} /> Reference</Badge>}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div className="pn-section-label" style={{ marginBottom: 6 }}>Authentication</div>
            <div className="pn-command">Authorization: Bearer shironex-…</div>
          </div>
          <div>
            <div className="pn-section-label" style={{ marginBottom: 6 }}>Scopes</div>
            <div className="pn-kv">
              <div className="pn-kv-row"><span><code className="mono">user:access</code></span><b>Authenticated user endpoints (/api/servers, …)</b></div>
              <div className="pn-kv-row"><span><code className="mono">admin:access</code></span><b>Administrative endpoints (/api/nodes, /api/admin/*)</b></div>
              <div className="pn-kv-row"><span><code className="mono">*</code></span><b>Full access inherited from the key creator</b></div>
            </div>
          </div>
          <div>
            <div className="pn-section-label" style={{ marginBottom: 6 }}>Example</div>
            <div className="pn-command">{`curl -H "Authorization: Bearer shironex-…" \\
  ${window.location.origin}/api/servers`}</div>
          </div>
          <div className="pn-callout"><ShieldCheck aria-hidden="true" /><span>A key never grants more than its creator's current role. If the creator is demoted, admin-scoped keys stop working. Secrets are never logged or returned after creation.</span></div>
        </div>
      </SectionCard>

      {createOpen ? <CreateKey onClose={() => setCreateOpen(false)} onCreated={(key, label) => { setCreateOpen(false); setRevealed({ key, label }); void load(); }} /> : null}
      {revealed ? <RevealKey value={revealed} onClose={() => setRevealed(null)} /> : null}
    </div>
  );
}

function CreateKey({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string, label: string) => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("admin");
  const [expiry, setExpiry] = useState("never");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const scopes = scope === "full" ? ["*"] : scope === "admin" ? ["user:access", "admin:access"] : ["user:access"];
      const days = Number(expiry);
      const expires_at = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : undefined;
      const response = await axios.post("/api/admin/api-keys", { label: label.trim() || "Unnamed key", scopes, expires_at });
      toast.success("API key created", "Copy it now — it will not be shown again.");
      onCreated(response.data.key, response.data.label);
    } catch (requestError: any) {
      setError(errorMessage(requestError, "The key could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create an API key"
      description="Choose the smallest scope that does the job."
      size="sm"
      footer={<><Button tone="ghost" onClick={onClose}>Cancel</Button><Button tone="primary" loading={saving} onClick={() => void submit()}>Create key</Button></>}
    >
      <div className="pn-wizard-body">
        {error ? <div className="pn-callout pn-callout--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}
        <Field label="Label"><input className="pn-input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Monitoring bot" autoFocus /></Field>
        <Field label="Permissions">
          <select className="pn-select" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="user">User access — server read/control</option>
            <option value="admin">Admin access — nodes, users and fleet</option>
            <option value="full">Full access — inherit all creator permissions</option>
          </select>
        </Field>
        <Field label="Expiry" hint="Short-lived keys are safer for one-off automation.">
          <select className="pn-select" value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            <option value="never">No expiry</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function RevealKey({ value, onClose }: { value: { key: string; label: string }; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title="Copy your API key"
      description="This value is shown exactly once. Store it in a secret manager."
      size="sm"
      footer={<Button tone="primary" onClick={onClose}>I have stored the key</Button>}
    >
      <div className="pn-wizard-body">
        <div className="pn-callout pn-callout--warning"><AlertTriangle aria-hidden="true" /><span>Do not paste this key into client-side code, screenshots or logs.</span></div>
        <Field label={value.label}>
          <div className="pn-token" style={{ color: "var(--pn-text)" }}>{value.key}</div>
        </Field>
        <Button tone="secondary" icon={Copy} onClick={async () => { await navigator.clipboard.writeText(value.key); toast.success("API key copied"); }}>Copy to clipboard</Button>
      </div>
    </Modal>
  );
}
