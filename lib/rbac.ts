import type { User } from '@auth0/nextjs-auth0/types';

export type UserRole = 'admin' | 'manager' | 'client';

export interface UserWithRoles extends User {
  roles?: string[];
  permissions?: string[];
}

const DEFAULT_ROLE_NAMESPACE = 'https://assembledview.com/roles';
const ALT_ROLE_NAMESPACE = 'https://assembledview.com.au/roles';
const DEFAULT_CLIENT_NAMESPACE = 'https://assembledview.com/client';
const ALT_CLIENT_NAMESPACE = 'https://assembledview.com.au/client';

// Build a list of namespace candidates so both .com and .com.au claims work.
function buildNamespaceCandidates(
  envValue: string | undefined,
  defaultNamespace: string,
  altNamespace: string
) {
  const primary = envValue || defaultNamespace;
  const swapped =
    primary.includes('.com.au') ? primary.replace('.com.au', '.com') : primary.replace('.com', '.com.au');
  const candidates = [primary, swapped, altNamespace, defaultNamespace]
    .filter(Boolean)
    .map((ns) => ns.trim());
  return Array.from(new Set(candidates));
}

const ROLE_NAMESPACE_CANDIDATES = buildNamespaceCandidates(
  process.env.NEXT_PUBLIC_AUTH0_ROLE_NAMESPACE || process.env.AUTH0_ROLE_NAMESPACE,
  DEFAULT_ROLE_NAMESPACE,
  ALT_ROLE_NAMESPACE
);

const CLIENT_NAMESPACE_CANDIDATES = buildNamespaceCandidates(
  process.env.NEXT_PUBLIC_AUTH0_CLIENT_NAMESPACE || process.env.AUTH0_CLIENT_NAMESPACE,
  DEFAULT_CLIENT_NAMESPACE,
  ALT_CLIENT_NAMESPACE
);

const DEBUG_AUTH_ENABLED = process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true';

// Define role hierarchy and permissions
export const ROLE_PERMISSIONS = {
  admin: [
    'read:users',
    'write:users',
    'delete:users',
    'read:mediaplans',
    'write:mediaplans',
    'delete:mediaplans',
    'read:clients',
    'write:clients',
    'delete:clients',
    'read:publishers',
    'write:publishers',
    'delete:publishers',
    'read:finance',
    'write:finance',
    'read:management',
    'write:management',
    'read:reports',
    'write:reports',
  ],
  manager: [
    'read:mediaplans',
    'write:mediaplans',
    'read:clients',
    'write:clients',
    'read:publishers',
    'write:publishers',
    'read:finance',
    'write:finance',
    'read:management',
    'write:management',
    'read:reports',
    'write:reports',
  ],
  client: [
    'read:own:mediaplans',
    'read:own:clients',
  ],
} satisfies Record<UserRole, string[]>;

function coerceToStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object' && 'name' in (value as Record<string, unknown>)) {
    const nameVal = (value as Record<string, unknown>).name;
    return typeof nameVal === 'string' ? [nameVal] : [];
  }
  return [];
}

function normalizeRole(role: string): UserRole | null {
  const lower = role.toLowerCase();
  if (
    lower === 'admin' ||
    lower === 'assembled admin' ||
    lower === 'assembled_admin' ||
    lower === 'assembled-admin' ||
    lower === 'assembledadmin'
  ) return 'admin';
  if (lower === 'manager') return 'manager';
  if (lower === 'client') return 'client';
  return null;
}

function getClaimArray(user: User, claim: string | string[]): string[] {
  const claims = Array.isArray(claim) ? claim : [claim];
  const values: unknown[] = [];

  for (const c of claims) {
    const val = (user as Record<string, unknown>)[c];
    if (val !== undefined) {
      values.push(val);
    }
  }

  if (values.length === 0) return [];

  const flattened = values.flatMap((value) => {
    if (Array.isArray(value)) {
      return (value as unknown[]).map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in (item as Record<string, unknown>)) {
          const nameVal = (item as Record<string, unknown>).name;
          return typeof nameVal === 'string' ? nameVal : '';
        }
        return '';
      });
    }
    if (typeof value === 'string') return [value];
    return [];
  });

  return flattened.filter(Boolean);
}

function namespaceWithSingular(claim: string) {
  return `${claim.replace(/\/roles$/, '')}/role`;
}

type RoleNamespaceScanResult = {
  roles: string[];
  claimKeyUsed: string | null;
  claimKeysWithValues: string[];
};

function scanRoleNamespaces(user: User): RoleNamespaceScanResult {
  const claimKeys = [
    ...ROLE_NAMESPACE_CANDIDATES,
    ...ROLE_NAMESPACE_CANDIDATES.map(namespaceWithSingular),
  ];

  const claimValues = claimKeys.map((key) => ({ key, values: getClaimArray(user, key) }));
  const claimKeysWithValues = claimValues.filter(({ values }) => values.length > 0).map(({ key }) => key);
  const claimKeyUsed = claimKeysWithValues[0] ?? null;
  const roles = claimValues.flatMap(({ values }) => values);

  return {
    roles,
    claimKeyUsed,
    claimKeysWithValues,
  };
}

export type RoleInspection = {
  hasRolesClaim: boolean;
  rolesClaimKeyUsed: string | null;
  roles: string[];
  hasPermissions: boolean;
  permissions: string[];
};

export function inspectUserRolesAndPermissions(user: User | null | undefined): RoleInspection {
  if (!user) {
    return {
      hasRolesClaim: false,
      rolesClaimKeyUsed: null,
      roles: [],
      hasPermissions: false,
      permissions: [],
    };
  }

  const namespaceScan = scanRoleNamespaces(user);
  const permissions = coerceToStringArray((user as Record<string, unknown>).permissions);

  return {
    hasRolesClaim: namespaceScan.claimKeysWithValues.length > 0,
    rolesClaimKeyUsed: namespaceScan.claimKeyUsed,
    roles: getUserRoles(user),
    hasPermissions: permissions.length > 0,
    permissions,
  };
}

