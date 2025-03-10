import React from "react";
import { FileText, Users, Building2, LayoutDashboard, Settings, PlusCircle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import Link from "next/link";
import Image from "next/image";  // Import Next.js Image component

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/" },
  { title: "MediaPlans", icon: FileText, href: "/mediaplans" },
  { title: "Clients", icon: Users, href: "/clients" },
  { title: "Publishers", icon: Building2, href: "/publishers" },
  { title: "Settings", icon: Settings, href: "/settings" },
  { title: "Create Media Plan", icon: PlusCircle, href: "/mediaplans/create" },
];

export function AppSidebar() {
  return (
    <Sidebar className="w-48 bg-gray-900 text-white h-screen">
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
