import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/mediaplans/mba/[mba_number]/edit")

export default function EditMediaPlanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
