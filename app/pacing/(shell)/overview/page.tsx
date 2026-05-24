import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";
import { getUserRoles } from "@/lib/rbac";
import { OverviewClient } from "./OverviewClient";

export default async function PacingOverviewPage() {
  const session = await auth0.getSession();
  const user = session?.user;
  const roles = user ? getUserRoles(user) : [];
  const isAdmin = roles.includes("admin");

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <OverviewClient isAdmin={isAdmin} />
    </Suspense>
  );
}
