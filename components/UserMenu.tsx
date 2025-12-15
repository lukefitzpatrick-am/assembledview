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
import { Badge } from '@/components/ui/badge';
import { User, Settings, LogOut, Shield } from 'lucide-react';
import Link from 'next/link';
import { getUserDisplayName, getUserInitials, getUserRoles } from '@/lib/rbac';

export function UserMenu() {
  const { user, isLoading, error, login, logout } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
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
        className="text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        Sign In
      </button>
    );
  }

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const userRoles = getUserRoles(user);
  const primaryRole = userRoles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors bg-white w-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.picture} alt={displayName} />
            <AvatarFallback className="text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="text-sm font-medium text-gray-900 truncate">
              {displayName}
            </span>
            {primaryRole && (
              <Badge 
                variant="secondary" 
                className="text-xs px-1.5 py-0.5 capitalize"
              >
                {primaryRole}
              </Badge>
            )}
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
            <Link href="/management" className="flex items-center">
              <Shield className="mr-2 h-4 w-4" />
              <span>User Management</span>
            </Link>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem asChild>
          <button onClick={logout} className="flex items-center text-red-600 w-full text-left">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
