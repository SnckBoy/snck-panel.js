import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  ChevronRight,
  Cloud,
  Gift,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Waypoints,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { Brand } from "../brand/Logo";
import { CommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";

type NavItem = { label: string; path: string; icon: React.ElementType; adminOnly?: boolean; exact?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { label: "Overview", path: "/", icon: LayoutDashboard, exact: true },
      { label: "Servers", path: "/servers", icon: Server },
      { label: "Deploy server", path: "/servers/create", icon: Plus },
      { label: "Nodes", path: "/nodes", icon: Waypoints },
      { label: "Allocations", path: "/allocations", icon: SlidersHorizontal, adminOnly: true },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Users & access", path: "/users", icon: Users, adminOnly: true },
      { label: "API keys", path: "/api-keys", icon: KeyRound, adminOnly: true },
      { label: "Control center", path: "/admin", icon: ShieldCheck, adminOnly: true },
      { label: "Activity & audit", path: "/activity", icon: Activity, adminOnly: true },
    ],
  },
  {
    title: "Add-ons",
    items: [
      { label: "Discord rewards", path: "/free-service/discord", icon: Gift },
      { label: "Cloudflare DNS", path: "/cloudflare", icon: Cloud, adminOnly: true },
      { label: "Appearance studio", path: "/snck-theme", icon: Palette, adminOnly: true },
    ],
  },
  {
    title: "System",
    items: [{ label: "Settings", path: "/settings", icon: Settings }],
  },
];

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/servers": "Servers",
  "/servers/create": "Deploy server",
  "/nodes": "Nodes",
  "/allocations": "Network allocations",
  "/users": "Users & access",
  "/api-keys": "API keys",
  "/admin": "Control center",
  "/activity": "Activity & audit",
  "/settings": "Settings",
  "/cloudflare": "Cloudflare DNS",
  "/snck-theme": "Appearance studio",
  "/free-service/discord": "Discord rewards",
};

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.path;
  if (item.path === "/servers") return pathname === "/servers" || (pathname.startsWith("/servers/") && pathname !== "/servers/create");
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { panelName } = useSettings();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("snck-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const staff = user?.role === "admin" || user?.role === "owner";
  const immersive = /^\/servers\/[^/]+/.test(location.pathname) && location.pathname !== "/servers/create";

  useEffect(() => {
    try { localStorage.setItem("snck-sidebar-collapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(
    () =>
      NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => staff || !item.adminOnly),
      })).filter((group) => group.items.length > 0),
    [staff],
  );

  const title = TITLES[location.pathname] || (location.pathname.startsWith("/servers/") ? "Server workspace" : "SNCK");
  const initials = String(user?.username || "SN").slice(0, 2).toUpperCase();
  const navBadges: Record<string, string> = {};

  return (
    <div className={`pn-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      {mobileOpen ? <div className="pn-backdrop-shell" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}
      <aside className="pn-sidebar" aria-label="Main navigation">
        <div className="pn-sidebar-head">
          <Link to="/" aria-label={`${panelName} overview`} style={{ display: "flex", minWidth: 0 }}>
            <Brand name={panelName || "SNCK"} compact={collapsed} />
          </Link>
          <button type="button" className="pn-icon-btn" onClick={() => setMobileOpen(false)} aria-label="Close navigation" style={{ display: "grid" }} data-mobile-close="true">
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="pn-sidebar-nav">
          {groups.map((group) => (
            <div className="pn-nav-group" key={group.title}>
              <div className="pn-nav-label">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(location.pathname, item);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`pn-nav-link ${active ? "is-active" : ""}`}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {navBadges[item.label] ? <b className="pn-nav-badge">{navBadges[item.label]}</b> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="pn-sidebar-foot">
          <button
            type="button"
            className="pn-user-chip"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}
          >
            <span className="pn-avatar">{initials}</span>
            <span className="pn-user-meta">
              <span className="pn-user-name">{user?.username || "Operator"}</span>
              <span className="pn-user-role">{user?.role || "user"}</span>
            </span>
            <ChevronRight size={14} style={{ color: "var(--pn-dim)", transform: menuOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} aria-hidden="true" />
          </button>
          {menuOpen && !collapsed ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              <Link to="/settings" className="pn-nav-link" style={{ padding: "8px 10px" }}>
                <Settings aria-hidden="true" /> <span>Account settings</span>
              </Link>
              <button
                type="button"
                className="pn-nav-link"
                style={{ padding: "8px 10px", background: "none", border: 0, width: "100%", textAlign: "left" }}
                onClick={() => logout()}
              >
                <LogOut aria-hidden="true" /> <span>Sign out</span>
              </button>
            </div>
          ) : null}
          <div className="pn-credit">
            SNCK PANEL · Created by Clark<br />
            Discord: root_dora
          </div>
        </div>
      </aside>

      <div className="pn-shell-main">
        <header className="pn-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button type="button" className="pn-icon-btn" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-mobile-menu="true">
              <Menu aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pn-icon-btn pn-hide-sm"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu aria-hidden="true" />
            </button>
            <div className="pn-crumbs">
              <span className="pn-hide-sm">SNCK</span>
              <ChevronRight size={12} className="pn-hide-sm" aria-hidden="true" />
              <strong>{title}</strong>
            </div>
          </div>
          <div className="pn-topbar-actions">
            <button type="button" className="pn-search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search panel">
              <Search aria-hidden="true" />
              <span>Search anything…</span>
              <kbd>⌘K</kbd>
            </button>
            <NotificationBell />
            <Link to="/servers/create" className="pn-btn pn-btn--primary pn-btn--sm pn-hide-sm" style={{ height: 34 }}>
              <Plus aria-hidden="true" /> New server
            </Link>
          </div>
        </header>

        <div className="pn-content-scroll" style={immersive ? { overflow: "hidden" } : undefined}>
          {immersive ? (
            children
          ) : (
            <main className="pn-content" id="main-content" tabIndex={-1}>
              {children}
            </main>
          )}
        </div>
      </div>

      <nav className="pn-mobilebar" aria-label="Quick navigation">
        {[
          { path: "/", label: "Home", icon: LayoutDashboard, exact: true },
          { path: "/servers", label: "Servers", icon: Server },
          { path: "/nodes", label: "Nodes", icon: Waypoints },
          { path: "/settings", label: "Settings", icon: Settings },
        ]
          .filter((item) => staff || item.path !== "/nodes")
          .map((item) => {
            const Icon = item.icon;
            const active = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} className={active ? "is-active" : ""}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
