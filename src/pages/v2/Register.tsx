import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { useSettings } from "../../context/SettingsContext";
import { Button, Field } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

export default function RegisterPage() {
  const { panelName, enableRegistration } = useSettings() as any;
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const cleanUsername = username.trim().toLowerCase();
    if (enableRegistration === false) { setError("Registration is disabled by the panel administrator."); return; }
    if (!/^[a-z0-9_.-]{3,32}$/.test(cleanUsername)) { setError("Use 3–32 characters: lowercase letters, numbers, dots, underscores or hyphens."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await axios.post("/api/auth/register", { username: cleanUsername, password, confirmPassword }, { timeout: 15000 });
      setSuccess("Account created. Redirecting to sign in…");
      window.setTimeout(() => navigate("/login", { replace: true }), 1000);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      panelName={panelName}
      eyebrow="New account"
      title="Create your access"
      description="A secure account gives you a personal server workspace. Roles and limits are managed by the owner."
      footer={<>Already registered? <Link to="/login">Sign in</Link></>}
    >
      {error ? <div className="pn-callout pn-callout--danger" role="alert" style={{ marginTop: 18 }}><LockKeyhole aria-hidden="true" /><span>{error}</span></div> : null}
      {success ? <div className="pn-callout pn-callout--accent" role="status" style={{ marginTop: 18 }}><LockKeyhole aria-hidden="true" /><span>{success}</span></div> : null}
      {enableRegistration === false ? (
        <div className="pn-callout pn-callout--warning" style={{ marginTop: 18 }}><LockKeyhole aria-hidden="true" /><span>Registration is currently disabled. Ask the owner for an account.</span></div>
      ) : null}
      <form onSubmit={submit} className="pn-auth-form" noValidate aria-busy={loading}>
        <Field label="Username">
          <div className="pn-input-group">
            <UserRound aria-hidden="true" />
            <input className="pn-input" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="choose-a-username" disabled={enableRegistration === false} />
          </div>
        </Field>
        <Field label="Password" hint="8–256 characters. Stored only as a bcrypt hash.">
          <div className="pn-input-group">
            <LockKeyhole aria-hidden="true" />
            <input className="pn-input" type={show ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" disabled={enableRegistration === false} style={{ paddingRight: 42 }} />
            <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"} style={{ position: "absolute", right: 10, background: "none", border: 0, color: "var(--pn-dim)" }}>
              {show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm password">
          <div className="pn-input-group">
            <LockKeyhole aria-hidden="true" />
            <input className="pn-input" type={show ? "text" : "password"} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" disabled={enableRegistration === false} />
          </div>
        </Field>
        <Button tone="primary" size="lg" className="pn-btn--block" type="submit" loading={loading} disabled={enableRegistration === false}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
