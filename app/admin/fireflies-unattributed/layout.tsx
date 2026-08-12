import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/admin/fireflies-unattributed")

export default function FirefliesUnattributedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
