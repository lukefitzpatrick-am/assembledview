import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getUserRoles } from "@/lib/rbac";
import { OrphansClient } from "./OrphansClient";

export default async function PacingAdminOrphansPage() {
  const session = await auth0.getSession();
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/admin/orphans");
  }
  const roles = getUserRoles(session.user);
  if (!roles.includes("admin")) {
    redirect("/unauthorized");
  }

  return <OrphansClient />;
}
