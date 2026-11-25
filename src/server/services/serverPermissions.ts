/**
 * Single source of truth for per-server authorization.
 *
 * Both the legacy Express guard (routes/servers.ts) and the production
 * authorization service (services/production/authorization.ts) resolve
 * permissions through this module, so the two systems cannot drift apart.
 *
 * Rules:
 * - Administrators and the server owner always keep full access.
 * - Sub-users only get what their (string, array) permission list grants.
 * - A missing, malformed or empty permission list grants nothing.
 * - Unclassified routes are denied for sub-users instead of silently allowed.
 */

export const CANONICAL_PERMISSIONS = [
  "server.start",
  "server.stop",
  "server.restart",
  "server.kill",
  "console.read",
  "console.command",
  "files.read",
  "files.write",
  "files.upload",
  "files.delete",
  "server.settings",
  "server.properties",
  "plugins.manage",
  "mods.manage",
  "players.manage",
  "sftp.manage",
  "subusers.manage",
  "worlds.read",
  "worlds.manage",
  "backups.read",
  "backups.create",
  "backups.restore",
  "backups.delete",
] as const;

export type CanonicalPermission = typeof CANONICAL_PERMISSIONS[number];

/**
 * Legacy short names keep working, but they are expanded into the canonical
 * capabilities they always meant. The coarse "backup" / "backups" grants cover
 * the whole backup lifecycle; the granular names only cover their own action.
 */
const BACKUP_FULL = [
  "backup",
  "backups",
  "backup.manage",
  "backups.manage",
  "backup.management",
  "backups.management",
];

const WORLD_READ_EXTRA = ["files", "files.read", "files.download"];
const WORLD_MANAGE = [
  "worlds.manage",
  "world.manage",
  "worlds.management",
  "world.management",
  "worlds.write",
  "world.write",
  "worlds",
  "world",
];

const ALIASES: Record<CanonicalPermission, readonly string[]> = {
  "server.start": ["start", "server.start"],
  "server.stop": ["stop", "server.stop"],
  "server.restart": ["restart", "server.restart"],
  "server.kill": ["kill", "server.kill"],
  "console.read": ["start", "console.read", "console.view"],
  "console.command": ["start", "console.command"],
  "files.read": ["files", "files.read", "files.download", "files.list"],
  "files.write": ["files", "files.write", "files.edit"],
  "files.upload": ["files", "files.upload", "files.write"],
  "files.delete": ["files", "files.delete"],
  "server.settings": ["settings", "server.settings"],
  "server.properties": ["properties", "server.properties", "settings", "files"],
  "plugins.manage": ["plugins", "plugins.manage"],
  "mods.manage": ["mods", "mods.manage"],
  "players.manage": ["players", "players.manage"],
  "sftp.manage": ["sftp", "sftp.manage", "files"],
  "subusers.manage": ["subusers", "subusers.manage"],
  "worlds.read": ["worlds.read", "world.read", ...WORLD_MANAGE, ...WORLD_READ_EXTRA],
  "worlds.manage": [...WORLD_MANAGE],
  "backups.read": [...BACKUP_FULL, "backup.read", "backups.read"],
  "backups.create": [...BACKUP_FULL, "backup.create", "backups.create", "backup.write", "backups.write"],
  "backups.restore": [...BACKUP_FULL, "backup.restore", "backups.restore", "backup.write", "backups.write"],
  "backups.delete": [...BACKUP_FULL, "backup.delete", "backups.delete", "backup.write", "backups.write"],
};

const ALIAS_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();
  for (const [permission, aliases] of Object.entries(ALIASES) as Array<[CanonicalPermission, readonly string[]]>) {
    const accepted = new Set<string>([permission, ...aliases]);
    index.set(permission, accepted);
  }
  return index;
})();

export type ServerLike = {
  id?: string;
  owner?: string;
  ownerId?: string;
  suspended?: boolean;
  discordRewardSuspension?: boolean;
  subUsers?: Array<{ userId?: string; permissions?: unknown }>;
};

export type PrincipalLike = { id?: string; role?: string } | null | undefined;

export const isStaffRole = (role: unknown): boolean => {
  const value = String(role || "").toLowerCase();
  return value === "admin" || value === "administrator" || value === "owner";
};

export const isStaffUser = (user: PrincipalLike): boolean => isStaffRole(user?.role);

/** Membership lookup that tolerates malformed records instead of throwing. */
export function findServerMembership(server: ServerLike | undefined, userId: unknown) {
  if (!server || !Array.isArray(server.subUsers) || typeof userId !== "string" || !userId) return undefined;
  return server.subUsers.find((entry) => entry && entry.userId === userId);
}

