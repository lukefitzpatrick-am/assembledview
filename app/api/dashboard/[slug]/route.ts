import { NextRequest, NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { getUserRoles, getUserClientSlugs } from '@/lib/rbac'
import { getClientDashboardData, exportDashboardData } from '@/lib/api/dashboard'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }
    const roles = getUserRoles(session.user)
    const tenantSlugs = getUserClientSlugs(session.user)
    // AuthZ: unrestricted dashboard access is admin-only; non-admin with no slug scope fails closed (403).
    const unscoped = roles.includes('admin')
    const slugKey = slug.toLowerCase()
    if (!unscoped && tenantSlugs.length === 0) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!unscoped && !tenantSlugs.some((s) => s.toLowerCase() === slugKey)) {
      console.warn(`[dashboard] tenant mismatch: caller scoped to [${tenantSlugs.join(',')}] requested slug "${slug}"`)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') as 'csv' | 'json' | null

    if (format === 'csv' || format === 'json') {
      const data = await exportDashboardData(slug, format)
      return new NextResponse(data, {
        headers: {
          'Content-Type': format === 'csv' ? 'text/csv' : 'application/json',
          'Content-Disposition': `attachment; filename="dashboard-${slug}.${format}"`
        }
      })
    }

    console.log('API: Fetching dashboard data for slug:', slug)
    const dashboardData = await getClientDashboardData(slug)
    console.log('API: Dashboard data result:', dashboardData ? 'Found' : 'Not found')
    
    if (!dashboardData) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(dashboardData)
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
