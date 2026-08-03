import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/admin/users")

export default function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  return children
}
