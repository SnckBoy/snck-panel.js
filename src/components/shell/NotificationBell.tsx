import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { timeAgo } from "../ui";

export type PanelAlert = {
  id: string;
  severity: "info" | "warning" | "danger" | "success";
  title: string;
  detail: string;
  target?: string;
};

const ICONS = { info: Info, warning: AlertTriangle, danger: ShieldAlert, success: CheckCircle2 } as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<PanelAlert[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [seen, setSeen] = useState<string>(() => {
    try { return localStorage.getItem("snck-alerts-seen") || ""; } catch { return ""; }
  });
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await axios.get("/api/overview", { timeout: 10000 });
        if (!active) return;
        setAlerts(Array.isArray(response.data?.alerts) ? response.data.alerts : []);
        setLastUpdated(new Date());
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = alerts.some((alert) => !seen.split(",").includes(alert.id));
  const markSeen = () => {
    const value = alerts.map((alert) => alert.id).join(",");
    try { localStorage.setItem("snck-alerts-seen", value); } catch { /* storage unavailable */ }
    setSeen(value);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="pn-icon-btn pn-bell"
        aria-label={`Notifications${alerts.length ? `: ${alerts.length}` : ""}`}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); if (!open) markSeen(); }}
      >
        <Bell aria-hidden="true" />
        {unread ? <span className="pn-bell-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="pn-popover" role="dialog" aria-label="Notifications">
          <div className="pn-popover-head">
            <span>Notifications</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--pn-dim)" }}>
              {lastUpdated ? `checked ${timeAgo(lastUpdated)}` : "checking…"}
            </span>
          </div>
          <div className="pn-popover-list">
            {state === "loading" ? (
              <div style={{ padding: 20, color: "var(--pn-dim)", fontSize: 12 }}>Loading system signals…</div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: "24px 18px", textAlign: "center" }}>
                <CheckCircle2 size={20} color="var(--pn-green)" style={{ margin: "0 auto 8px" }} aria-hidden="true" />
                <div style={{ fontSize: 12, color: "var(--pn-muted)" }}>Everything looks healthy.</div>
                <div style={{ fontSize: 10.5, color: "var(--pn-dim)", marginTop: 4 }}>
                  {state === "error" ? "Live checks are temporarily unavailable." : "No active alerts from your infrastructure."}
                </div>
              </div>
            ) : (
              alerts.map((alert) => {
                const Icon = ICONS[alert.severity] || Info;
                return (
                  <button
                    key={alert.id}
                    type="button"
                    className={`pn-notif pn-notif--${alert.severity}`}
                    style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid rgba(255,255,255,.045)", cursor: alert.target ? "pointer" : "default" }}
                    onClick={() => {
                      if (!alert.target) return;
                      setOpen(false);
                      navigate(alert.target);
                    }}
                  >
                    <span className="pn-notif-mark"><Icon aria-hidden="true" /></span>
                    <span className="pn-notif-copy">
                      <b>{alert.title}</b>
                      <span>{alert.detail}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
