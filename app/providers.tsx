'use client';

import { ReactNode } from "react";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use environment variable if available, otherwise let Auth0Provider handle it
  // Don't use window.location.origin during SSR to avoid hydration mismatches
  const baseURL = 
    process.env.NEXT_PUBLIC_AUTH0_BASE_URL || 
    process.env.AUTH0_BASE_URL || 
    undefined; // Let Auth0Provider use its default if not set

  return (
    <Auth0Provider baseURL={baseURL}>
      {children}
    </Auth0Provider>
  );
}
