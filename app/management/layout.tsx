import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/management")

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return children
}
