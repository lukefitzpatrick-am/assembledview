"use client";

import { createContext, useContext, useMemo } from "react";
import { useUser } from "@/components/AuthWrapper";
import {
  getHighestRole,
  getUserClientIdentifier,
  getUserRoles,
  UserRole,
} from "@/lib/rbac";

type AuthContextValue = {
  user: ReturnType<typeof useUser>["user"];
  isLoading: boolean;
  error: unknown;
  userRoles: UserRole[];
  userRole: UserRole | null;
  userClient: string | null;
  isAdmin: boolean;
  isClient: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error, login, logout } = useUser();

  const userRoles = useMemo(() => (user ? getUserRoles(user) : []), [user]);
  const userRole = useMemo(() => getHighestRole(user), [user]);
  const userClient = useMemo(
    () => getUserClientIdentifier(user),
    [user]
  );

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    error,
    userRoles,
    userRole,
    userClient,
    isAdmin: userRoles.includes("admin"),
    isClient: userRoles.includes("client"),
    login,
    logout,
  }), [user, isLoading, error, userRoles, userRole, userClient, login, logout]);

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


