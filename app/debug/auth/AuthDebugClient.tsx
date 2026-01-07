"use client";

import { useMemo } from "react";
import { AuthLoadingState } from "@/components/AuthLoadingState";
import { useAuthContext } from "@/contexts/AuthContext";

export function AuthDebugClient() {
  const { user, userRoles, userClient, isAdmin, isClient, isLoading } = useAuthContext();

  const clientIdentifier = useMemo(() => userClient ?? null, [userClient]);

  if (isLoading) {
    return <AuthLoadingState message="Loading auth debug..." />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Auth Debug</h1>
        <p className="text-sm text-muted-foreground">
          Inspect Auth0 session claims and derived roles. Only available in development or when NEXT_PUBLIC_DEBUG_AUTH is set.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Authenticated</p>
            <p className="font-semibold">{user ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Is Admin</p>
            <p className="font-semibold">{isAdmin ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Is Client</p>
            <p className="font-semibold">{isClient ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Client Identifier</p>
            <p className="font-semibold">{clientIdentifier || "—"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs uppercase text-muted-foreground">Roles</p>
            <p className="font-semibold">{userRoles.length ? userRoles.join(", ") : "None"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs uppercase text-muted-foreground">Raw User Object</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
{JSON.stringify(user, null, 2)}
        </pre>
      </div>
    </div>
  );
}













