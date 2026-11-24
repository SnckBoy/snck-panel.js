import os from "os";
import fs from "fs";

/**
 * Lightweight, real host telemetry for the panel overview.
 *
 * CPU and network rates are deltas between samples, so they are collected on a
 * background timer instead of per-request. Nothing here is simulated: when the
 * platform cannot provide a value (for example a non-Linux container without
 * /proc/net/dev) the metric is reported as unavailable rather than invented.
 */

type CpuTimes = { idle: number; total: number };

function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

function readNetwork(): { rx: number; tx: number } | null {
  try {
    const raw = fs.readFileSync("/proc/net/dev", "utf8");
    let rx = 0;
    let tx = 0;
    let found = false;
    for (const line of raw.split("\n").slice(2)) {
      const [name, values] = line.split(":");
      if (!name || !values) continue;
      if (name.trim() === "lo") continue;
      const fields = values.trim().split(/\s+/).map(Number);
      if (fields.length < 9 || !Number.isFinite(fields[0])) continue;
      rx += fields[0];
      tx += fields[8];
      found = true;
    }
    return found ? { rx, tx } : null;
  } catch {
    return null;
  }
}

function readDisk(): { total: number; used: number; free: number } | null {
  try {
    const stats = fs.statfsSync("/");
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bfree) * Number(stats.bsize);
    if (!Number.isFinite(total) || total <= 0) return null;
    return { total, used: total - free, free };
  } catch {
    return null;
  }
}

let previousCpu = readCpuTimes();
let previousNetwork = readNetwork();
let previousNetworkAt = Date.now();

let cpuUsage = 0;
let networkRate = { rxPerSecond: 0, txPerSecond: 0 };
let networkTotals = previousNetwork || { rx: 0, tx: 0 };
let networkAvailable = Boolean(previousNetwork);
let lastSampleAt = Date.now();

export type HistoryPoint = {
  t: number;
  cpu: number;
  memory: number;
  serversOnline?: number;
  nodesOnline?: number;
};

const history: HistoryPoint[] = [];
const HISTORY_LIMIT = 48;
const HISTORY_MIN_INTERVAL_MS = 12_000;
let lastHistoryAt = 0;

function sample() {
  const now = Date.now();
  const currentCpu = readCpuTimes();
  const idleDelta = currentCpu.idle - previousCpu.idle;
  const totalDelta = currentCpu.total - previousCpu.total;
  if (totalDelta > 0) cpuUsage = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  previousCpu = currentCpu;

  const currentNetwork = readNetwork();
  if (currentNetwork && previousNetwork) {
    const seconds = Math.max(0.5, (now - previousNetworkAt) / 1000);
    networkRate = {
      rxPerSecond: Math.max(0, (currentNetwork.rx - previousNetwork.rx) / seconds),
      txPerSecond: Math.max(0, (currentNetwork.tx - previousNetwork.tx) / seconds),
    };
    networkAvailable = true;
  }
  if (currentNetwork) {
    networkTotals = currentNetwork;
    previousNetwork = currentNetwork;
    previousNetworkAt = now;
  }
  lastSampleAt = now;
}

sample();
const timer = setInterval(sample, 5000);
if (typeof timer.unref === "function") timer.unref();

export function getHostMetrics() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const disk = readDisk();
  return {
    cpu: Number(cpuUsage.toFixed(1)),
    load: os.loadavg().map((value) => Number(value.toFixed(2))),
    cores: os.cpus().length,
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: totalMemory - freeMemory,
      percent: totalMemory > 0 ? Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(1)) : 0,
    },
    disk: disk
      ? { ...disk, percent: disk.total > 0 ? Number(((disk.used / disk.total) * 100).toFixed(1)) : 0 }
      : null,
    network: {
      available: networkAvailable,
      rxTotal: networkTotals.rx,
      txTotal: networkTotals.tx,
      rxPerSecond: Math.round(networkRate.rxPerSecond),
      txPerSecond: Math.round(networkRate.txPerSecond),
    },
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    sampledAt: new Date(lastSampleAt).toISOString(),
  };
}

/** Append a fleet snapshot to the rolling overview history. */
export function recordFleetPoint(point: Omit<HistoryPoint, "t" | "cpu" | "memory">) {
  const now = Date.now();
  if (now - lastHistoryAt < HISTORY_MIN_INTERVAL_MS) return;
  lastHistoryAt = now;
  const metrics = getHostMetrics();
  history.push({ t: now, cpu: metrics.cpu, memory: metrics.memory.percent, ...point });
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
}

export function getFleetHistory() {
  return history.slice();
}
