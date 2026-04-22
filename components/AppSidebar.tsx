"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FileText, Users, Building2, LayoutDashboard, PlusCircle, ChevronDown, ChevronRight, UserCircle, DollarSign, BarChart3, ClipboardList, BookOpen, TrendingUp, FlaskConical } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import {
  Sidebar,
  SidebarContent,
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug";
import { cn } from "@/lib/utils";

interface Client {
  id: number;
  mp_client_name: string;
  slug?: string;
}

function pathMatchesHref(pathname: string, href: string, exact?: boolean): boolean {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const h = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href;
  if (exact) return p === h;
  return p === h || p.startsWith(`${h}/`);
}

export function AppSidebar() {
  const pathname = usePathname() ?? "";
  const { userClient, isAdmin, isLoading } = useAuthContext();
  const [isClientsExpanded, setIsClientsExpanded] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  const isCampaignsNavActive = useCallback(
    () => pathMatchesHref(pathname, "/mediaplans") && !pathname.startsWith("/mediaplans/create"),
    [pathname]
  );

  const isCreateCampaignActive = useCallback(
    () => pathname.startsWith("/mediaplans/create"),
    [pathname]
  );

  useEffect(() => {
    if (isAdmin) {
      fetchClients();
    } else {
      setClients([]);
    }
  }, [isAdmin]);

  async function fetchClients() {
    try {
      const response = await fetch("/api/clients");
      if (!response.ok) {
        throw new Error("Failed to fetch clients");
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setClients(data);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  }

  const isFinanceNavActive = useCallback(
    () => pathname.startsWith("/finance"),
    [pathname]
  );

  const adminMenuItems = useMemo(() => ([
    { title: "Home", icon: LayoutDashboard, href: "/dashboard", exact: true as const },
    { title: "Campaigns", icon: FileText, href: "/mediaplans", exact: false as const, isActive: isCampaignsNavActive },
    { title: "Scopes of Work", icon: ClipboardList, href: "/scopes-of-work" },
    { title: "Pacing", icon: TrendingUp, href: "/pacing" },
    { title: "Publishers", icon: Building2, href: "/publishers" },
    { title: "Client hub", icon: Users, href: "/client", exact: true as const },
    { title: "Finance", icon: DollarSign, href: "/finance", exact: false as const, isActive: isFinanceNavActive },
    { title: "Learning", icon: BookOpen, href: "/learning" },
    { title: "Create Campaign", icon: PlusCircle, href: "/mediaplans/create", isActive: isCreateCampaignActive },
  ]), [isCampaignsNavActive, isCreateCampaignActive, isFinanceNavActive]);

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

  const clientMenuItems = useMemo(() => {
    const links: Array<{
      title: string;
      icon: typeof BookOpen;
      href: string;
      exact?: boolean;
    }> = [
      { title: "Learning", icon: BookOpen, href: "/learning" },
    ];
    if (userClient) {
      links.unshift({
        title: formatClientSlugLabel(userClient) || userClient.toUpperCase(),
        icon: LayoutDashboard,
        href: `/dashboard/${userClient}`,
      });
    }
    return links;
  }, [userClient]);

  const menuItems = isAdmin ? adminMenuItems : clientMenuItems;

  const financeSectionActive = pathname.startsWith("/finance");
  const clientDashboardsSectionActive = /^\/client\/[^/]+/.test(pathname);

  const clientsSortedForNav = useMemo(() => {
    return [...clients]
      .map((c) => ({ client: c, label: getClientDisplayName(c) }))
      .filter(({ label }) => label !== "")
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })
      )
      .map(({ client, label }) => ({ client, label }));
  }, [clients]);

  if (isLoading) {
    return (
      <Sidebar className="w-56 h-screen overflow-hidden">
        <SidebarContent role="navigation" aria-label="Primary navigation">
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
    );
  }

  return (
    <Sidebar className="w-56 h-screen overflow-hidden">
      <SidebarContent role="navigation" aria-label="Primary navigation">
        <div className="flex items-start justify-center py-4">
          <Link
            href="/"
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

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const exact = "exact" in item && item.exact;
                const customActive = "isActive" in item && typeof item.isActive === "function" ? item.isActive() : undefined;
                const active =
                  customActive !== undefined
                    ? customActive
                    : pathMatchesHref(pathname, item.href, exact);

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href} className="flex items-center">
                        <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={() => setIsClientsExpanded(!isClientsExpanded)}
                    isActive={clientDashboardsSectionActive}
                    className="flex w-full items-center justify-between"
                  >
                    <div className="flex items-center">
                      <BarChart3 className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      <span>Client Dashboards</span>
                    </div>
                    {isClientsExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                  </SidebarMenuButton>
                  {isClientsExpanded && (
                    <SidebarMenuSub>
                      {clientsSortedForNav.map(({ client, label }) => {
                        const slug = client.slug || slugifyClientNameForUrl(label);
                        const href = `/client/${slug}`;

                        return (
                          <SidebarMenuSubItem key={client.id}>
                            <SidebarMenuSubButton asChild isActive={pathMatchesHref(pathname, href, true)}>
                              <Link href={href}>{label}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}

              <SidebarSeparator />

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathMatchesHref(pathname, "/admin/users/new")}>
                    <Link href="/admin/users/new" className="flex items-center">
                      <UserCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      <span>Admin User Enrolment</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="overflow-hidden p-4">
        {isAdmin ? (
          <div className="mb-3 border-b border-sidebar-border pb-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathMatchesHref(pathname, "/client-dashboard/mock", true)}
                >
                  <Link href="/client-dashboard/mock" className="flex items-center">
                    <FlaskConical className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    <span>Client dashboard (mock)</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        ) : null}
        <div className="w-full max-w-full">
          <UserMenu />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
