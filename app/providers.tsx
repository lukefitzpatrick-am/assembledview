'use client';

import { ReactNode } from "react";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import { ThemeProvider } from "@/components/theme-provider";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Base URL is configured via Auth0 env vars for the SDK route handlers; the
  // client Auth0Provider only supplies SWR fallback for the user profile.
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="av-theme"
    >
      <Auth0Provider>{children}</Auth0Provider>
    </ThemeProvider>
  );
}
