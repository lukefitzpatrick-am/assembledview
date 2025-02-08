import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total MediaPlans</CardTitle>
            <CardDescription>Active and draft plans</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">123</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active Clients</CardTitle>
            <CardDescription>Clients with ongoing campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">45</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Publishers</CardTitle>
            <CardDescription>Registered publishers</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">67</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Spend</CardTitle>
            <CardDescription>Across all active campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">$1,234,567</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

