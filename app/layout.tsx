import "./globals.css";
import { GeistMono } from "geist/font";
import { Merriweather, Rethink_Sans } from "next/font/google";

import ClientRoot from "@/components/ClientRoot";
import { ClientBrandProvider } from "@/components/client-dashboard/ClientBrandProvider";
import { buildAssembledMediaAppDefaultTheme } from "@/lib/client-dashboard/theme";

const assembledMediaDefaultTheme = buildAssembledMediaAppDefaultTheme();

const rethink = Rethink_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-rethink-sans",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["italic"],
  variable: "--font-merriweather",
});

export const metadata = {
  title: "AssembledView",
  description: "Manage mediaplans, clients, and publishers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${rethink.variable} ${merriweather.variable} ${GeistMono.variable}`}
    >
      <body className={`${rethink.className} antialiased`}>
        <ClientBrandProvider theme={assembledMediaDefaultTheme}>
          <ClientRoot>{children}</ClientRoot>
        </ClientBrandProvider>
      </body>
    </html>
  );
}


