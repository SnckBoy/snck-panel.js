import React from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { Brand } from "../../components/brand/Logo";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  panelName,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelName: string;
}) {
  return (
    <div className="pn-auth">
      <aside className="pn-auth-aside">
        <div className="pn-auth-brand">
          <Brand name={panelName || "SNCK"} />
        </div>
        <div className="pn-auth-hero">
          <div className="pn-eyebrow"><span className="pn-dot is-live" style={{ color: "var(--pn-accent)" }} /> Game server infrastructure</div>
          <h1>Run your worlds.<br /><em>Own the stack.</em></h1>
          <p>
            A pure-black control plane for Minecraft servers, nodes and VPS infrastructure.
            Deploy, monitor and manage everything from one focused workspace.
          </p>
          <div className="pn-auth-points">
            {[
              "Authenticated node heartbeats and one-time registration tokens",
              "Real-time console, file manager, backups and plugin tooling",
              "Role-based access with audit-backed activity history",
            ].map((line) => (
              <div key={line}><CheckCircle2 aria-hidden="true" /> {line}</div>
            ))}
          </div>
        </div>
        <div className="pn-auth-credit">SNCK PANEL · Created by Clark · Discord root_dora</div>
      </aside>
      <main className="pn-auth-main">
        <div className="pn-auth-card">
          <div className="pn-eyebrow">{eyebrow}</div>
          <h2 style={{ marginTop: 10 }}>{title}</h2>
          <p>{description}</p>
          {children}
          {footer ? <div className="pn-auth-alt">{footer}</div> : null}
          <div className="pn-auth-note"><LockKeyhole aria-hidden="true" /> Passwords are bcrypt-hashed. Sessions are signed and validated server-side.</div>
        </div>
      </main>
    </div>
  );
}
