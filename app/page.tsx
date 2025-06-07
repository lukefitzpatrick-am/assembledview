"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/components/ui/icons"

export default function HomePage() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [pageLoaded, setPageLoaded] = useState(false)
  
  const carouselImages = [
    {
      src: "/ferris-wheel.jpg",
      alt: "Ferris wheel against blue sky with orange gondolas"
    },
    {
      src: "/white-building.jpg",
      alt: "White building on hill with palm trees"
    },
    {
      src: "/modern-hallway.jpg",
      alt: "Modern architectural hallway with diagonal lines"
    },
    {
      src: "/orange-lighthouse.jpg",
      alt: "Orange lighthouse against snowy mountains"
    }
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselImages.length)
    }, 5000) // Change slide every 5 seconds

    return () => clearInterval(timer)
  }, [])

  // Initialize data on component mount
  useEffect(() => {
    // Set a timeout to mark the page as loaded
    const timer = setTimeout(() => {
      setPageLoaded(true)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  // Loading state for the entire page
  if (!pageLoaded) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-lg font-medium">Loading Assembled Media Overview...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left side - Carousel */}
      <div className="relative w-full md:w-1/2 h-[40vh] md:h-screen bg-black">
        {carouselImages.map((image, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              index === currentSlide ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              style={{ objectFit: "cover" }}
              priority={index === 0}
            />
            <div className="absolute inset-0 bg-black/20" /> {/* Subtle overlay */}
          </div>
        ))}
        
        {/* Carousel Navigation Dots */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex space-x-2">
          {carouselImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? "bg-white w-6" 
                  : "bg-white/50 hover:bg-white/75"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Right side - Login */}
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
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

          {/* Welcome Text */}
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back!
            </h1>
            <p className="text-sm text-gray-600">
              Please sign in to continue to your account
            </p>
          </div>

          {/* Login Form */}
          <form className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                placeholder="name@company.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <a href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
                  Forgot password?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                autoCapitalize="none"
                autoComplete="current-password"
                className="h-11"
              />
            </div>
            <Button className="w-full h-11 bg-black text-white hover:bg-gray-800">
              Sign in
            </Button>
          </form>

        </div>
      </div>
    </div>
  )
}

