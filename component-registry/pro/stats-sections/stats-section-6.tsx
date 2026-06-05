"use client";

export function StatsSection6() {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col gap-8 md:gap-12">
          <div className="flex flex-col lg:flex-row gap-6 md:gap-8 text-center">
            <div className="flex flex-col gap-2 md:gap-3">
              <p className="text-3xl md:text-4xl font-bold text-foreground">
                124%
              </p>
              <p className="text-base text-muted-foreground">
                Each stat should include a bold numerical figure followed by a
                brief, compelling description.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:gap-3">
              <p className="text-3xl md:text-4xl font-bold text-foreground">
                88%
              </p>
              <p className="text-base text-muted-foreground">
                Each stat should include a bold numerical figure followed by a
                brief, compelling description.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:gap-3">
              <p className="text-3xl md:text-4xl font-bold text-foreground">
                25%
              </p>
              <p className="text-base text-muted-foreground">
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