export function logRoleDebug(user: User | null | undefined, context: string = 'rbac') {
  if (!DEBUG_AUTH_ENABLED) return;
  const inspection = inspectUserRolesAndPermissions(user);
  const summary = user
    ? { sub: (user as Record<string, unknown>).sub, email: (user as Record<string, unknown>).email }
    : null;

  console.log('[RBAC debug]', { context, summary, inspection, roleNamespaces: ROLE_NAMESPACE_CANDIDATES });
}

// Helper function to get user roles from Auth0 user object
export function getUserRoles(user: User | null | undefined): UserRole[] {
  if (!user) return [];
  const namespaceRoles = scanRoleNamespaces(user);
  const roleCandidates: string[] = [
    ...namespaceRoles.roles,
    ...coerceToStringArray((user as Record<string, unknown>).roles),
    ...coerceToStringArray(user['app_metadata']?.roles),
    ...coerceToStringArray(user['user_metadata']?.roles),
    ...coerceToStringArray(user['app_metadata']?.role),
    ...coerceToStringArray(user['user_metadata']?.role),
  ];

  const permissionValues = coerceToStringArray((user as Record<string, unknown>).permissions);

  const deduped = Array.from(new Set(roleCandidates.filter(Boolean)));
  const normalizedFromRoles = deduped
    .map((role) => normalizeRole(role))
    .filter((role): role is UserRole => Boolean(role));

  if (normalizedFromRoles.length > 0) return normalizedFromRoles;

  const normalizedFromPermissions = permissionValues
    .map((value) => normalizeRole(value))
    .filter((role): role is UserRole => Boolean(role));

  if (normalizedFromPermissions.length > 0) return normalizedFromPermissions;

  // Fallback: infer role from permissions when roles are not included in the token
  if (permissionValues.length > 0) {
    const hasAdminPerm = permissionValues.some((p) =>
      p.startsWith('write:users') || p.startsWith('delete:users')
    );
    if (hasAdminPerm) return ['admin'];

    const hasManagerPerm = permissionValues.some((p) =>
      p.startsWith('write:mediaplans') ||
      p.startsWith('write:clients') ||
      p.startsWith('write:publishers')
    );
    if (hasManagerPerm) return ['manager'];
  }

  return normalizedFromRoles;
}

export function getPrimaryRole(user: User | null | undefined): UserRole | null {
  if (!user) return null;
  const roles = getUserRoles(user);
  return roles[0] ?? null;
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function isClientRole(role: UserRole | null | undefined): boolean {
  return role === 'client';
}

export function getUserClientIdentifier(user: User | null | undefined): string | null {
  if (!user) return null;
  const claimValue =
    getClaimArray(user, CLIENT_NAMESPACE_CANDIDATES)[0] ||
    user['app_metadata']?.client ||
    user['app_metadata']?.client_id ||
    user['app_metadata']?.clientId ||
    user['app_metadata']?.client_slug ||
    user['app_metadata']?.clientSlug ||
    user['user_metadata']?.clientSlug ||
    user['user_metadata']?.client_id;

  if (!claimValue) return null;
  if (typeof claimValue === 'string') return claimValue;
  if (typeof claimValue === 'number') return String(claimValue);
  return null;
}

// Helper function to check if user has specific role
export function hasRole(user: User, requiredRoles: UserRole | UserRole[]): boolean {
  const userRoles = getUserRoles(user);
  const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return rolesArray.some(role => userRoles.includes(role));
}

// Helper function to check if user has specific permission
export function hasPermission(user: User, permission: string): boolean {
  const userRoles = getUserRoles(user);
  return userRoles.some(role =>
    ROLE_PERMISSIONS[role]?.includes(permission)
  );
}

// Helper function to check if user has any of the required permissions
export function hasAnyPermission(user: User, permissions: string[]): boolean {
  return permissions.some(permission => hasPermission(user, permission));
}

// Helper function to check if user has all required permissions
export function hasAllPermissions(user: User, permissions: string[]): boolean {
  return permissions.every(permission => hasPermission(user, permission));
}

// Helper function to get user's highest role
export function getHighestRole(user: User | null | undefined): UserRole | null {
  if (!user) return null;
  const userRoles = getUserRoles(user);

  if (userRoles.includes('admin')) return 'admin';
  if (userRoles.includes('manager')) return 'manager';
  if (userRoles.includes('client')) return 'client';

  return null;
}

// Helper function to check if user can access a specific page
export function canAccessPage(user: User, page: string): boolean {
  const userRoles = getUserRoles(user);

  switch (page) {
    case 'dashboard':
      return userRoles.length > 0; // Any authenticated user
    case 'mediaplans':
      return hasRole(user, ['admin', 'manager']);
    case 'clients':
      return hasRole(user, ['admin', 'manager']);
    case 'publishers':
      return hasRole(user, ['admin', 'manager']);
    case 'finance':
      return hasRole(user, ['admin', 'manager']);
    case 'management':
      return hasRole(user, ['admin', 'manager']);
    case 'support':
      return userRoles.length > 0; // Any authenticated user
    case 'profile':
      return userRoles.length > 0; // Any authenticated user
    case 'account':
      return userRoles.length > 0; // Any authenticated user
    default:
      return false;
  }
}

// Helper function to get user display name
export function getUserDisplayName(user: User): string {
  return user.name || user.email || 'Unknown User';
}

// Helper function to get user initials for avatar
export function getUserInitials(user: User): string {
  const name = getUserDisplayName(user);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

