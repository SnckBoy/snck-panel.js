import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { Button, Field, Spinner } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

export default function SetupPage() {
  const { panelName } = useSettings() as any;
  const { setupRequired, refreshSetupStatus, markSetupComplete } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void refreshSetupStatus().then((required: boolean) => {
      if (!active) return;
      if (!required) { navigate("/login", { replace: true }); return; }
      setChecking(false);
    });
    return () => { active = false; };
  }, [navigate, refreshSetupStatus]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username.trim())) { setError("Username must be 3–32 characters using letters, numbers, dots, underscores or hyphens."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Password must be 8–256 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      await axios.post("/api/auth/setup", { username: username.trim(), email: email.trim().toLowerCase(), password, confirmPassword });
      markSetupComplete();
      setSuccess("Owner account created. Redirecting to sign in…");
      window.setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (requestError: any) {
      const data = requestError.response?.data;
      setError(data?.error || "Owner setup could not be completed.");
      if (data?.setupRequired === false || requestError.response?.status === 409) markSetupComplete();
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="pn-loading-boot">
        <Spinner large />
        <span className="pn-dim" style={{ fontSize: 12 }}>Checking secure setup status…</span>
      </div>
    );
  }

  return (
    <AuthLayout
      panelName={panelName}
      eyebrow="First-run setup"
      title="Create the owner account"
      description="This page is available only while the panel has no users. The first account receives Owner access."
      footer={<>Setup already completed? <Link to="/login">Sign in</Link></>}
    >
      {error ? <div className="pn-callout pn-callout--danger" role="alert" style={{ marginTop: 18 }}><LockKeyhole aria-hidden="true" /><span>{error}</span></div> : null}
      {success ? <div className="pn-callout pn-callout--accent" role="status" style={{ marginTop: 18 }}><LockKeyhole aria-hidden="true" /><span>{success}</span></div> : null}
      <form onSubmit={submit} className="pn-auth-form" noValidate aria-busy={submitting}>
        <Field label="Owner username">
          <div className="pn-input-group">
            <UserRound aria-hidden="true" />
            <input className="pn-input" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="owner" />
          </div>
        </Field>
        <Field label="Owner email">
          <div className="pn-input-group">
            <Mail aria-hidden="true" />
            <input className="pn-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" />
          </div>
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <div className="pn-input-group">
            <LockKeyhole aria-hidden="true" />
            <input className="pn-input" type={show ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choose a strong password" style={{ paddingRight: 42 }} />
            <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"} style={{ position: "absolute", right: 10, background: "none", border: 0, color: "var(--pn-dim)" }}>
              {show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm password">
          <div className="pn-input-group">
            <LockKeyhole aria-hidden="true" />
            <input className="pn-input" type={show ? "text" : "password"} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" />
          </div>
        </Field>
        <Button tone="primary" size="lg" className="pn-btn--block" type="submit" loading={submitting}>Create owner account</Button>
      </form>
    </AuthLayout>
  );
}
