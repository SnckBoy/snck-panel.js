import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

export type OverviewHistoryPoint = { t: number; cpu: number; memory: number; serversOnline?: number; nodesOnline?: number };

export type Overview = {
  generatedAt: string;
  role: string;
  maintenance: { enabled: boolean; message: string };
  servers: { total: number; online: number; offline: number; suspended: number; maintenance: number; createdLastDay: number };
  nodes: { total: number; online: number; offline: number; maintenance: number };
  users: { total: number | null; admins: number | null };
  panel: {
    cpu: number;
    load: number[];
    cores: number;
    memory: { total: number; free: number; used: number; percent: number };
    disk: { total: number; used: number; free: number; percent: number } | null;
    network: { available: boolean; rxTotal: number; txTotal: number; rxPerSecond: number; txPerSecond: number };
    uptime: number;
    hostname: string;
    platform: string;
    sampledAt: string;
  };
  fleet: {
    cpuAverage: number | null;
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    network: { rxBytes: number; txBytes: number; rxPerSecond: number; txPerSecond: number; available: boolean };
  };
  nodeHealth: Array<{
    id: string;
    name: string;
    status: string;
    isLocal: boolean;
    location: string;
    cpu: number | null;
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    lastHeartbeat: string | null;
    servers: { total: number; running: number } | null;
    docker: any;
  }>;
  recentServers: Array<{ id: string; name: string; status: string; type?: string; version?: string; nodeName: string; createdAt: string }>;
  activity: Array<{ id: string; action: string; label: string; actorId: string; at: string; ip?: string }>;
  history: OverviewHistoryPoint[];
  alerts: Array<{ id: string; severity: "info" | "warning" | "danger" | "success"; title: string; detail: string; target?: string }>;
};

/**
 * Polls the permission-scoped overview endpoint. The interval pauses while the
 * tab is hidden so idle dashboards do not keep hammering the API.
 */
export function useOverview(pollMs = 15000) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const response = await axios.get<Overview>("/api/overview", { timeout: 15000 });
      setData(response.data);
      setLastUpdated(new Date());
      setError("");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || requestError?.message || "Unable to load panel data.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, pollMs);
    const onVisible = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, pollMs]);

  return { data, error, loading, lastUpdated, refetch: () => load(true) };
}
