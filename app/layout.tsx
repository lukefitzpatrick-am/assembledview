import "./globals.css";
import { GeistMono, GeistSans } from "geist/font";

import ClientRoot from "@/components/ClientRoot";
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider";
import { buildAssembledMediaAppDefaultTheme } from "@/lib/client-dashboard/theme";

const assembledMediaDefaultTheme = buildAssembledMediaAppDefaultTheme();

export const metadata = {
  title: "AssembledView",
  description: "Manage mediaplans, clients, and publishers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`${GeistSans.className} antialiased`}>
        <ClientBrandProvider theme={assembledMediaDefaultTheme}>
          <ClientRoot>{children}</ClientRoot>
        </ClientBrandProvider>
      </body>
    </html>
  );
}


