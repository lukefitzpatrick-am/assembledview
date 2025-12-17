import "./globals.css";
import { ClientLayout } from "@/components/ClientLayout";
import { AuthProvider } from "@/app/providers";

export const metadata = {
  title: "AssembledView",
  description: "Manage mediaplans, clients, and publishers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}


