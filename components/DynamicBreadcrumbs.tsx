'use client'

import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import React from 'react'

/**
 * Intermediate crumbs that must not link — those paths have no page and 404.
 * Last segment is always a non-link page crumb.
 */
function isLinkableHref(href: string): boolean {
  if (href === '/' || href === '') return true

  // Real list / hub pages
  const exactOk = new Set([
    '/dashboard',
    '/mediaplans',
    '/mediaplans/create',
    '/creative',
    '/scopes-of-work',
    '/tasks',
    '/pacing',
    '/publishers',
    '/client',
    '/finance',
    '/knowledge',
    '/profile',
    '/account',
    '/admin/users/new',
    '/admin/media-container-best-practice',
    '/tools/behavioural-planner',
  ])
  if (exactOk.has(href)) return true

  // Prefix hubs that exist
  if (href.startsWith('/knowledge/')) return true
  if (href.startsWith('/pacing/')) return true
  if (href.startsWith('/finance/')) return true
  if (href.startsWith('/scopes-of-work/')) return true
  if (href.startsWith('/dashboard/')) return true
  if (href.startsWith('/client/')) return true
  if (href.startsWith('/publishers/')) return true
  if (/^\/mediaplans\/mba\/[^/]+\/(edit|creative|trafficking)$/.test(href)) return true

  // Known non-pages (404 if linked)
  if (href === '/tools') return false
  if (href === '/admin') return false
  if (href === '/admin/users') return false
  if (href === '/mediaplans/mba') return false
  if (/^\/mediaplans\/mba\/[^/]+$/.test(href)) return false
  // /mediaplans/:id without a leaf (edit lives under /edit only)
  if (/^\/mediaplans\/[^/]+$/.test(href) && href !== '/mediaplans/create' && href !== '/mediaplans/mba') {
    return false
  }

  return false
}

const SEGMENT_LABELS: Record<string, string> = {
  mediaplans: 'Campaigns',
  tools: 'Tools',
  'behavioural-planner': 'Planning',
  mba: 'MBA',
  dashboard: 'Home',
  knowledge: 'Knowledge Hub',
  'scopes-of-work': 'Scopes of Work',
}

function formatSegment(segment: string) {
  const key = segment.toLowerCase()
  if (SEGMENT_LABELS[key]) return SEGMENT_LABELS[key]
  // MBA numbers / ids — show as-is when they look like codes
  if (/^[A-Z0-9][-A-Z0-9_]+$/i.test(segment) && segment.length > 3) return segment
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function DynamicBreadcrumbs() {
  const pathname = usePathname()

  const segments = (pathname ?? '').split('/').filter(Boolean)

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href="/">Assembled View</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>Home</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/">Assembled View</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join('/')}`
          const isLast = index === segments.length - 1
          const label = formatSegment(segment)
          const linkable = !isLast && isLinkableHref(href)

          return (
            <React.Fragment key={`breadcrumb-${index}`}>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {isLast || !linkable ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>{label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
