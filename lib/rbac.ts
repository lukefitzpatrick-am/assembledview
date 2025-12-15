import type { User } from '@auth0/nextjs-auth0';

export type UserRole = 'admin' | 'manager' | 'client';

export interface UserWithRoles extends User {
  roles?: string[];
  permissions?: string[];
}

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

// Helper function to get user roles from Auth0 user object
export function getUserRoles(user: User): UserRole[] {
  // Try multiple possible locations for roles in the user object
  const roles = user['https://assembledmedia.com/roles'] as string[] || 
                user['roles'] as string[] || 
                user['app_metadata']?.roles as string[] ||
                user['user_metadata']?.roles as string[] ||
                [];
  
  console.log('User object for role extraction:', {
    email: user.email,
    roles: roles,
    fullUser: user
  });
  
  return roles.filter((role): role is UserRole => 
    ['admin', 'manager', 'client'].includes(role)
  );
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
export function getHighestRole(user: User): UserRole | null {
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

