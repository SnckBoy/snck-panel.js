import React, { useState } from "react";
import axios from "axios";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { Button, Field } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

export default function LoginPage() {
  const { login } = useAuth();
  const {
    panelName,
    enableRegistration,
    enableGoogleLogin,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseProjectId,
    firebaseStorageBucket,
    firebaseMessagingSenderId,
    firebaseAppId,
  } = useSettings() as any;
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) {
      setError("Enter your username or email and password to continue.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await axios.post("/api/auth/login", { username: cleanUsername, password }, { timeout: 15000 });
      if (!response.data?.token || !response.data?.user) throw new Error("The server returned an incomplete login response.");
      login(response.data.token, response.data.user, remember);
      navigate("/", { replace: true });
    } catch (requestError: any) {
      setError(
        requestError.code === "ECONNABORTED"
          ? "The panel took too long to respond."
          : requestError.response?.data?.error || requestError.message || "Login failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    if (!firebaseApiKey || !firebaseProjectId) {
      setError("Google sign-in is not configured by the panel administrator yet.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const app = getApps().length === 0
        ? initializeApp({ apiKey: firebaseApiKey, authDomain: firebaseAuthDomain, projectId: firebaseProjectId, storageBucket: firebaseStorageBucket, messagingSenderId: firebaseMessagingSenderId, appId: firebaseAppId })
        : getApp();
      const result = await signInWithPopup(getAuth(app), new GoogleAuthProvider());
      const response = await axios.post("/api/auth/google", { idToken: await result.user.getIdToken() });
      login(response.data.token, response.data.user, remember);
      navigate("/", { replace: true });
    } catch (requestError: any) {
      setError(
        requestError.code === "auth/popup-closed-by-user"
          ? "The Google sign-in window was closed."
          : requestError.response?.data?.error || requestError.message || "Google authentication failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      panelName={panelName}
      eyebrow="Welcome back"
      title="Sign in to your panel"
      description={`Use your SNCK credentials to continue to ${panelName || "the panel"}.`}
      footer={enableRegistration !== false ? <>New to {panelName || "SNCK"}? <Link to="/register">Create an account</Link></> : undefined}
    >
      {error ? <div className="pn-callout pn-callout--danger" role="alert" style={{ marginTop: 18 }}><LockKeyhole aria-hidden="true" /><span>{error}</span></div> : null}
      <form onSubmit={submit} className="pn-auth-form" noValidate aria-busy={loading}>
        <Field label="Username or email">
          <div className="pn-input-group">
            <UserRound aria-hidden="true" />
            <input className="pn-input" type="text" name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username or you@gmail.com" />
          </div>
        </Field>
        <Field label="Password">
          <div className="pn-input-group">
            <LockKeyhole aria-hidden="true" />
            <input
              className="pn-input"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your secure password"
              style={{ paddingRight: 42 }}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} style={{ position: "absolute", right: 10, background: "none", border: 0, color: "var(--pn-dim)", display: "grid", placeItems: "center" }}>
              {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <div className="pn-between">
          <label className="pn-check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember this device</label>
          <span className="pn-dim" style={{ fontSize: 10.5 }}>Session signed server-side</span>
        </div>
        <Button tone="primary" size="lg" className="pn-btn--block" type="submit" loading={loading}>
          {loading ? "Signing in…" : <>Sign in <ArrowRight size={15} aria-hidden="true" /></>}
        </Button>
      </form>
      {enableGoogleLogin && firebaseApiKey && firebaseProjectId ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: "var(--pn-dim)", fontSize: 10.5 }}>
            <span style={{ flex: 1, height: 1, background: "var(--pn-line)" }} /> or <span style={{ flex: 1, height: 1, background: "var(--pn-line)" }} />
          </div>
          <Button tone="secondary" size="lg" className="pn-btn--block" onClick={() => void google()} disabled={loading}>Continue with Google</Button>
        </>
      ) : null}
    </AuthLayout>
  );
}
