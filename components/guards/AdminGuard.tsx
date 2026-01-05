"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { AuthLoadingState } from "@/components/AuthLoadingState";

type AdminGuardProps = {
  children: ReactNode;
};

export function AdminGuard({ children }: AdminGuardProps) {
  const { user, isLoading, isAdmin } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading) return;

    const search = searchParams?.toString();
    const returnTo = search ? `${pathname}?${search}` : pathname || "/";

    if (!user) {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(returnTo || "/dashboard")}`);
      return;
    }

    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, isLoading, pathname, router, searchParams, user]);

  if (isLoading) {
    return <AuthLoadingState message="Checking permissions..." />;
  }

  if (!user || !isAdmin) return null;

  return <>{children}</>;
}








