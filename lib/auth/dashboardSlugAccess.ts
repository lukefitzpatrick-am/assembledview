/**
 * Shared tenant check for `/api/dashboard/[slug]` and sibling routes
 * (`/name`, `/delivered`). Admin is unscoped; everyone else must hold the slug.
 */
export function isDashboardSlugAllowed(opts: {
  roles: readonly string[]
  tenantSlugs: readonly string[]
  slug: string
}): boolean {
  const unscoped = opts.roles.includes("admin")
  const slugKey = opts.slug.toLowerCase()
  if (!unscoped && opts.tenantSlugs.length === 0) return false
  if (!unscoped && !opts.tenantSlugs.some((s) => s.toLowerCase() === slugKey)) return false
  return true
}
