import "./globals.css";
import { GeistMono } from "geist/font";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";

import ServerAuthScope from "@/components/ServerAuthScope";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata = {
  title: {
    default: "AssembledView",
    template: "%s · AssembledView",
  },
  description: "Manage mediaplans, clients, and publishers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${instrumentSerif.variable} ${GeistMono.variable}`}
    >
      <body className={`${jakarta.className} antialiased`}>
        <ServerAuthScope>{children}</ServerAuthScope>
      </body>
    </html>
  );
}


