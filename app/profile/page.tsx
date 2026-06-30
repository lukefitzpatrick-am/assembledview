"use client"

import { useUser } from '@/components/AuthWrapper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { User, Mail, Shield, Calendar, Globe } from 'lucide-react';
import { getUserDisplayName, getUserInitials, getUserRoles } from '@/lib/rbac';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user, isLoading, error } = useUser();
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
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <LoadingState rows={4} className="w-full max-w-md shadow-e1" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <ErrorState title="Error loading profile" message={error.message} />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const userRoles = getUserRoles(user);
  const createdAt = user.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'Unknown';

  return (
    <div className="container mx-auto max-w-4xl bg-background px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">Profile</h1>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/auth/logout'}
          >
            Sign Out
          </Button>
        </div>

        {/* Profile Card */}
        <Card className="rounded-card border-border bg-card shadow-e1">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Personal Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar and Basic Info */}
            <div className="flex items-center space-x-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.picture} alt={displayName} />
                <AvatarFallback className="bg-pacing-on-track-bg text-2xl text-status-on-track-fg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">{displayName}</h2>
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{user.email}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Member since {createdAt}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Roles and Permissions */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Roles & Permissions</h3>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {userRoles.map((role) => (
                  <Badge 
                    key={role} 
                    variant={role === 'admin' ? 'critical' : role === 'manager' ? 'on-track' : 'secondary'}
                    className="capitalize"
                  >
                    {role}
                  </Badge>
                ))}
              </div>

              {userRoles.length === 0 && (
                <p className="text-sm text-muted-foreground">No roles assigned</p>
              )}
            </div>

            <Separator />

            {/* Auth0 Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Globe className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Account Information</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-[var(--text-secondary)]">Email Verified:</span>
                  <span className={user.email_verified ? 'ml-2 text-status-ahead-fg' : 'ml-2 text-status-critical-fg'}>
                    {user.email_verified ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-[var(--text-secondary)]">User ID:</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {user.sub}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions Card */}
        <Card className="rounded-card border-border bg-card shadow-e1">
          <CardHeader>
            <CardTitle>Account Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open('https://auth0.com/docs/manage-users/user-accounts/user-profile', '_blank')}
              >
                Edit Profile in Auth0
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open('/auth/login?screen_hint=signup&returnTo=/dashboard', '_blank')}
              >
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
