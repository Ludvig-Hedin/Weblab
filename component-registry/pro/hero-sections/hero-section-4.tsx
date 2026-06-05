"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Input } from "@/components/ui/input";
import Image from "next/image";

export function HeroSection4() {
  return (
    <section 
      className="bg-background py-16 lg:py-24"
      aria-labelledby="hero-heading"
    >
      <div className="container px-6 flex flex-col lg:flex-row items-center gap-12 lg:gap-16 mx-auto">
        {/* Left Column */}
        <div className="flex flex-col gap-6 lg:gap-8 flex-1">
          <div className="flex flex-col gap-4 lg:gap-5">
            {/* Category Tag */}
            <p 
              className="text-muted-foreground text-sm lg:text-base font-semibold"
              aria-hidden="true"
            >
              Hero section
            </p>
            {/* Main Heading */}
            <h1 
              id="hero-heading"
              className="text-foreground text-3xl md:text-5xl font-bold"
            >
              Headline that solves user's{" "}
              <span className="text-primary">main problem</span>
            </h1>
            {/* Description */}
            <p className="text-muted-foreground text-base lg:text-lg">
              Follow with one or two sentences that expand on your value
              proposition. Focus on key benefits and address why users should
              take action now. Keep it scannable, short and benefit-driven.
            </p>
          </div>

          {/* Email Form */}
          <form 
            className="flex flex-col lg:flex-row gap-3 w-full md:max-w-sm"
            onSubmit={(e) => e.preventDefault()}
            aria-label="Email signup form"
          >
            <Input 
              placeholder="Your email" 
              type="email"
              required
              aria-required="true"
            />
            <Button>
              Sign up
              <ArrowRight />
            </Button>
          </form>
        </div>

        {/* Right Column */}
        <div className="flex-1 w-full">
          <AspectRatio ratio={1 / 1}>
            <Image
              src="https://ui.shadcn.com/placeholder.svg"
              alt="Hero section visual"
              fill
              priority
              className="rounded-xl object-cover w-full h-full"
            />
          </AspectRatio>
        </div>
      </div>
    </section>
  );
}
