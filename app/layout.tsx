import "./globals.css";
import { GeistMono, GeistSans } from "geist/font";
import { ClientLayout } from "@/components/ClientLayout";
import { AuthProvider } from "@/app/providers";

export const metadata = {
  title: "AssembledView",
  description: "Manage mediaplans, clients, and publishers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`${GeistSans.className} antialiased`}>
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}


