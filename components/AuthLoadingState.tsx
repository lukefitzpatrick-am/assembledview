"use client"

import { Loader2 } from 'lucide-react';

interface AuthLoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AuthLoadingState({ 
  message = "Loading...", 
  size = 'md' 
}: AuthLoadingStateProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
      <p className={`${textSizeClasses[size]} text-muted-foreground`}>
        {message}
      </p>
    </div>
  );
}

// Full screen loading state
export function AuthFullScreenLoading({ message = "Authenticating..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center space-y-4 z-50">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{message}</h2>
        <p className="text-sm text-muted-foreground">
          Please wait while we verify your credentials...
        </p>
      </div>
    </div>
  );
}

// Page-level loading state
export function AuthPageLoading({ message = "Loading page..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">{message}</h2>
          <p className="text-sm text-muted-foreground">
            Please wait while we load your content...
          </p>
        </div>
      </div>
    </div>
  );
}

// Inline loading state for forms
export function AuthInlineLoading({ message = "Processing..." }: { message?: string }) {
  return (
    <div className="flex items-center space-x-2 p-4">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

