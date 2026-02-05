"use client"

import { useCallback, useEffect, useState } from "react"
import { AppSidebar } from "@/components/AppSidebar"
import { DynamicBreadcrumbs } from "@/components/DynamicBreadcrumbs"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { MediaPlanProvider } from "@/contexts/MediaPlanContext"
import { Toaster } from "@/components/ui/toaster"
import { ChatWidget } from "@/components/ChatWidget"
import { usePathname } from "next/navigation"
import { AuthWrapper } from "@/components/AuthWrapper"
import { AuthContextProvider, useAuthContext } from "@/contexts/AuthContext"
import type React from "react"
import { getAssistantContext } from "@/lib/assistantBridge"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHomePage = pathname === "/"
  const isAuthPage = pathname?.startsWith("/auth")
  const isShellVisible = !isHomePage && !isAuthPage

  return (
    <AuthWrapper>
      <AuthContextProvider>
        <SidebarProvider>
          <MediaPlanProvider>
            <div className="flex h-screen w-full overflow-hidden">
              {isShellVisible && <AppSidebar />}
              <SidebarInset className="flex-1 min-w-0 flex flex-col">
                {isShellVisible && (
                  <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2">
                      <SidebarTrigger className="-ml-1" />
                      <Separator orientation="vertical" className="mr-2 h-4" />
                      <DynamicBreadcrumbs />
                    </div>
                    <div className="ml-auto">
                      <UserGreeting />
                    </div>
                  </header>
                )}
                <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
              </SidebarInset>
            </div>
            <Toaster />
            <AssistantMount isShellVisible={isShellVisible} />
          </MediaPlanProvider>
        </SidebarProvider>
      </AuthContextProvider>
    </AuthWrapper>
  )
}

function AssistantMount({ isShellVisible }: { isShellVisible: boolean }) {
  const { user, isLoading, isAdmin } = useAuthContext()
  const [isAdminFallback, setIsAdminFallback] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isShellVisible) return
    if (isLoading) return
    if (!user) {
      setIsAdminFallback(false)
      return
    }
    if (isAdmin) {
      setIsAdminFallback(true)
      return
    }

    // Fallback: if roles are missing client-side, ask the server.
    // (If the user truly isn't an admin, this will still return false.)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/me", { method: "GET", cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) setIsAdminFallback(false)
          return
        }
        const data = await res.json()
        if (!cancelled) setIsAdminFallback(Boolean(data?.isAdmin))
      } catch {
        if (!cancelled) setIsAdminFallback(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAdmin, isLoading, isShellVisible, user])

  const showAssistant = isShellVisible && (isAdmin || isAdminFallback === true)
  const getPageContext = useCallback(() => getAssistantContext()?.pageContext, [])

  if (!showAssistant) return null
  return <ChatWidget getPageContext={getPageContext} />
}

function UserGreeting() {
  const { user } = useAuthContext()

  const firstName =
    user?.given_name ||
    (user?.name ? user.name.split(" ")[0] : undefined) ||
    user?.nickname ||
    "there"

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
      <span aria-hidden="true" className="text-lg">
        👋
      </span>
      <span className="leading-none">Hi {firstName}</span>
    </div>
  )
}
