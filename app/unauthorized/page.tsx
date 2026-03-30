"use client"

import { Button } from '@/components/ui/button';
import { AlertTriangle, Home, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/components/AuthWrapper';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UnauthorizedPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push('/auth/login?returnTo=/dashboard');
    }
  }, [mounted, isLoading, user, router]);

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-foreground"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="space-y-6">
        {/* Error Icon and Title */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground">Oooops!</h1>
          <p className="text-xl text-muted-foreground">
            You don&apos;t have permission to access this page
          </p>
        </div>

        {/* Error Message */}
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            You don&apos;t have permission to view this page
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            variant="outline" 
            onClick={() => router.back()}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Go Back</span>
          </Button>
          
          <Button asChild className="flex items-center space-x-2">
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
              <span>Go to Dashboard</span>
            </Link>
          </Button>
        </div>

      </div>
    </div>
  );
}
