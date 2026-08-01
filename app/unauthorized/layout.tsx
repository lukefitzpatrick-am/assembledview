import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/unauthorized")

export default function UnauthorizedLayout({ children }: { children: React.ReactNode }) {
  return children
}
