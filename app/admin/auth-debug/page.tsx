import { getSession } from '@auth0/nextjs-auth0';
import { redirect } from 'next/navigation';
import { inspectUserRolesAndPermissions, getUserRoles } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function AdminAuthDebugPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect('/auth/login?returnTo=/admin/auth-debug');
  }

  const roles = getUserRoles(session.user);
  if (!roles.includes('admin')) {
    redirect('/403');
  }

  const inspection = inspectUserRolesAndPermissions(session.user);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Admin Auth Debug</h1>
        <p className="text-sm text-muted-foreground">
          Server-side view of the Auth0 session and extracted roles. Restricted to admins.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">User</p>
            <p className="font-semibold">{session.user.email || session.user.sub || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Roles</p>
            <p className="font-semibold">{roles.length ? roles.join(', ') : 'None'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Roles claim key</p>
            <p className="font-semibold">{inspection.rolesClaimKeyUsed || 'Not found'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Permissions present</p>
            <p className="font-semibold">{inspection.hasPermissions ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs uppercase text-muted-foreground">Role & permission inspection</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
{JSON.stringify(inspection, null, 2)}
        </pre>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs uppercase text-muted-foreground">Raw session user</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
{JSON.stringify(session.user, null, 2)}
        </pre>
      </div>
    </div>
  );
}







