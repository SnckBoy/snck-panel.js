import { errors } from "./errors.js";
import { hasServerPermission, isStaffRole, type CanonicalPermission } from "../serverPermissions.js";

export const PERMISSIONS = [
  "console.read", "console.command", "files.read", "files.write", "files.delete", "files.upload", "files.download",
  "server.start", "server.stop", "server.restart", "server.kill", "server.settings", "server.properties", "server.delete",
  "backups.read", "backups.create", "backups.restore", "backups.delete", "plugins.manage", "mods.manage", "players.manage",
  "sftp.manage", "subusers.manage", "worlds.read", "worlds.manage", "activity.read", "server.migrate",
] as const;
export type Permission = typeof PERMISSIONS[number];

export type AccessPrincipal = { id: string; role?: string; permissions?: string[]; disabled?: boolean };
export type OwnedServer = { id: string; ownerId: string; suspended?: boolean; subUsers?: Array<{ userId: string; permissions: string[] }> };

export function requireActive(principal: AccessPrincipal | null | undefined) {
  if (!principal) throw errors.unauthenticated();
  if (principal.disabled) throw errors.forbidden("This account is disabled");
  return principal;
}

/**
 * Delegates to the shared resolver so the production authorization layer and
 * the legacy Express guard always agree about who may do what.
 */
export function can(principal: AccessPrincipal, server: OwnedServer, permission: Permission) {
  requireActive(principal);
  if (isStaffRole(principal.role)) return true;
  // Production names that describe a capability the shared model expresses
  // through a broader permission.
  const canonical: CanonicalPermission = permission === "files.download"
    ? "files.read"
    : permission as CanonicalPermission;
  return hasServerPermission(
    {
      id: server.id,
      ownerId: server.ownerId,
      suspended: server.suspended,
      subUsers: server.subUsers,
    },
    principal,
    canonical,
    { respectSuspension: true },
  );
}

export function assertPermission(principal: AccessPrincipal, server: OwnedServer, permission: Permission) {
  if (!can(principal, server, permission)) throw errors.forbidden(`Missing permission: ${permission}`);
}

export function assertAdmin(principal: AccessPrincipal) {
  requireActive(principal);
  if (principal.role !== "admin" && principal.role !== "administrator") throw errors.forbidden("Administrator access required");
}
