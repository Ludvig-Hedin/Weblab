"use client"

import { List, GalleryThumbnails, CalendarFold, ChevronRight } from "lucide-react"

export function EmptySection4() {
  const projects = [
    {
      icon: List,
      title: "Create a list",
      description: "Organize tasks into simple lists.",
    },
    {
      icon: GalleryThumbnails,
      title: "Create a gallery",
      description: "Showcase items visually and neatly.",
    },
    {
      icon: CalendarFold,
      title: "Create a calendar",
      description: "Plan events with clear schedules.",
    },
  ]

  return (
    <section className="bg-background py-12"> {/* Add border border-border shadow-sm and rounded-lg class to make this section look like a card */}
      <div className="max-w-xl mx-auto px-4 md:px-6">
        <div className="space-y-1 mb-8">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            Projects
          </h2>
          <p className="text-sm text-muted-foreground">
            Create your first project by selecting a template or starting from scratch.
          </p>
        </div>

        <div className="flex flex-col">
          {projects.map((project, index) => (
            <div
              key={index}
              className="flex items-start py-5 md:py-6 cursor-pointer border-t border-border hover:bg-accent/20 transition-colors"
            >
              <div className="md:h-12 md:w-12 md:rounded-md md:border md:shadow-sm flex items-center justify-center">
                <project.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 mx-4">
                <h3 className="text-base font-semibold text-card-foreground">
                  {project.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {project.description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
