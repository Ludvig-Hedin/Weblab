"use client";

import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export function CtaSection5() {
  return (
    <section
      className="bg-background py-0 lg:py-24"
      aria-labelledby="cta-heading"
    >
      <div className="container mx-auto">
        <div className="max-w-7xl overflow-hidden bg-primary lg:rounded-xl pt-16 lg:pl-16">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Left Column - Content */}
            <div className="flex flex-col gap-4 px-6 lg:px-0 lg:pb-16 justify-between items-center lg:items-start text-center lg:text-left lg:gap-8 flex-1 lg:max-w-full max-w-xl mx-auto">
              {/* Section Header */}
              <div className="flex flex-col gap-4 lg:gap-5">
                {/* Category Tag */}
                <p className="text-primary-foreground/80 text-sm lg:text-base font-semibold">
                  CTA section
                </p>
                {/* Main Title */}
                <h2
                  id="cta-heading"
                  className="text-primary-foreground text-3xl md:text-4xl font-bold"
                >
                  Action-driving headline that creates urgency
                </h2>
              </div>
              {/* CTA Content */}
              <div className="flex flex-col gap-6 items-center lg:items-start">
                {/* Section Description */}
                <p className="text-primary-foreground/80 text-base">
                  Add one or two compelling sentences that reinforce your main
                  value proposition and overcome final objections.
                </p>
                {/* CTA Button */}
                <Button
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/80"
                  aria-label="Get started with our service"
                >
                  Get started <ArrowRight />
                </Button>
              </div>
            </div>
            {/* Right Column - Image */}
            <div className="flex-1 w-full pl-6 lg:pl-0">
              <AspectRatio ratio={4 / 3}>
                <Image
                  src="https://ui.shadcn.com/placeholder.svg"
                  alt="CTA section image"
                  fill
                  className="rounded-tl-lg object-cover w-full h-full"
                />
              </AspectRatio>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
