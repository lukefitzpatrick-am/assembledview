"use client"

import { useUser } from '@/components/AuthWrapper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, 
  Key, 
  Shield, 
  User, 
  Bell, 
  Database, 
  Download,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { getUserRoles } from '@/lib/rbac';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountPage() {
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">Error loading account: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  const userRoles = getUserRoles(user);
  const isAdmin = userRoles.includes('admin');
  const isManager = userRoles.includes('manager');

  const handlePasswordChange = () => {
    // Redirect to Auth0's password change flow
    window.open(`${process.env.NEXT_PUBLIC_AUTH0_BASE_URL || 'http://localhost:3000'}/auth/login?screen_hint=signup&returnTo=/dashboard`, '_blank');
  };

  const handleProfileEdit = () => {
    // Redirect to Auth0's profile management
    window.open('https://auth0.com/docs/manage-users/user-accounts/user-profile', '_blank');
  };

  const handleExportData = () => {
    // In a real app, this would trigger a data export
    alert('Data export feature would be implemented here');
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // In a real app, this would trigger account deletion
      alert('Account deletion would be implemented here - requires admin approval');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Account Settings</h1>
          <Badge variant="outline" className="capitalize">
            {userRoles[0] || 'No Role'}
          </Badge>
        </div>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Security & Authentication</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Key className="h-5 w-5 text-gray-500" />
                <div>
                  <h3 className="font-medium">Password</h3>
                  <p className="text-sm text-gray-500">Update your password</p>
                </div>
              </div>
              <Button variant="outline" onClick={handlePasswordChange}>
                Change Password
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-500" />
                <div>
                  <h3 className="font-medium">Profile Information</h3>
                  <p className="text-sm text-gray-500">Update your name, email, and avatar</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleProfileEdit}>
                Edit Profile
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Bell className="h-5 w-5 text-gray-500" />
                <div>
                  <h3 className="font-medium">Email Verification</h3>
                  <p className="text-sm text-gray-500">
                    Status: {user.email_verified ? 'Verified' : 'Not Verified'}
                  </p>
                </div>
              </div>
              {!user.email_verified && (
                <Button variant="outline">
                  Resend Verification
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>Data Management</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <Download className="h-5 w-5 text-gray-500" />
                <div>
                  <h3 className="font-medium">Export Data</h3>
                  <p className="text-sm text-gray-500">Download all your data</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleExportData}>
                Export Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Role Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Role & Permissions</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium">Your Roles</h3>
              <div className="flex flex-wrap gap-2">
                {userRoles.map((role) => (
                  <Badge 
                    key={role} 
                    variant={role === 'admin' ? 'destructive' : role === 'manager' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {role}
                  </Badge>
                ))}
              </div>
              
              {userRoles.length === 0 && (
                <p className="text-gray-500 text-sm">No roles assigned</p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="font-medium">Available Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isAdmin || isManager ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>Media Plans Management</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isAdmin || isManager ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>Client Management</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isAdmin || isManager ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>Publisher Management</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>User Management</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isAdmin || isManager ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>Financial Reports</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span>System Administration</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Danger Zone</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
              <div className="flex items-center space-x-3">
                <Trash2 className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-900">Delete Account</h3>
                  <p className="text-sm text-red-700">
                    Permanently delete your account and all associated data
                  </p>
                </div>
              </div>
              <Button 
                variant="destructive" 
                onClick={handleDeleteAccount}
                disabled={isAdmin} // Prevent admin from deleting their own account
              >
                Delete Account
              </Button>
            </div>
            
            {isAdmin && (
              <p className="text-xs text-red-600">
                Admin accounts cannot be self-deleted. Contact system administrator.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
