"use client"

import { AppSidebar } from "@/components/AppSidebar"
import { DynamicBreadcrumbs } from "@/components/DynamicBreadcrumbs"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { MediaPlanProvider } from "@/contexts/MediaPlanContext"
import { Toaster } from "@/components/ui/toaster"
import { ChatWidget } from "@/components/ChatWidget"
import { usePathname } from "next/navigation"
import { AuthWrapper } from "@/components/AuthWrapper"
import { AuthContextProvider } from "@/contexts/AuthContext"
import type React from "react"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHomePage = pathname === "/"
  const isAuthPage = pathname?.startsWith("/auth")
  const isShellVisible = !isHomePage && !isAuthPage
  const showAssistant = isShellVisible

  return (
    <AuthWrapper>
      <AuthContextProvider>
        <SidebarProvider>
          <MediaPlanProvider>
            <div className="flex h-screen w-full overflow-hidden">
              {isShellVisible && <AppSidebar />}
              <SidebarInset className="flex-1 min-w-0 flex flex-col">
                {isShellVisible && (
                  <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                      <SidebarTrigger className="-ml-1" />
                      <Separator orientation="vertical" className="mr-2 h-4" />
                      <DynamicBreadcrumbs />
                    </div>
                  </header>
                )}
                <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
              </SidebarInset>
            </div>
            <Toaster />
            {showAssistant && <ChatWidget />}
          </MediaPlanProvider>
        </SidebarProvider>
      </AuthContextProvider>
    </AuthWrapper>
  )
}

