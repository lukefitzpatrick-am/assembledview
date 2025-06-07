import { Inter } from "next/font/google"
import "./globals.css"
import { ClientLayout } from "@/components/ClientLayout"
import type React from "react"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "MediaPlan App",
  description: "Manage mediaplans, clients, and publishers",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}

