"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SupportPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-semibold">
            Support
          </h1>
        </CardHeader>

        <CardContent className="space-y-4">
          <p>
            Having trouble logging in?
          </p>

          <p>
            Reach out to us at  
            <a
              href="mailto:hello@assembledmedia.com.au"
              className="ml-1 underline"
            >
              hello@assembledmedia.com.au
            </a>
          </p>

          <p>
            Our team will get back to you ASAP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
