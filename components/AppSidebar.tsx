"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { ChevronDown, ChevronRight, BarChart3, BookOpen, Images, LayoutDashboard } from "lucide-react"
import { UserMenu } from "@/components/UserMenu"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
} from "@/components/ui/sidebar"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useAuthContext } from "@/contexts/AuthContext"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { coalescedGetJson } from "@/lib/api/coalescedGetJson"
import { cn } from "@/lib/utils"
import {
  getAdminBottomNav,
  getAdminSidebarGroups,
  getRouteByExactPath,
  type NavLink,
} from "@/lib/nav/routeManifest"
import { ROUTE_ICON_MAP } from "@/lib/nav/routeIcons"

interface Client {
  id: number
  mp_client_name: string
  slug?: string
}

function pathMatchesHref(pathname: string, href: string, exact?: boolean): boolean {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname
  const h = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href
  if (exact) return p === h
  return p === h || p.startsWith(`${h}/`)
}

function NavRow({
  item,
  pathname,
  isActive,
  muted,
}: {
  item: NavLink
  pathname: string
  isActive?: boolean
  muted?: boolean
}) {
  const Icon = item.icon ? ROUTE_ICON_MAP[item.icon] : LayoutDashboard
  const active =
    isActive !== undefined ? isActive : pathMatchesHref(pathname, item.path, item.exact)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link
          href={item.path}
          className={cn(
            "flex min-w-0 items-center whitespace-nowrap",
            muted && !active && "text-sidebar-foreground/70"
          )}
        >
          <Icon
            className={cn(
              "mr-2 h-[17px] w-[17px] shrink-0 stroke-[1.8]",
              muted && !active && "opacity-80"
            )}
            aria-hidden
          />
          <span className={cn("min-w-0 truncate", muted && "text-[13px]")}>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const pathname = usePathname() ?? ""
  const { userClient, isAdmin, isLoading } = useAuthContext()
  const [isClientsExpanded, setIsClientsExpanded] = useState(false)
  const [clients, setClients] = useState<Client[]>([])

  const isCampaignsNavActive = useCallback(
    () => pathMatchesHref(pathname, "/mediaplans") && !pathname.startsWith("/mediaplans/create"),
    [pathname]
  )

  const isFinanceNavActive = useCallback(
    () => pathname.startsWith("/finance"),
    [pathname]
  )

  useEffect(() => {
    if (isAdmin) {
      void fetchClients()
    } else {
      setClients([])
    }
  }, [isAdmin])

  async function fetchClients() {
    try {
      const data = await coalescedGetJson<Client[]>("/api/clients")
      if (Array.isArray(data)) {
        setClients(data)
      }
    } catch (error) {
      console.error("Error fetching clients:", error)
    }
  }

  const adminGroups = useMemo(() => getAdminSidebarGroups(), [])

  const formatClientSlugLabel = (slug: string) => {
    const s = String(slug ?? "").trim()
    if (!s) return ""
    return s
      .replace(/[_-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  }

  const knowledgeLabel = getRouteByExactPath("/knowledge")?.label ?? "Knowledge Hub"
  const creativeLabel = getRouteByExactPath("/creative")?.label ?? "Creative"

  const clientMenuItems = useMemo(() => {
    const links: Array<{
      title: string
      icon: typeof BookOpen
      href: string
      exact?: boolean
    }> = []
    if (userClient) {
      links.push({
        title: formatClientSlugLabel(userClient) || userClient.toUpperCase(),
        icon: LayoutDashboard,
        href: `/dashboard/${userClient}`,
      })
      links.push({
        title: creativeLabel,
        icon: Images,
        href: `/dashboard/${userClient}/creative`,
      })
    }
    links.push({ title: knowledgeLabel, icon: BookOpen, href: "/knowledge" })
    return links
  }, [userClient, creativeLabel, knowledgeLabel])

  const clientDashboardsSectionActive = /^\/client\/[^/]+/.test(pathname)

  const clientsSortedForNav = useMemo(() => {
    return [...clients]
      .map((c) => ({ client: c, label: getClientDisplayName(c) }))
      .filter(({ label }) => label !== "")
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })
      )
      .map(({ client, label }) => ({ client, label }))
  }, [clients])

  const activeForItem = useCallback(
    (item: NavLink): boolean => {
      if (item.path === "/mediaplans") return isCampaignsNavActive()
      if (item.path === "/finance") return isFinanceNavActive()
      return pathMatchesHref(pathname, item.path, item.exact)
    },
    [isCampaignsNavActive, isFinanceNavActive, pathname]
  )

  if (isLoading) {
    return (
      <Sidebar>
        <SidebarContent
          className="overflow-y-auto overflow-x-hidden scrollbar-thin"
          role="navigation"
          aria-label="Primary navigation"
        >
          <div className="flex flex-col gap-3 px-4 py-6 text-sm text-sidebar-foreground/80">
            <div aria-hidden className="flex flex-col gap-3">
              <div className="h-6 w-24 animate-pulse rounded-md bg-sidebar-accent" />
              <div className="h-4 w-32 animate-pulse rounded-md bg-sidebar-accent" />
              <div className="h-4 w-28 animate-pulse rounded-md bg-sidebar-accent" />
              <div className="h-4 w-36 animate-pulse rounded-md bg-sidebar-accent" />
            </div>
            <span>Loading menu…</span>
          </div>
        </SidebarContent>
      </Sidebar>
    )
  }

  return (
    <>
      <Sidebar>
        <SidebarHeader className="py-4">
          <div className="flex items-start justify-center">
            <Link
              href="/dashboard"
              aria-label="Assembled Media home"
              className={cn(
                "rounded-md outline-none",
                "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
              )}
            >
              <Image
                src="/amlogo.png"
                alt=""
                width={150}
                height={50}
                className="pointer-events-none"
                aria-hidden
              />
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent
          className="overflow-y-auto overflow-x-hidden scrollbar-thin"
          role="navigation"
          aria-label="Primary navigation"
        >
          {isAdmin ? (
            <>
              {adminGroups.map((group) => {
                const muted = group.tone === "muted"
                return (
                  <SidebarGroup key={group.id} className={cn(muted && "opacity-95")}>
                    {group.label ? (
                      <SidebarGroupLabel
                        className={cn(
                          muted &&
                            "text-[10px] font-medium tracking-wide text-sidebar-foreground/45"
                        )}
                      >
                        {group.label}
                      </SidebarGroupLabel>
                    ) : null}
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.items.map((item) => (
                          <React.Fragment key={item.path}>
                            <NavRow
                              item={item}
                              pathname={pathname}
                              isActive={activeForItem(item)}
                              muted={muted}
                            />
                            {group.id === "deliver" && item.path === "/creative" ? (
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  type="button"
                                  onClick={() => setIsClientsExpanded(!isClientsExpanded)}
                                  isActive={clientDashboardsSectionActive}
                                  className="flex w-full items-center justify-between gap-2 whitespace-nowrap"
                                >
                                  <div className="flex min-w-0 flex-1 items-center">
                                    <BarChart3
                                      className="mr-2 h-[17px] w-[17px] shrink-0 stroke-[1.8]"
                                      aria-hidden
                                    />
                                    <span className="min-w-0 truncate">Client Dashboards</span>
                                  </div>
                                  {isClientsExpanded ? (
                                    <ChevronDown
                                      className="h-[17px] w-[17px] shrink-0 stroke-[1.8]"
                                      aria-hidden
                                    />
                                  ) : (
                                    <ChevronRight
                                      className="h-[17px] w-[17px] shrink-0 stroke-[1.8]"
                                      aria-hidden
                                    />
                                  )}
                                </SidebarMenuButton>
                                {isClientsExpanded ? (
                                  <SidebarMenuSub>
                                    {clientsSortedForNav.map(({ client, label }) => {
                                      const slug = client.slug || slugifyClientNameForUrl(label)
                                      const href = `/client/${slug}`
                                      return (
                                        <SidebarMenuSubItem key={client.id}>
                                          <SidebarMenuSubButton
                                            asChild
                                            isActive={pathMatchesHref(pathname, href, true)}
                                            className="w-full truncate whitespace-nowrap"
                                          >
                                            <Link href={href} title={label}>
                                              {label}
                                            </Link>
                                          </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                      )
                                    })}
                                  </SidebarMenuSub>
                                ) : null}
                              </SidebarMenuItem>
                            ) : null}
                          </React.Fragment>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )
              })}
            </>
          ) : (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {clientMenuItems.map((item) => {
                    const Icon = item.icon
                    const active = pathMatchesHref(pathname, item.href, item.exact)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active}>
                          <Link
                            href={item.href}
                            className="flex min-w-0 items-center whitespace-nowrap"
                          >
                            <Icon
                              className="mr-2 h-[17px] w-[17px] shrink-0 stroke-[1.8]"
                              aria-hidden
                            />
                            <span className="min-w-0 truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="overflow-hidden border-t border-sidebar-border p-3">
          <div className="flex w-full max-w-full flex-col gap-2">
            <UserMenu />
          </div>
        </SidebarFooter>
      </Sidebar>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 hidden border-t border-border bg-sidebar/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 text-sidebar-foreground shadow-e2 backdrop-blur max-[768px]:block"
        aria-label="Primary navigation"
      >
        <ul className="grid grid-cols-5 gap-1">
          {isAdmin
            ? getAdminBottomNav().map((item) => {
                const Icon = item.icon ? ROUTE_ICON_MAP[item.icon] : LayoutDashboard
                const active = activeForItem(item)
                return (
                  <li key={item.path} className="min-w-0">
                    <Link
                      href={item.path}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-input px-1 text-[10px] font-medium leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                        active
                          ? "bg-[var(--sidebar-active-tint)] text-sidebar-foreground"
                          : "text-[hsl(var(--sidebar-muted))] hover:bg-[var(--sidebar-hover-tint)] hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 stroke-[1.8]",
                          active
                            ? "text-[var(--sidebar-active-bar)]"
                            : "text-[hsl(var(--sidebar-icon))]"
                        )}
                        aria-hidden
                      />
                      <span className="max-w-full truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })
            : clientMenuItems.slice(0, 5).map((item) => {
                const Icon = item.icon
                const active = pathMatchesHref(pathname, item.href, item.exact)
                return (
                  <li key={item.href} className="min-w-0">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-input px-1 text-[10px] font-medium leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                        active
                          ? "bg-[var(--sidebar-active-tint)] text-sidebar-foreground"
                          : "text-[hsl(var(--sidebar-muted))] hover:bg-[var(--sidebar-hover-tint)] hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 stroke-[1.8]",
                          active
                            ? "text-[var(--sidebar-active-bar)]"
                            : "text-[hsl(var(--sidebar-icon))]"
                        )}
                        aria-hidden
                      />
                      <span className="max-w-full truncate">{item.title}</span>
                    </Link>
                  </li>
                )
              })}
        </ul>
      </nav>
    </>
  )
}
