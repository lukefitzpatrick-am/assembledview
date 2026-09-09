"use client";

import { AuthProvider } from "@/app/providers";
import { ClientLayout } from "@/components/ClientLayout";

export default function ClientRoot({
  children,
  clientSlugs,
}: {
  children: React.ReactNode
  clientSlugs: string[]
}) {
  return (
    <AuthProvider>
      <ClientLayout clientSlugs={clientSlugs}>{children}</ClientLayout>
    </AuthProvider>
  );
}
