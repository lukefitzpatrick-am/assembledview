"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useUser } from "@/components/AuthWrapper";
import {
  getUserRoles,
  logRoleDebug,
  UserRole,
} from "@/lib/rbac";

/** Client-safe facts about an active client view (from `ServerAuthScope`). */
export type ViewAsClientInfo = {
  slug: string;
  clientName: string;
  /** Expires at, seconds since epoch. */
  exp: number;
};

type AuthUser = ReturnType<typeof useUser>["user"];

type AuthContextValue = {
  user: AuthUser;
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
  /** Set while an admin is viewing as a client. */
  viewAs: ViewAsClientInfo | null;
  /** VIEW_AS_ENABLED (server-read). Gates the entry points only. */
  viewAsEnabled: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function highestRole(roles: readonly UserRole[]): UserRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("client")) return "client";
  return null;
}

/**
 * Effective roles and user for the client shell (pure, tested).
 * - A client view: roles are exactly ["client"] and the user is a minimal
 *   client identity (client name, fake email). The Auth0 profile is ignored.
 * - Otherwise the server's roles win when the server sent them (the same
 *   `getSession` every route sees). `null` (server read failed) falls back to
 *   the Auth0 profile claims.
 */
export function resolveEffectiveAuth(input: {
  profileUser: AuthUser;
  serverRoles: UserRole[] | null | undefined;
  viewAs: ViewAsClientInfo | null | undefined;
}): { user: AuthUser; userRoles: UserRole[]; userRole: UserRole | null } {
  if (input.viewAs) {
    const roles: UserRole[] = ["client"];
    const user = input.profileUser
      ? ({
          sub: input.profileUser.sub,
          name: input.viewAs.clientName,
          email: `view-as+${input.viewAs.slug}@assembledview.invalid`,
        } as AuthUser)
      : input.profileUser;
    return { user, userRoles: roles, userRole: "client" };
  }
  const roles =
    input.serverRoles != null
      ? [...input.serverRoles]
      : input.profileUser
        ? getUserRoles(input.profileUser)
        : [];
  return { user: input.profileUser, userRoles: roles, userRole: highestRole(roles) };
}

export function AuthContextProvider({
  children,
  clientSlugs = [],
  serverRoles = null,
  viewAs = null,
  viewAsEnabled = false,
}: {
  children: React.ReactNode;
  clientSlugs?: string[];
  /** Roles from the server session (`ServerAuthScope`). Null when the server read failed. */
  serverRoles?: UserRole[] | null;
  viewAs?: ViewAsClientInfo | null;
  viewAsEnabled?: boolean;
}) {
  const { user: profileUser, isLoading, error, login, logout } = useUser();

  const serverRolesKey = serverRoles ? serverRoles.join(",") : null;
  const effective = useMemo(
    () => resolveEffectiveAuth({ profileUser, serverRoles: serverRolesKey == null ? null : (serverRolesKey.split(",").filter(Boolean) as UserRole[]), viewAs }),
    [profileUser, serverRolesKey, viewAs]
  );
  const userClient = clientSlugs[0] ?? null;

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "true") {
      logRoleDebug(effective.user, "AuthContext");
    }
  }, [effective]);

  const value = useMemo<AuthContextValue>(() => ({
    user: effective.user,
    isLoading,
    error,
    userRoles: effective.userRoles,
    userRole: effective.userRole,
    userClient,
    clientSlugs,
    isAdmin: effective.userRoles.includes("admin"),
    isClient: effective.userRoles.includes("client"),
    viewAs,
    viewAsEnabled: viewAsEnabled && !viewAs,
    login,
    logout,
  }), [effective, isLoading, error, userClient, clientSlugs, viewAs, viewAsEnabled, login, logout]);

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

/** The active client view, or null. Safe outside the provider (returns null). */
export function useViewAs(): ViewAsClientInfo | null {
  return useContext(AuthContext)?.viewAs ?? null;
}
