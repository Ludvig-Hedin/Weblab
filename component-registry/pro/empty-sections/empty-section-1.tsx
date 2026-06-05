"use client"

import { Button } from "@/components/ui/button"
import { Inbox } from "lucide-react"

export function EmptySection1() {
  return (
    <section className="bg-background py-6 md:px-6 px-4"> { /* Add border border-border shadow-sm and rounded-lg class to make this section look like a card */ }  
      <div className="w-full flex flex-col items-center gap-6 p-6 rounded-lg border border-dashed"> 
        <div className="w-12 h-12 flex items-center justify-center rounded-md bg-card border shadow-sm p-2">
          <Inbox className="h-6 w-6 text-foreground" />
        </div>
        
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            No databases added
          </h2>
          <p className="text-sm text-muted-foreground leading-5">
            Read and write directly to databases and stores from your projects.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3 w-full">
          <Button>Create new</Button>
          <Button variant="outline">Learn more</Button>
        </div>
      </div>
    </section>
  )
}
