"use client"

import { PlaceholderLogo } from "../placeholder-logo";  /* Make sure to import your logos */

export function LogoSection1() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-center gap-12 md:gap-16">
          <div className="flex flex-col items-center text-center max-w-xl gap-4 md:gap-5">
            <p className="text-muted-foreground font-semibold">
              Logo section
            </p>
            <h2 className="text-foreground text-3xl md:text-4xl font-bold">
              Showcase that builds trust
            </h2>
            <p className="text-muted-foreground">
              Add logos of notable companies using your product. Include 4-6 recognizable brands in grayscale to maintain visual consistency. Ensure logos are properly scaled and aligned with equal spacing.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            {[...Array(6)].map((_, index) => (
              <PlaceholderLogo key={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
