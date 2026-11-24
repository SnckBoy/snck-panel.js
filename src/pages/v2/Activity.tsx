import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Activity, AlertTriangle, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Skeleton,
  timeAgo,
} from "../../components/ui";

type ActivityItem = Record<string, any>;

export default function ActivityPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/overview/activity", { params: { limit: 150 }, timeout: 15000 });
      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setError("");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () =>
      items.filter((entry) => {
        const matches = `${entry.label} ${entry.action} ${entry.actorId} ${entry.ip}`.toLowerCase().includes(query.toLowerCase());
        const mine = scope === "all" || String(entry.actorId || "") === String(user?.id || "");
        return matches && mine;
      }),
    [items, query, scope, user?.id],
  );

  return (
    <div className="pn-page">
      <PageHeader
        eyebrow="Audit trail"
        eyebrowIcon={ShieldCheck}
        title="Activity & audit"
        description="Server-side audit events for nodes, servers, credentials, users and API keys. Entries are append-only and capped at 5,000."
        actions={<Button icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button>}
      />

      {error ? <div className="pn-callout pn-callout--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{error}</span></div> : null}

      <div className="pn-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search action, actor or IP address…" />
        <div className="pn-seg" role="group" aria-label="Activity scope">
          <button type="button" className={scope === "all" ? "is-active" : ""} onClick={() => setScope("all")}>All events</button>
          <button type="button" className={scope === "mine" ? "is-active" : ""} onClick={() => setScope("mine")}>Mine</button>
        </div>
      </div>

      <Card>
        {loading ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>{[0, 1, 2, 3].map((key) => <Skeleton key={key} height={40} radius={8} />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Activity} title={items.length ? "No events match" : "No audit events yet"} description={items.length ? "Try a different search." : "Node creation, server actions and credential changes will be recorded here."} />
        ) : (
          <div className="pn-table-wrap">
            <table className="pn-table">
              <thead><tr><th>Event</th><th>Actor</th><th>IP</th><th>When</th></tr></thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.label}</strong>
                      <div className="pn-dim mono" style={{ fontSize: 9.5, marginTop: 2 }}>{entry.action}</div>
                    </td>
                    <td><Badge tone={String(entry.actorId || "").startsWith("node") ? "info" : "offline"}>{entry.actorId || "system"}</Badge></td>
                    <td className="num">{entry.ip || "—"}</td>
                    <td className="num" title={entry.at ? new Date(entry.at).toLocaleString() : ""}>{timeAgo(entry.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <span className="pn-quiet" style={{ fontSize: 10.5 }}>Non-staff accounts only see their own audit events. {filtered.length} entries shown.</span>
    </div>
  );
}
