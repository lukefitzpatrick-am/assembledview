"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { AuthLoadingState } from "@/components/AuthLoadingState";

type AdminGuardProps = {
  children: ReactNode;
};

export function AdminGuard({ children }: AdminGuardProps) {
  const { user, isLoading, isAdmin } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    // Avoid `useSearchParams()` here to prevent Next.js prerender/Suspense requirements.
    // We only need a best-effort "returnTo" for the login redirect.
    const search =
      typeof window !== "undefined" && typeof window.location?.search === "string"
        ? window.location.search
        : "";
    const returnTo = `${pathname || "/"}${search || ""}`;

    if (!user) {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(returnTo || "/dashboard")}`);
      return;
    }

    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, isLoading, pathname, router, user]);

  if (isLoading) {
    return <AuthLoadingState message="Checking permissions..." />;
  }

  if (!user || !isAdmin) return null;

  return <>{children}</>;
}




















