"use client";

import { PlaceholderLogo } from "../placeholder-logo"; /* Make sure to import your logos */

export function LogoSection5() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, index) => (
            <div
              key={index}
              className="p-6 bg-muted flex items-center justify-center min-h-[88px]"
            >
              <PlaceholderLogo />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
