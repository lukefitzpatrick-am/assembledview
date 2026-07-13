import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";
import { getUserRoles } from "@/lib/rbac";
import { DirectCampaignsClient } from "./DirectCampaignsClient";

export default async function PacingDirectCampaignsPage() {
  const session = await auth0.getSession();
  const user = session?.user;
  const roles = user ? getUserRoles(user) : [];
  const isAdmin = roles.includes("admin");

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <DirectCampaignsClient isAdmin={isAdmin} />
    </Suspense>
  );
}
