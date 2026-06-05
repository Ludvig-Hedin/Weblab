"use client";

import { PlaceholderLogo } from "../placeholder-logo" /* Make sure to import your logos */

export function LogoSection3() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-start gap-12 md:gap-16 w-full">
          <div className="flex flex-col flex-1 items-center md:items-start text-center md:text-left gap-4 md:gap-5">
            <p className="text-muted-foreground font-semibold">
              Logo section
            </p>
            <h2 className="text-foreground text-3xl md:text-4xl font-bold">
              Showcase that builds trust
            </h2>
            <p className="text-muted-foreground">
              Add logos of notable companies using your product. Include 4-6
              recognizable brands in grayscale to maintain visual consistency.
              Ensure logos are properly scaled and aligned with equal spacing.
            </p>
          </div>

          <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="p-6 bg-muted flex items-center justify-center min-h-[88px]">
                <PlaceholderLogo />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
