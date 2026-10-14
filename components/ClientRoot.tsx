"use client";

import { AuthProvider } from "@/app/providers";
import { ClientLayout } from "@/components/ClientLayout";

export default function ClientRoot({
  children,
  clientSlugs,
  webSearchSlugs = [],
}: {
  children: React.ReactNode
  clientSlugs: string[]
  webSearchSlugs?: string[]
}) {
  return (
    <AuthProvider>
      <ClientLayout clientSlugs={clientSlugs} webSearchSlugs={webSearchSlugs}>{children}</ClientLayout>
    </AuthProvider>
  );
}
