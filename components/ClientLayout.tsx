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
import { CommandPalette } from "@/components/CommandPalette"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHomePage = pathname === "/"
  const isAuthPage = pathname?.startsWith("/auth")
  const isShellVisible = !isHomePage && !isAuthPage
  const p = pathname ?? ""
  /** Match mediaplans create + edit UIs that use max-w-[1920px] + responsive page padding */
  const alignShellWithPlanContent =
    p === "/mediaplans/create" ||
    /^\/mediaplans\/mba\/[^/]+\/edit$/.test(p) ||
    /^\/mediaplans\/[^/]+\/edit$/.test(p)

  return (
    <AuthWrapper>
      <AuthContextProvider>
        <SidebarProvider>
          <MediaPlanProvider>
            <a
              href="#main"
              className="fixed left-4 top-0 z-[100] -translate-y-full rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-md transition-transform focus-visible:translate-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Skip to content
            </a>
            <div className="flex min-h-dvh w-full overflow-hidden">
              {isShellVisible && <AppSidebar />}
              <SidebarInset className="flex-1 min-w-0 flex flex-col bg-surface-muted">
                {isShellVisible && (
                  <header className="flex h-16 shrink-0 items-center border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div
                      className={cn(
                        "flex h-full w-full items-center gap-2",
                        alignShellWithPlanContent
                          ? "mx-auto max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10"
                          : "px-4",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <SidebarTrigger className="-ml-1 shrink-0 focus-visible:ring-offset-background" />
                        <Separator
                          orientation="vertical"
                          decorative
                          aria-hidden
                          className="mr-2 h-4 shrink-0"
                        />
                        <DynamicBreadcrumbs />
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <ThemeToggle />
                        <UserGreeting />
                      </div>
                    </div>
                  </header>
                )}
                <main
                  id="main"
                  tabIndex={-1}
                  className="flex-1 min-w-0 overflow-y-auto bg-surface-muted outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {children}
                </main>
              </SidebarInset>
            </div>
            <Toaster />
            {isShellVisible && <CommandPalette />}
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
    <p className="m-0 text-sm font-medium leading-none text-foreground">
      Hi {firstName}
    </p>
  )
}
