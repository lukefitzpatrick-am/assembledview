"use client"

import { AppSidebar } from "@/components/AppSidebar"
import { DynamicBreadcrumbs } from "@/components/DynamicBreadcrumbs"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { MediaPlanProvider } from "@/contexts/MediaPlanContext"
import { Toaster } from "@/components/ui/toaster"
import { usePathname } from "next/navigation"
import type React from "react"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHomePage = pathname === "/"

  return (
    <SidebarProvider>
      <MediaPlanProvider>
        <div className="flex h-screen w-full overflow-hidden">
          {!isHomePage && <AppSidebar />}
          <SidebarInset className="w-full flex flex-col">
            {!isHomePage && (
              <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                <div className="flex items-center gap-2 px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <DynamicBreadcrumbs />
                </div>
              </header>
            )}
            <main className="flex-1 overflow-y-auto w-full">{children}</main>
          </SidebarInset>
        </div>
        <Toaster />
      </MediaPlanProvider>
    </SidebarProvider>
  )
} 