import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/account")

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children
}
