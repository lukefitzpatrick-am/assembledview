import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/mediaplans/create")

export default function CreateMediaPlanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
