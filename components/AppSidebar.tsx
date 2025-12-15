"use client"

import React, { useState, useEffect } from "react";
import { FileText, Users, Building2, LayoutDashboard, Settings, PlusCircle, ChevronDown, ChevronRight, UserCircle, DollarSign, BarChart3, ClipboardList } from "lucide-react";
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

interface Client {
  id: number;
  mp_client_name: string;
}

const menuItems = [
  { title: "Home", icon: LayoutDashboard, href: "/dashboard" },
  { title: "Campaigns", icon: FileText, href: "/mediaplans" },
  { title: "Scopes of Work", icon: ClipboardList, href: "/scopes-of-work" },
  { title: "Publishers", icon: Building2, href: "/publishers" },
  { title: "Clients", icon: Users, href: "/clients" },
  { title: "Finance", icon: DollarSign, href: "/finance" },
  { title: "Create Campaign", icon: PlusCircle, href: "/mediaplans/create" },
];

export function AppSidebar() {
  const [isClientsExpanded, setIsClientsExpanded] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    fetchClients();
  }, []);

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
                  <SidebarMenuButton asChild>
                    <Link href={item.href} className="flex items-center">
                      {React.createElement(item.icon, { className: "mr-2 h-4 w-4" })}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Client Dashboards Section */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setIsClientsExpanded(!isClientsExpanded)}
                  className="flex items-center justify-between w-full"
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
                      .filter((client) => client.mp_client_name && client.mp_client_name.trim() !== '')
                      .map((client) => {
                        // Convert client name to slug format
                        const slug = client.mp_client_name
                          .toLowerCase()
                          .replace(/[^a-z0-9\s-]/g, '')
                          .replace(/\s+/g, '-')
                          .trim()
                        
                        return (
                          <SidebarMenuSubItem key={client.id}>
                            <SidebarMenuSubButton asChild>
                              <Link href={`/dashboard/${slug}`}>
                                {client.mp_client_name}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
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
