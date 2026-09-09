"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useUser } from "@/components/AuthWrapper";
import {
  getHighestRole,
  getUserRoles,
  logRoleDebug,
  UserRole,
} from "@/lib/rbac";

type AuthContextValue = {
  user: ReturnType<typeof useUser>["user"];
  isLoading: boolean;
  error: unknown;
  userRoles: UserRole[];
  userRole: UserRole | null;
  /** Primary (landing) slug — always `clientSlugs[0]`. */
  userClient: string | null;
  /** Server-derived tenant set from `getUserClientSlugs`; primary first. */
  clientSlugs: string[];
  isAdmin: boolean;
  isClient: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthContextProvider({
  children,
  clientSlugs = [],
}: {
  children: React.ReactNode;
  clientSlugs?: string[];
}) {
  const { user, isLoading, error, login, logout } = useUser();

  const userRoles = useMemo(() => (user ? getUserRoles(user) : []), [user]);
  const userRole = useMemo(() => getHighestRole(user), [user]);
  const userClient = clientSlugs[0] ?? null;

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "true") {
      logRoleDebug(user, "AuthContext");
    }
  }, [user, userRoles]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    error,
    userRoles,
    userRole,
    userClient,
    clientSlugs,
    isAdmin: userRoles.includes("admin"),
    isClient: userRoles.includes("client"),
    login,
    logout,
  }), [user, isLoading, error, userRoles, userRole, userClient, clientSlugs, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within an AuthContextProvider");
  }
  return ctx;
}
