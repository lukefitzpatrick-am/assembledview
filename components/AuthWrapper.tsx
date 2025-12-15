"use client"

import { useUser as useAuth0User } from '@auth0/nextjs-auth0';
import { useRouter } from 'next/navigation';

// Re-export Auth0 hooks with additional functionality
export function useUser() {
  const { user, isLoading, error } = useAuth0User();
  const router = useRouter();

  const login = () => {
    router.push('/auth/login');
  };

  const logout = () => {
    router.push('/auth/logout');
  };

  return { user, isLoading, error, login, logout };
}

// For backward compatibility
export function useAuth() {
  return useUser();
}

// AuthWrapper is no longer needed with Auth0 v4, but keeping for compatibility
export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
