"use client"

import React, { useState, useEffect, useMemo } from "react";
import { FileText, Users, Building2, LayoutDashboard, PlusCircle, ChevronDown, ChevronRight, UserCircle, DollarSign, BarChart3, ClipboardList, BookOpen, TrendingUp } from "lucide-react";
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
import Image from "next/image";  // Import Next.js Image component
import { useAuthContext } from "@/contexts/AuthContext";
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug";

interface Client {
  id: number;
  mp_client_name: string;
  slug?: string;
}

export function AppSidebar() {
  const { userClient, isAdmin, isClient, isLoading } = useAuthContext();
  const [isClientsExpanded, setIsClientsExpanded] = useState(false);
  const [isFinanceExpanded, setIsFinanceExpanded] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

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

  const adminMenuItems = useMemo(() => ([
    { title: "Home", icon: LayoutDashboard, href: "/dashboard" },
    { title: "Campaigns", icon: FileText, href: "/mediaplans" },
    { title: "Scopes of Work", icon: ClipboardList, href: "/scopes-of-work" },
    { title: "Pacing", icon: TrendingUp, href: "/pacing" },
    { title: "Publishers", icon: Building2, href: "/publishers" },
    { title: "Clients", icon: Users, href: "/clients" },
    { title: "Learning", icon: BookOpen, href: "/learning" },
    { title: "Create Campaign", icon: PlusCircle, href: "/mediaplans/create" },
  ]), []);

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
    const links = [
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

  if (isLoading) {
    return (
      <Sidebar className="w-56 bg-gray-900 text-white h-screen overflow-hidden">
        <SidebarContent>
          <div className="flex flex-col gap-3 px-4 py-6 text-sm text-muted-foreground">
            <div className="h-6 w-24 animate-pulse rounded bg-gray-800" />
            <div className="h-4 w-32 animate-pulse rounded bg-gray-800" />
            <div className="h-4 w-28 animate-pulse rounded bg-gray-800" />
            <div className="h-4 w-36 animate-pulse rounded bg-gray-800" />
            <span>Loading menu…</span>
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar className="w-56 bg-gray-900 text-white h-screen overflow-hidden">
      <SidebarContent>
        {/* LOGO SECTION */}
        <div className="flex justify-center items-left py-4">
          <Link href="/">
            <Image 
              src="/amlogo.png" 
              alt="Assembled Media" 
              width={150} 
              height={50} 
              className="cursor-pointer"
            />
          </Link>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className="hover:text-[#B5D337]"
                  >
                    <Link href={item.href} className="flex items-center">
                      {React.createElement(item.icon, { className: "mr-2 h-4 w-4" })}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setIsFinanceExpanded(!isFinanceExpanded)}
                    className="flex items-center justify-between w-full hover:text-[#B5D337]"
                  >
                    <div className="flex items-center">
                      <DollarSign className="mr-2 h-4 w-4" />
                      <span>Finance</span>
                    </div>
                    {isFinanceExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </SidebarMenuButton>
                  {isFinanceExpanded && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="hover:text-[#B5D337]">
                          <Link href="/finance">Overview</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="hover:text-[#B5D337]">
                          <Link href="/finance/media">Media</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="hover:text-[#B5D337]">
                          <Link href="/finance/sow">Scopes of Work</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="hover:text-[#B5D337]">
                          <Link href="/finance/retainers">Retainers</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="hover:text-[#B5D337]">
                          <Link href="/finance/accrual">Accrual</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}

              {/* Client Dashboards Section */}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setIsClientsExpanded(!isClientsExpanded)}
                    className="flex items-center justify-between w-full hover:text-[#B5D337]"
                  >
                    <div className="flex items-center">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      <span>Client Dashboards</span>
                    </div>
                    {isClientsExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </SidebarMenuButton>
                  {isClientsExpanded && (
                    <SidebarMenuSub>
                      {clients
                        .filter((client) => getClientDisplayName(client) !== '')
                        .map((client) => {
                          const label = getClientDisplayName(client)
                          const slug = client.slug || slugifyClientNameForUrl(label)
                          
                          return (
                            <SidebarMenuSubItem key={client.id}>
                              <SidebarMenuSubButton asChild className="hover:text-[#B5D337]">
                                <Link href={`/dashboard/${slug}`}>
                                  {label}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}

              <SidebarSeparator />

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="hover:text-[#B5D337]">
                    <Link href="/admin/users/new" className="flex items-center">
                      <UserCircle className="mr-2 h-4 w-4" />
                      <span>Admin User Enrolment</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* User Menu Section */}
      <SidebarFooter className="p-4 overflow-hidden">
        <div className="w-full max-w-full">
          <UserMenu />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
