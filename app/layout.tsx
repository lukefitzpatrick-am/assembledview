import "./globals.css";
import { GeistMono, GeistSans } from "geist/font";

import ClientRoot from "@/components/ClientRoot";

export const metadata = {
  title: "AssembledView",
  description: "Manage mediaplans, clients, and publishers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`${GeistSans.className} antialiased`}>
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}


