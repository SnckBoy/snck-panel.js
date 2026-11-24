import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Activity,
  ArrowRight,
  CornerDownLeft,
  KeyRound,
  LayoutDashboard,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react";
import { Modal, Spinner } from "../ui";

type Result = { id: string; label: string; hint?: string; group: string; path: string };

const QUICK_ACTIONS: Result[] = [
  { id: "nav-overview", label: "Go to overview", group: "Navigation", path: "/", hint: "Dashboard" },
  { id: "nav-servers", label: "Go to servers", group: "Navigation", path: "/servers", hint: "Fleet" },
  { id: "nav-create", label: "Deploy a new server", group: "Actions", path: "/servers/create", hint: "Wizard" },
  { id: "nav-nodes", label: "Go to nodes", group: "Navigation", path: "/nodes", hint: "Infrastructure" },
  { id: "nav-settings", label: "Open settings", group: "Navigation", path: "/settings", hint: "Panel" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await axios.get("/api/overview/search", { params: { q: trimmed }, signal: controller.signal, timeout: 8000 });
        if (cancelled) return;
        const data = response.data || {};
        const next: Result[] = [
          ...(Array.isArray(data.servers) ? data.servers : []).map((item: any) => ({
            id: `server-${item.id}`,
            label: item.name || "Server",
            hint: `${item.status || "unknown"} · ${item.nodeName || "node"}`,
            group: "Servers",
            path: `/servers/${item.id}`,
          })),
          ...(Array.isArray(data.nodes) ? data.nodes : []).map((item: any) => ({
            id: `node-${item.id}`,
            label: item.name || "Node",
            hint: `${item.status || "unknown"} · ${item.hostname || item.fqdn || "address"}`,
            group: "Nodes",
            path: "/nodes",
          })),
          ...(Array.isArray(data.users) ? data.users : []).map((item: any) => ({
            id: `user-${item.id}`,
            label: item.username || "User",
            hint: item.role || "user",
            group: "Users",
            path: "/users",
          })),
        ];
        setResults(next);
        setActive(0);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const items = query.trim().length < 2 ? QUICK_ACTIONS : results;
  const go = (item: Result) => {
    onClose();
    navigate(item.path);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(items.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      go(items[active]);
    }
  };

  const grouped = items.reduce<Record<string, Result[]>>((accumulator, item) => {
    (accumulator[item.group] ||= []).push(item);
    return accumulator;
  }, {});
  let index = -1;

  const iconFor = (item: Result) => {
    if (item.group === "Servers") return Server;
    if (item.group === "Nodes") return Waypoints;
    if (item.group === "Users") return Users;
    if (item.id === "nav-create") return Plus;
    if (item.id === "nav-settings") return Settings;
    return LayoutDashboard;
  };

  return (
    <Modal open={open} onClose={onClose} title="Search SNCK" size="sm" labelId="pn-palette-title">
      <div className="pn-palette" onKeyDown={onKeyDown}>
        <div className="pn-palette-search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search servers, nodes, users or jump to a page…"
            aria-label="Search panel"
          />
          {loading ? <Spinner /> : <kbd className="mono" style={{ fontSize: 10, color: "var(--pn-dim)" }}>ESC</kbd>}
        </div>
        <div className="pn-palette-results">
          {query.trim().length >= 2 && !loading && items.length === 0 ? (
            <div style={{ padding: "26px 14px", textAlign: "center", color: "var(--pn-dim)", fontSize: 12 }}>
              No matches for “{query.trim()}”.
            </div>
          ) : null}
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group}>
              <div className="pn-palette-group">{group}</div>
              {groupItems.map((item) => {
                index += 1;
                const Icon = iconFor(item);
                const isActive = index === active;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`pn-palette-item ${isActive ? "is-active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.hint ? <small>{item.hint}</small> : null}
                    {isActive ? <ArrowRight size={13} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pn-palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><CornerDownLeft size={11} aria-hidden="true" /> open</span>
          <span style={{ marginLeft: "auto" }}><KeyRound size={11} aria-hidden="true" /> admin-scoped results</span>
        </div>
      </div>
    </Modal>
  );
}
