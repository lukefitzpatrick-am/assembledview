import { NextRequest, NextResponse } from 'next/server'
import { getClientDashboardData, exportDashboardData } from '@/lib/api/dashboard'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
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

