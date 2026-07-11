import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";
import { getUserRoles } from "@/lib/rbac";
import { ProgrammaticCampaignsClient } from "./ProgrammaticCampaignsClient";

export default async function PacingProgrammaticCampaignsPage() {
  const session = await auth0.getSession();
  const user = session?.user;
  const roles = user ? getUserRoles(user) : [];
  const isAdmin = roles.includes("admin");

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ProgrammaticCampaignsClient isAdmin={isAdmin} />
    </Suspense>
  );
}
