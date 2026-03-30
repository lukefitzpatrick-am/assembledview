import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/requireRole'
import { getClientHubSummariesForAdminHub } from '@/lib/api/dashboard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('response' in auth && auth.response) {
    return auth.response
  }

  try {
    const summaries = await getClientHubSummariesForAdminHub()
    return NextResponse.json(summaries)
  } catch (e) {
    console.error('[admin/client-hub]', e)
    return NextResponse.json({ error: 'Client hub unavailable' }, { status: 500 })
  }
}
