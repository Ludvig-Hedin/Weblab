"use client"

export function StatsSection5() {
  return (
    <section className="bg-placeholder bg-cover bg-center py-16 lg:py-24 overflow-hidden relative">
      <div className="absolute bg-black/80 inset-0 z-0" />
      <div className="container mx-auto px-6 relative z-1">
        <div className="flex flex-col gap-8 md:gap-12">
          <div className="max-w-xl flex flex-col gap-4">
            <p className="text-sm md:text-base font-semibold text-white/80">
              Stats section
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
              Data-driven highlights that<br />showcase impact
            </h2>
            <p className="text-white/80">
              Add a concise value statement that explains how your metrics demonstrate success and growth. Focus on transformation and measurable outcomes while keeping it under 2 lines. Align with your statistical data display.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            <div className="flex flex-col gap-2 md:gap-3">
              <p className="text-3xl md:text-4xl font-bold text-white">
                124%
              </p>
              <p className="text-base text-white/80">
                Each stat should include a bold numerical figure followed by a brief, compelling description.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:gap-3">
              <p className="text-3xl md:text-4xl font-bold text-white">
                88%
              </p>
              <p className="text-base text-white/80">
                Each stat should include a bold numerical figure followed by a brief, compelling description.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:gap-3">
              <p className="text-3xl md:text-4xl font-bold text-white">
                25%
              </p>
              <p className="text-base text-white/80">
                Each stat should include a bold numerical figure followed by a brief, compelling description.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