/** Only a well-formed array of non-empty strings can grant anything. */
export function normalizePermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

/** Effective grants for a principal: staff/owner get "*", members their list. */
export function effectivePermissions(server: ServerLike | undefined, user: PrincipalLike): string[] {
  if (isStaffUser(user)) return ["*"];
  const owner = server?.owner ?? server?.ownerId;
  if (owner && typeof user?.id === "string" && owner === user.id) return ["*"];
  return normalizePermissions(findServerMembership(server, user?.id)?.permissions);
}

/**
 * Owner/staff check for server-wide decisions that are never delegated to
 * sub-users, such as rewriting or deleting the backup schedule.
 */
export function isServerOwnerOrStaff(server: ServerLike | undefined, user: PrincipalLike): boolean {
  if (!user?.id || !server) return false;
  if (isStaffUser(user)) return true;
  const owner = server.owner ?? server.ownerId;
  return typeof owner === "string" && owner === user.id;
}

export type PermissionCheckOptions = {
  /** Production servers treat `suspended` as a hard block, even for the owner. */
  respectSuspension?: boolean;
};

export function hasServerPermission(
  server: ServerLike | undefined,
  user: PrincipalLike,
  permission: CanonicalPermission,
  options: PermissionCheckOptions = {},
): boolean {
  if (!user?.id) return false;
  if (!server) return false;
  if (options.respectSuspension && server.suspended === true && !isStaffUser(user)) return false;
  const granted = effectivePermissions(server, user);
  if (granted.length === 0) return false;
  if (granted.includes("*")) return true;
  const accepted = ALIAS_INDEX.get(permission) ?? new Set<string>([permission]);
  return granted.some((value) => accepted.has(value));
}

export type RouteRequirement = CanonicalPermission | "membership" | "deny";

/**
 * Classify a request below the /:id mount. Reads that expose server metadata
 * only need membership; every mutating or sensitive route needs an explicit
 * canonical permission, and anything unrecognised is denied.
 */
export function classifyServerRoute(
  method: string,
  routePath: string,
  options: { propertyFile?: boolean } = {},
): RouteRequirement {
  const verb = String(method || "GET").toUpperCase();
  const readOnly = verb === "GET" || verb === "HEAD" || verb === "OPTIONS";
  const raw = String(routePath || "/").split("?")[0].replace(/\\/g, "/").replace(/\/+$/, "");
  const pathname = `/${raw.replace(/^\/+/, "")}`;
  const matches = (pattern: RegExp) => pattern.test(pathname);

  if (pathname === "/") return readOnly ? "membership" : "deny";
  if (matches(/^\/(?:start|stop|restart|kill)$/)) return `server.${pathname.slice(1)}` as CanonicalPermission;
  if (matches(/^\/command$/)) return "console.command";
  if (matches(/^\/(?:logs|stats)$/)) return "console.read";
  if (matches(/^\/files(?:\/|$)/)) {
    if (options.propertyFile) return "server.properties";
    if (readOnly) return "files.read";
    if (matches(/^\/files\/(?:upload|upload-chunk)$/)) return "files.upload";
    if (verb === "DELETE") return "files.delete";
    return "files.write";
  }
  if (matches(/^\/(?:modpacks|mods)(?:\/|$)/)) return "mods.manage";
  if (matches(/^\/plugins(?:\/|$)/)) return "plugins.manage";
  if (matches(/^\/backup-schedule(?:\/|$)/)) {
    if (readOnly) return "backups.read";
    if (matches(/^\/backup-schedule\/run$/)) return "backups.create";
    // Writing or deleting the schedule itself is an owner/staff decision; a
    // sub-user may run the schedule they were given but never redefine it.
    return "deny";
  }
  if (matches(/^\/backups(?:\/|$)/)) {
    if (matches(/\/verify$/)) return "backups.read";
    if (matches(/\/restore$/)) return "backups.restore";
    if (verb === "DELETE") return "backups.delete";
    if (readOnly) return "backups.read";
    return "backups.create";
  }
  if (matches(/^\/worlds(?:\/|$)/)) {
    return readOnly ? "worlds.read" : "worlds.manage";
  }
  if (matches(/^\/(?:version|java-version|resources|suspend)$/)) return "server.settings";
  if (matches(/^\/sftp(?:\/|$)/)) return "sftp.manage";
  // Sub-user administration and Playit tunnels stay staff/owner-only; those
  // handlers keep their own explicit owner/staff checks as well.
  if (matches(/^\/(?:subusers|playit|owner|ipalias)(?:\/|$)/)) return "deny";
  return "deny";
}
