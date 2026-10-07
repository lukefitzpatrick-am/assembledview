"use client"

import { BrandLoading } from "@/components/brand/BrandLoading";
import { LoadingDots } from "@/components/ui/loading-dots";

interface AuthLoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AuthLoadingState({
  message = "Loading...",
}: AuthLoadingStateProps) {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <BrandLoading text={message} />
    </div>
  );
}

export function AuthFullScreenLoading({ message = "Authenticating..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas">
      <BrandLoading text={message} />
    </div>
  );
}

export function AuthPageLoading({ message = "Loading page..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <BrandLoading text={message} />
    </div>
  );
}

export function AuthInlineLoading({ message = "Processing..." }: { message?: string }) {
  return (
    <div className="flex items-center space-x-2 p-4">
      <LoadingDots size="sm" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}
