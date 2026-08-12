import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/admin/myhours-mapping")

export default function MyHoursMappingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
