"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, List, LayoutGrid, CalendarFold, ClipboardList, Users, Clock, LucideIcon } from "lucide-react"

interface EmptyCardProps {
  icon: LucideIcon
  title: string
  description: string
}

function EmptyCard({ icon: Icon, title, description }: EmptyCardProps) {
  return (
    <Card>
      <CardContent className="p-4 md:p-6 flex flex-col md:flex-row items-stretch md:items-start gap-4 relative">
          <Icon className="h-5 md:h-6 w-5 md:w-6 shrink-0 text-primary" />
        <div className="space-y-1 flex-1">
          <h3 className="font-semibold text-card-foreground leading-5">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="icon" className="absolute md:static right-2 top-2">
          <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  )
}

export function EmptySection2() {
  return (
    <section className="bg-background"> {/* Add border border-border shadow-sm and rounded-lg class to make this section look like a card */}
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-card-foreground md:text-xl">
            Products
          </h2>
          <p className="text-sm text-muted-foreground">
            Create your first project by selecting a template or starting from scratch.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:gap-6 lg:grid-cols-3">
          <EmptyCard
            icon={List}
            title="Create a list"
            description="Organize tasks into simple lists."
          />
          <EmptyCard
            icon={LayoutGrid}
            title="Create a gallery"
            description="Showcase items visually and neatly."
          />
          <EmptyCard
            icon={CalendarFold}
            title="Create a calendar"
            description="Plan events with clear schedules."
          />
          <EmptyCard
            icon={ClipboardList}
            title="Create a board"
            description="Manage projects with visual boards."
          />
          <EmptyCard
            icon={Users}
            title="Create a team"
            description="Collaborate effectively with your team."
          />
          <EmptyCard
            icon={Clock}
            title="Create a timeline"
            description="Track progress with chronological views."
          />
        </div>
      </div>
    </section>
  )
}
