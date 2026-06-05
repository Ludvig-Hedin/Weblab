"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import Image from "next/image";

export function HeroSection7() {
  return (
    <section 
      className="bg-background py-16 lg:py-24"
      aria-labelledby="hero-heading"
    >
      <div className="container px-6 flex flex-col items-center gap-12 lg:gap-16 mx-auto">
        <div className="flex gap-12 lg:gap-16">
          <div className="flex flex-col lg:flex-row gap-4 md:gap-6 lg:gap-8">
            <h1 
              id="hero-heading"
              className="text-foreground text-3xl lg:text-5xl font-bold flex-1"
            >
              Headline that solves user's{" "}
              <span className="text-primary">main problem</span>
            </h1>
            <div className="flex-1 w-full flex flex-col gap-8">
              <p className="text-muted-foreground text-base lg:text-lg">
                Follow with one or two sentences that expand on your value
                proposition. Focus on key benefits and address why users should
                take action now. Keep it scannable, short and benefit-driven.
              </p>

              <div className="flex flex-col lg:flex-row gap-3">
                <Button>Get started</Button>
                <Button variant="ghost">
                  Explore
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <AspectRatio ratio={16 / 9}>
          <Image
            src="https://ui.shadcn.com/placeholder.svg"
            alt="Hero section visual"
            fill
            priority
            className="rounded-xl object-cover w-full h-full"
          />
        </AspectRatio>
      </div>
    </section>
  );
}
