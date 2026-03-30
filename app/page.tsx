"use client";

import { useState, useEffect } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/loading-dots";

export default function HomePage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { user, isLoading } = useUser(); // <-- client-side auth state
  const router = useRouter();

  const carouselImages = [
    { src: "/ferris-wheel.jpg", alt: "Ferris wheel against blue sky with orange gondolas" },
    { src: "/white-building.jpg", alt: "White building on hill with palm trees" },
    { src: "/modern-hallway.jpg", alt: "Modern architectural hallway with diagonal lines" },
    { src: "/orange-lighthouse.jpg", alt: "Orange lighthouse against snowy mountains" },
  ];

  // Mark component as mounted to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselImages.length);
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect to dashboard when user is logged in
  useEffect(() => {
    if (mounted && user && !isLoading) {
      router.push('/dashboard');
    }
  }, [user, mounted, isLoading, router]);

  // Show loading state while mounting or Auth0 is initializing
  if (!mounted || isLoading) {
    return (
      <main className="w-full h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingDots size="md" />
          <p className="text-lg font-medium">Loading Assembled Media Overview...</p>
        </div>
      </main>
    );
  }

  // Not logged in → show login / signup
  if (!user) {
    return (
      <main className="min-h-screen flex flex-col md:flex-row">
        {/* Left side - Carousel */}
        <div className="relative w-full md:w-1/2 h-[40vh] md:h-screen bg-black">
          {carouselImages.map((image, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? "opacity-100" : "opacity-0"
              }`}
            >
              <Image src={image.src} alt={image.alt} fill style={{ objectFit: "cover" }} priority={index === 0} />
              <div className="absolute inset-0 bg-black/20" />
            </div>
          ))}

          {/* Dots */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex space-x-2">
            {carouselImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className="h-11 w-11 rounded-full grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
                aria-label={`Go to slide ${index + 1}`}
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide ? "bg-white w-6" : "bg-white/50 hover:bg-white/75 w-2"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right side - Login */}
        <div className="flex w-full flex-col items-center justify-center bg-card p-8 md:w-1/2">
          <div className="w-full max-w-md space-y-8">
            <div className="flex justify-center">
              <Image
                src="/assembled-logo.png"
                alt="Assembled Media Logo"
                width={480}
                height={144}
                priority
                className="h-auto"
              />
            </div>

            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold text-foreground">Welcome back!</h1>
              <p className="text-sm text-muted-foreground">Please sign in to continue to your account</p>
            </div>

            <div className="space-y-3">
              <Link
                href="/auth/login?returnTo=/dashboard"
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground text-background hover:bg-foreground/90"
              >
                Log in
              </Link>
              <Link
                href="/auth/login?screen_hint=reset_password&returnTo=/dashboard"
                className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border text-foreground hover:bg-muted"
              >
                Reset Password
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // If we reach here, user is logged in but redirect is in progress
  // Show a loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingDots size="md" />
        <p className="text-lg font-medium">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}

