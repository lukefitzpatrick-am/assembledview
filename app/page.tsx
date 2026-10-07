"use client";

import { useState, useEffect } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { BrandLoading } from "@/components/brand/BrandLoading";

const SIGN_IN_ARCHES = [
  { src: "/brand/signin/signin-arch-1.jpg", back: "bg-am-sky", height: "62%" },
  { src: "/brand/signin/signin-arch-2.jpg", back: "bg-am-forest-light", height: "81%" },
  { src: "/brand/signin/signin-arch-3.jpg", back: "bg-am-lime", height: "100%", ring: true },
] as const;

function SignInArches() {
  return (
    <div
      aria-hidden
      className="flex h-[230px] items-end gap-[14px] md:h-[min(52vh,500px)] md:gap-[22px]"
    >
      {SIGN_IN_ARCHES.map((arch) => (
        <div key={arch.src} className="relative min-w-0 flex-1" style={{ height: arch.height }}>
          <div
            className={`absolute inset-0 translate-x-3 -translate-y-3 rounded-t-[999px] ${arch.back}`}
          />
          <div className="relative h-full overflow-hidden rounded-t-[999px]">
            <Image src={arch.src} alt="" fill className="object-cover" sizes="240px" />
          </div>
          {"ring" in arch && arch.ring ? (
            <div className="pointer-events-none absolute left-[51%] top-[45%] h-[58px] w-[58px] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-am-lime" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && user && !isLoading) {
      router.push("/dashboard");
    }
  }, [user, mounted, isLoading, router]);

  if (!mounted || isLoading) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-canvas">
        <BrandLoading text="Loading AssembledView." />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex flex-col justify-between bg-am-ink px-5 py-6 text-am-white md:px-12 md:py-10">
          <Image
            src="/brand/logo-inverted-white.png"
            alt="Assembled Media"
            width={1000}
            height={148}
            priority
            className="h-auto w-[200px]"
          />
          <SignInArches />
          <div className="max-w-[28rem]">
            <p className="text-balance text-[32px] font-extrabold leading-[1.1] tracking-tight text-am-white sm:text-[40px]">
              Every campaign,{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-normal">
                in one view.
              </span>
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-am-muted-on-black">
              Plans, pacing, creative and billing for Assembled Media and the brands we work with.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center bg-canvas px-5 py-10">
          <div className="flex w-full max-w-[400px] flex-col gap-[22px]">
            <h1 className="text-balance text-[32px] font-extrabold leading-[1.1] tracking-tight text-foreground">
              Sign in to{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-normal">
                AssembledView.
              </span>
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Use the email your Assembled Media team set up for you.
            </p>
            <div className="flex flex-col gap-3">
              <Button asChild className="w-full">
                <Link href="/auth/login?returnTo=/dashboard">Log in</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full">
                <Link href="/auth/login?screen_hint=reset_password&returnTo=/dashboard">
                  Reset password
                </Link>
              </Button>
            </div>
            <div className="border-t border-border pt-4 text-sm text-muted-foreground">
              <p>Need access? Ask your Assembled Media contact.</p>
              <Link
                href="/privacy"
                className="mt-2 inline-block rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Privacy policy
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <BrandLoading text="Taking you to your dashboard." />
    </div>
  );
}
