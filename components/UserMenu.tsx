"use client"

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/contexts/AuthContext';
import { getUserRoles } from '@/lib/rbac';
import { User, Settings, LogOut, Shield } from 'lucide-react';
import Link from 'next/link';

type ShellUser = {
  name?: string | null
  email?: string | null
  given_name?: string | null
  family_name?: string | null
}

function shellRoleLabel(isAdmin: boolean, isClient: boolean): "Admin" | "Staff" | "Client" {
  if (isAdmin) return "Admin"
  if (isClient) return "Client"
  return "Staff"
}

function initialsFromWords(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return (parts[0] ?? "").slice(0, 2).toUpperCase()
}

function titleFromLocal(local: string): string {
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** Name for the sidebar card. An email-shaped name falls back to the local part so the card does not show an address. */
export function shellUserIdentity(user: ShellUser): { name: string; initials: string } {
  const given = user.given_name?.trim()
  const family = user.family_name?.trim()
  const rawName = user.name?.trim() ?? ""
  const named =
    given && family
      ? `${given} ${family}`
      : rawName && !rawName.includes("@")
        ? rawName
        : ""
  if (named) {
    return { name: named, initials: initialsFromWords(named) || "?" }
  }

  const local = user.email?.split("@")[0]?.trim() ?? ""
  if (!local) return { name: "Signed in", initials: "?" }
  const words = local.split(/[._-]+/).filter(Boolean)
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : local.slice(0, 2).toUpperCase()
  return { name: titleFromLocal(local) || "Signed in", initials: initials || "?" }
}

export function UserMenu() {
  const { user, isLoading, error, login, logout, isAdmin, isClient } = useAuthContext();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 animate-pulse rounded-full bg-sidebar-accent" />
        <div className="h-4 w-20 animate-pulse rounded bg-sidebar-accent" />
      </div>
    );
  }

  if (error) {
    console.error('Auth0 error:', error);
    return null;
  }

  if (!user) {
    return (
      <button
        onClick={login}
        className="text-sm font-medium text-sidebar-foreground hover:text-sidebar-accent-foreground"
      >
        Sign In
      </button>
    );
  }

  const { name, initials } = shellUserIdentity(user)
  const role = shellRoleLabel(isAdmin, isClient)
  const userRoles = getUserRoles(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-card p-2 text-left transition-colors hover:bg-sidebar-accent">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-am-forest text-[13px] font-bold text-am-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="w-full truncate text-[13px] font-bold leading-tight text-sidebar-foreground">
              {name}
            </span>
            <span className="w-full truncate text-[12px] leading-tight text-[hsl(var(--sidebar-muted))]">
              {role}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" side="top">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{name}</p>
            <p className="text-xs leading-none text-muted-foreground">{role}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/account" className="flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Account Settings</span>
          </Link>
        </DropdownMenuItem>

        {userRoles.includes('admin') && (
          <DropdownMenuItem asChild>
            <Link href="/admin/users/new" className="flex items-center">
              <Shield className="mr-2 h-4 w-4" />
              <span>User Management</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <button onClick={logout} className="flex w-full items-center text-left text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
