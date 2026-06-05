"use client";

import { Card, CardContent } from "@/components/ui/card";

export function StatsSection4() {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col gap-8 md:gap-12">
          <div className="max-w-xl flex flex-col gap-4">
            <p className="text-sm md:text-base font-semibold text-muted-foreground">
              Stats section
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Data-driven highlights that
              <br />
              showcase impact
            </h2>
            <p className="text-muted-foreground">
              Add a concise value statement that explains how your metrics
              demonstrate success and growth. Focus on transformation and
              measurable outcomes while keeping it under 2 lines. Align with
              your statistical data display.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
            <Card className="rounded-xl">
              <CardContent className="flex flex-col gap-2 md:gap-3 p-5 pt-5 md:p-6">
                <h3 className="font-semibold text-primary">Stat title</h3>
                <span className="text-3xl md:text-4xl font-bold text-foreground">
                  2,400%
                </span>

                <p className="text-base text-muted-foreground">
                  Each stat should include a bold numerical figure followed by a
                  brief, compelling description.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardContent className="flex flex-col gap-2 md:gap-3 p-5 pt-5 md:p-6">
                <h3 className="font-semibold text-primary">Stat title</h3>
                <span className="text-3xl md:text-4xl font-bold text-foreground">
                  $410K
                </span>
                <p className="text-base text-muted-foreground">
                  Each stat should include a bold numerical figure followed by a
                  brief, compelling description.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardContent className="flex flex-col gap-2 md:gap-3 p-5 pt-5 md:p-6">
                <h3 className="font-semibold text-primary">Stat title</h3>
                <span className="text-3xl md:text-4xl font-bold text-foreground">
                  11,000
                </span>
                <p className="text-base text-muted-foreground">
                  Each stat should include a bold numerical figure followed by a
                  brief, compelling description.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
