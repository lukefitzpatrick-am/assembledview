"use client";

import { AuthProvider } from "@/app/providers";
import { ClientLayout } from "@/components/ClientLayout";

export default function ClientRoot({
  children,
  clientSlugs,
  webSearchSlugs = [],
  codexEnabled = false,
}: {
  children: React.ReactNode
  clientSlugs: string[]
  webSearchSlugs?: string[]
  codexEnabled?: boolean
}) {
  return (
    <AuthProvider>
      <ClientLayout clientSlugs={clientSlugs} webSearchSlugs={webSearchSlugs} codexEnabled={codexEnabled}>{children}</ClientLayout>
    </AuthProvider>
  );
}
