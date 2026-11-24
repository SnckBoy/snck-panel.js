/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { motion, MotionConfig } from "framer-motion";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { AppShell } from "./components/shell/AppShell";
import { SnckMark } from "./components/brand/Logo";
import { SystemUpdateListener } from "./components/SystemUpdateListener";

const Login = lazy(() => import("./pages/v2/Login"));
const Register = lazy(() => import("./pages/v2/Register"));
const Setup = lazy(() => import("./pages/v2/Setup"));
const Dashboard = lazy(() => import("./pages/v2/Dashboard"));
const Servers = lazy(() => import("./pages/v2/Servers"));
const CreateServerPage = lazy(() => import("./pages/v2/CreateServer"));
const ServerDetail = lazy(() => import("./pages/v2/ServerDetail"));
const NodesPage = lazy(() => import("./pages/v2/Nodes"));
const UsersPage = lazy(() => import("./pages/v2/Users"));
const ApiKeysPage = lazy(() => import("./pages/v2/ApiKeys"));
const ActivityPage = lazy(() => import("./pages/v2/Activity"));
const AdminPage = lazy(() => import("./pages/v2/Admin"));
const SettingsPage = lazy(() => import("./pages/v2/Settings"));
const Allocations = lazy(() => import("./pages/Allocations"));
const Cloudflare = lazy(() => import("./pages/Cloudflare"));
const SnckTheme = lazy(() => import("./pages/SnckTheme"));
const DiscordRewards = lazy(() => import("./pages/DiscordRewards"));
const CoreCheckpoint = lazy(() => import("./pages/CoreCheckpoint"));

function BootScreen() {
  return (
    <div className="pn-loading-boot">
      <div className="pn-brand-mark"><SnckMark /></div>
      <div className="pn-boot-bar"><span /></div>
      <span className="pn-dim" style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase" }}>Securing workspace</span>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, setupRequired } = useAuth();
  if (loading || setupRequired === null) return <BootScreen />;
  if (!user) return <Navigate to={setupRequired ? "/setup" : "/login"} replace />;
  return <AppShell>{children}</AppShell>;
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin" && user?.role !== "owner") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicAuthRoute({ children }: { children: React.ReactNode }) {
  const { setupRequired, loading } = useAuth();
  if (loading || setupRequired === null) return <BootScreen />;
  if (setupRequired) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function RouteFallback() {
  return <div className="pn-route-loading"><span className="pn-spinner" aria-hidden="true" /> Loading workspace…</div>;
}

function AnimatedRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/core-checkpoint" element={<CoreCheckpoint />} />
        <Route path="/login" element={<PublicAuthRoute><Login /></PublicAuthRoute>} />
        <Route path="/register" element={<PublicAuthRoute><Register /></PublicAuthRoute>} />

        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
        <Route path="/servers/create" element={<ProtectedRoute><CreateServerPage /></ProtectedRoute>} />
        <Route path="/servers/:id/*" element={<ProtectedRoute><ServerDetail /></ProtectedRoute>} />
        <Route path="/nodes" element={<ProtectedRoute><NodesPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><AdminOnlyRoute><UsersPage /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/activity" element={<ProtectedRoute><AdminOnlyRoute><ActivityPage /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminOnlyRoute><AdminPage /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/api-keys" element={<ProtectedRoute><AdminOnlyRoute><ApiKeysPage /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/allocations" element={<ProtectedRoute><AdminOnlyRoute><Allocations /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/cloudflare" element={<ProtectedRoute><AdminOnlyRoute><Cloudflare /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/snck-theme" element={<ProtectedRoute><AdminOnlyRoute><SnckTheme /></AdminOnlyRoute></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/free-service/discord" element={<ProtectedRoute><DiscordRewards /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function PanelExperience() {
  const { reducedMotion } = useSettings();
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <motion.div initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} style={{ height: "100dvh" }}>
        <AnimatedRoutes />
      </motion.div>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SettingsProvider>
          <AuthProvider>
            <SystemUpdateListener />
            <Router>
              <PanelExperience />
            </Router>
          </AuthProvider>
        </SettingsProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
