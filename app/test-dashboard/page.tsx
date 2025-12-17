import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function TestDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dashboard Test Page</h1>
      <p className="mb-4">Test the Ocean's 11 client dashboard:</p>
      <Button asChild>
        <Link href="/dashboard/oceans-11">View Ocean's 11 Dashboard</Link>
      </Button>
    </div>
  )
}

