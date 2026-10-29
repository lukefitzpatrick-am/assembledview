"use client";

import { AuthProvider } from "@/app/providers";
import { ClientLayout } from "@/components/ClientLayout";
import type { ViewAsClientInfo } from "@/contexts/AuthContext";
import { setClientFeatureSnapshot } from "@/lib/features/client";
import type { ClientFeatureKey } from "@/lib/features/registry";
import type { UserRole } from "@/lib/rbac";

export default function ClientRoot({
  children,
  clientSlugs,
  webSearchSlugs = [],
  codexEnabled = false,
  serverRoles = null,
  viewAs = null,
  viewAsEnabled = false,
  features = null,
}: {
  children: React.ReactNode
  clientSlugs: string[]
  webSearchSlugs?: string[]
  codexEnabled?: boolean
  serverRoles?: UserRole[] | null
  viewAs?: ViewAsClientInfo | null
  viewAsEnabled?: boolean
  /** Feature switches for browser code (lib/features/client), set before any child renders. */
  features?: Partial<Record<ClientFeatureKey, boolean>> | null
}) {
  setClientFeatureSnapshot(features);
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
