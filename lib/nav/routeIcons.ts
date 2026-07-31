import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Building2,
  Calculator,
  ClipboardList,
  Compass,
  DollarSign,
  FileText,
  Globe,
  Images,
  Layers,
  LayoutDashboard,
  Link2,
  ListTodo,
  PlusCircle,
  Shield,
  TrendingUp,
  UserCircle,
  Users,
} from "lucide-react"

import type { RouteIconKey } from "@/lib/nav/routeManifest"

export const ROUTE_ICON_MAP: Record<RouteIconKey, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Images,
  ClipboardList,
  ListTodo,
  TrendingUp,
  Compass,
  Building2,
  Users,
  DollarSign,
  BookOpen,
  PlusCircle,
  UserCircle,
  Shield,
  Calculator,
  Link2,
  Layers,
  Globe,
}
