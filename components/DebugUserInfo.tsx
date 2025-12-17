"use client"

import { useUser } from '@/components/AuthWrapper';
import { getUserRoles } from '@/lib/rbac';

export function DebugUserInfo() {
  const { user, isLoading, error } = useUser();

  if (isLoading) {
    return <div>Loading user info...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!user) {
    return <div>No user found</div>;
  }

  const userRoles = getUserRoles(user);

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="font-bold mb-2">Debug User Info</h3>
      <div className="space-y-2 text-sm">
        <div><strong>Email:</strong> {user.email}</div>
        <div><strong>Name:</strong> {user.name}</div>
        <div><strong>User ID:</strong> {user.sub}</div>
        <div><strong>Roles:</strong> {userRoles.length > 0 ? userRoles.join(', ') : 'No roles found'}</div>
        <div><strong>Raw user object:</strong></div>
        <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>
    </div>
  );
}
