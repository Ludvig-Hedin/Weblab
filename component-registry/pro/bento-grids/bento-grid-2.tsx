"use client";

import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

export function BentoGrid2() {
  return (
    <section className="bg-muted/80 py-16 md:py-24">
      <div className="container mx-auto px-6 flex flex-col gap-12">
        {/* Header Content */}
        <div className="flex flex-col gap-4 md:gap-5 lg:max-w-xl mx-auto lg:text-center">
          {/* Category Tag */}
          <p className="text-sm md:text-base font-semibold text-muted-foreground">
            Bento grid section
          </p>
          {/* Main Heading */}
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Feature-rich layout that captures attention
          </h2>
          {/* Description */}
          <p className="text-base text-muted-foreground">
            Add a concise value statement that highlights your product's key
            features and benefits in a visually dynamic grid. Focus on creating
            balanced content blocks while keeping it under 2-3 lines. Align with
            your grid layout structure.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:grid-rows-2">
          {/* Wide Feature Card - Top Left */}
          <Card className="rounded-xl lg:col-span-2 overflow-hidden">
            <Image
              src="https://ui.shadcn.com/placeholder.svg"
              alt="Placeholder"
              className="w-full object-cover h-80"
            />
            <CardContent className="flex flex-col gap-6 p-6 md:p-8">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Feature title
                </h3>
                <p className="text-sm text-muted-foreground">
                  Shortly describe how this feature solves a specific user
                  problem. Focus on benefits rather than features. Make sure to
                  keep the description concise and to the point.
                </p>
              </div>
            </CardContent>
          </Card>
          {/* Regular Feature Card - Top Right */}
          <Card className="rounded-xl lg:col-span-1 overflow-hidden">
            <Image
              src="https://ui.shadcn.com/placeholder.svg"
              alt="Placeholder"
              className="w-full object-cover h-80"
            />
            <CardContent className="flex flex-col gap-6 p-6 md:p-8">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Feature title
                </h3>
                <p className="text-sm text-muted-foreground">
                  Shortly describe how this feature solves a specific user
                  problem.
                </p>
              </div>
            </CardContent>
          </Card>
          {/* Regular Feature Card - Bottom Left */}
          <Card className="rounded-xl lg:col-span-1 overflow-hidden">
            <Image
              src="https://ui.shadcn.com/placeholder.svg"
              alt="Placeholder"
              className="w-full object-cover h-80"
            />
            <CardContent className="flex flex-col gap-6 p-6 md:p-8">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Feature title
                </h3>
                <p className="text-sm text-muted-foreground">
                  Shortly describe how this feature solves a specific user
                  problem.
                </p>
              </div>
            </CardContent>
          </Card>
          {/* Wide Feature Card - Bottom Right */}
          <Card className="rounded-xl lg:col-span-2 overflow-hidden">
            <Image
              src="https://ui.shadcn.com/placeholder.svg"
              alt="Placeholder"
              className="w-full object-cover h-80"
            />
            <CardContent className="flex flex-col gap-6 p-6 md:p-8">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Feature title
                </h3>
                <p className="text-sm text-muted-foreground">
                  Shortly describe how this feature solves a specific user
                  problem. Focus on benefits rather than features. Make sure to
                  keep the description concise and to the point.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
