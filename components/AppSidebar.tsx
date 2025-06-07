"use client"

import React, { useState, useEffect } from "react";
import { FileText, Users, Building2, LayoutDashboard, Settings, PlusCircle, ChevronDown, ChevronRight, UserCircle, DollarSign, BarChart3 } from "lucide-react";
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
  clientname_input: string;
}

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { title: "MediaPlans", icon: FileText, href: "/mediaplans" },
  { title: "Clients", icon: Users, href: "/clients" },
  { title: "Publishers", icon: Building2, href: "/publishers" },
  { title: "Finance", icon: DollarSign, href: "/finance" },
  { title: "Management", icon: BarChart3, href: "/management" },
  { title: "Create Media Plan", icon: PlusCircle, href: "/mediaplans/create" },
  { title: "Login", icon: UserCircle, href: "/auth/login" },
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
    <Sidebar className="w-56 bg-gray-900 text-white h-screen">
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
                    <Users className="mr-2 h-4 w-4" />
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
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild>
                        <Link href="/clients/template">Template</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    {clients.map((client) => (
                      <SidebarMenuSubItem key={client.id}>
                        <SidebarMenuSubButton asChild>
                          <Link href={`/clients/${client.id}`}>
                            {client.clientname_input}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Account Section with more prominent styling */}
      <div className="mt-auto mb-4">
        <SidebarSeparator className="my-2" />
      </div>
    </Sidebar>
  );
}
