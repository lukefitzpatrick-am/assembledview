"use client";

import { AuthProvider } from "@/app/providers";
import { ClientLayout } from "@/components/ClientLayout";

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ClientLayout>{children}</ClientLayout>
    </AuthProvider>
  );
}
