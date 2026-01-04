import type { User } from '@auth0/nextjs-auth0';

export type UserRole = 'admin' | 'manager' | 'client';

export interface UserWithRoles extends User {
  roles?: string[];
  permissions?: string[];
}

const DEFAULT_ROLE_NAMESPACE = 'https://assembledview.com/roles';
const DEFAULT_CLIENT_NAMESPACE = 'https://assembledview.com/client';

const ROLE_NAMESPACE =
  process.env.NEXT_PUBLIC_AUTH0_ROLE_NAMESPACE ||
  process.env.AUTH0_ROLE_NAMESPACE ||
  DEFAULT_ROLE_NAMESPACE;

const CLIENT_NAMESPACE =
  process.env.NEXT_PUBLIC_AUTH0_CLIENT_NAMESPACE ||
  process.env.AUTH0_CLIENT_NAMESPACE ||
  DEFAULT_CLIENT_NAMESPACE;

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
} as const;

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

function getClaimArray(user: User, claim: string): string[] {
  const value = user[claim];
  if (Array.isArray(value)) {
    // Handle arrays of strings or objects with a "name" property
    return (value as unknown[]).map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'name' in (item as Record<string, unknown>)) {
        const nameVal = (item as Record<string, unknown>).name;
        return typeof nameVal === 'string' ? nameVal : '';
      }
      return '';
    }).filter(Boolean);
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

// Helper function to get user roles from Auth0 user object
export function getUserRoles(user: User | null | undefined): UserRole[] {
  if (!user) return [];
  const roleCandidates: string[] = [
    ...getClaimArray(user, ROLE_NAMESPACE),
    ...getClaimArray(user, 'roles'),
    ...(Array.isArray(user['app_metadata']?.roles) ? user['app_metadata']!.roles : []),
    ...(Array.isArray(user['user_metadata']?.roles) ? user['user_metadata']!.roles : []),
    ...(user['app_metadata']?.role ? [user['app_metadata']!.role] : []),
  ];

  // Support singular custom-claim naming (e.g., /role instead of /roles)
  const singularNamespaceKey = `${ROLE_NAMESPACE.replace(/\/roles$/, '')}/role`;
  const singularNamespaceValue = (user as Record<string, unknown>)[singularNamespaceKey];
  if (typeof singularNamespaceValue === 'string') {
    roleCandidates.push(singularNamespaceValue);
  }

  const deduped = Array.from(new Set(roleCandidates.filter(Boolean)));
  const normalized = deduped
    .map((role) => normalizeRole(role))
    .filter((role): role is UserRole => Boolean(role));

  if (normalized.length > 0) return normalized;

  // Fallback: infer role from permissions when roles are not included in the token
  const permissions = Array.isArray((user as Record<string, unknown>).permissions)
    ? ((user as Record<string, unknown>).permissions as string[])
    : [];

  const hasAdminPerm = permissions.some((p) =>
    p.startsWith('write:users') || p.startsWith('delete:users')
  );
  if (hasAdminPerm) return ['admin'];

  const hasManagerPerm = permissions.some((p) =>
    p.startsWith('write:mediaplans') ||
    p.startsWith('write:clients') ||
    p.startsWith('write:publishers')
  );
  if (hasManagerPerm) return ['manager'];

  // Configurable/local fallback to ensure admins aren't blocked during dev
  const fallbackRole =
    process.env.NEXT_PUBLIC_FALLBACK_ROLE ||
    (process.env.NODE_ENV === 'development' ? 'admin' : null);
  if (fallbackRole && normalizeRole(fallbackRole)) {
    return [normalizeRole(fallbackRole)!];
  }

  return normalized;
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
    (user as Record<string, unknown>)[CLIENT_NAMESPACE] ||
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

  // Temporary fallback for development - assign admin role if no roles found
  if (userRoles.length === 0 && process.env.NODE_ENV === 'development') {
    console.log('No roles found, assigning admin role for development');
    return true; // Allow access in development
  }

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

