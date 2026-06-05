"use client";

export function StatsSection7() {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="container px-6 flex flex-col lg:flex-row items-start gap-12 lg:gap-16 mx-auto">
        <div className="flex flex-col gap-8 flex-1">
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm lg:text-base font-semibold">
              Stats section
            </p>
            <h2 className="text-foreground text-3xl md:text-4xl font-bold">
              Data-driven highlights that showcase impact
            </h2>
            <p className="text-muted-foreground">
              Add a concise value statement that explains how your metrics
              demonstrate success and growth. Focus on transformation and
              measurable outcomes while keeping it under 2 lines. Align with
              your statistical data display.
            </p>
          </div>
        </div>

        <div className="flex-1 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="flex flex-col gap-3">
              <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                256K
              </h3>
              <p className=" text-muted-foreground">
                Each stat should include a bold numerical figure followed by a
                brief, compelling description.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                142%
              </h3>
              <p className=" text-muted-foreground">
                Each stat should include a bold numerical figure followed by a
                brief, compelling description.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                $34.7M
              </h3>
              <p className=" text-muted-foreground">
                Each stat should include a bold numerical figure followed by a
                brief, compelling description.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                98.5%
              </h3>
              <p className=" text-muted-foreground">
                Each stat should include a bold numerical figure followed by a
                brief, compelling description.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
