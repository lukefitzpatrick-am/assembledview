"use client";

import { AuthProvider } from "@/app/providers";
import { ClientLayout } from "@/components/ClientLayout";
import type { ViewAsClientInfo } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/rbac";

export default function ClientRoot({
  children,
  clientSlugs,
  webSearchSlugs = [],
  codexEnabled = false,
  serverRoles = null,
  viewAs = null,
  viewAsEnabled = false,
}: {
  children: React.ReactNode
  clientSlugs: string[]
  webSearchSlugs?: string[]
  codexEnabled?: boolean
  serverRoles?: UserRole[] | null
  viewAs?: ViewAsClientInfo | null
  viewAsEnabled?: boolean
}) {
  return (
    <AuthProvider>
      <ClientLayout
        clientSlugs={clientSlugs}
        webSearchSlugs={webSearchSlugs}
        codexEnabled={codexEnabled}
        serverRoles={serverRoles}
        viewAs={viewAs}
        viewAsEnabled={viewAsEnabled}
      >
        {children}
      </ClientLayout>
    </AuthProvider>
  );
}
