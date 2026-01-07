import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Access denied',
};

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="max-w-xl space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Access denied (403)</h1>
          <p className="text-muted-foreground">
            You do not have permission to view this page. If you believe this is an error, please contact an
            administrator.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/login">Log in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}












