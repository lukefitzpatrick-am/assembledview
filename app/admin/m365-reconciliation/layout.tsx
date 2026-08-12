import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/admin/m365-reconciliation")

export default function M365ReconciliationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
