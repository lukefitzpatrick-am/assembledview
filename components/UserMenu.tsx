"use client"

import { useUser } from '@/components/AuthWrapper';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, Settings, LogOut, Shield } from 'lucide-react';
import Link from 'next/link';
import { getUserDisplayName, getUserInitials, getUserRoles } from '@/lib/rbac';

export function UserMenu() {
  const { user, isLoading, error, login, logout } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
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
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Sign In
      </button>
    );
  }

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const userRoles = getUserRoles(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center space-x-3 rounded-card bg-am-panel p-2 text-left transition-colors hover:bg-am-white/10">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.picture} alt={displayName} />
            <AvatarFallback className="text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate text-sm font-medium text-am-white">
              {displayName}
            </span>
            {user.email ? (
              <span className="w-full truncate text-xs text-am-muted-on-black">{user.email}</span>
            ) : null}
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" side="top">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
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
