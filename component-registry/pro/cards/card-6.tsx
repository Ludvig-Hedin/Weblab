"use client"

import { useState } from "react"
import {
  Card,
  CardHeader,
  CardFooter,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarImage } from "@/components/ui/avatar"

export function Card6() {
  const [checked, setChecked] = useState(false)

  return (
    <Card className="max-w-sm mx-auto mt-12">
      <CardHeader className="md:p-6 p-4 relative">
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-6 text-card-foreground">
            Title Text
          </h3>
          <p className="text-sm leading-5 text-muted-foreground">
            This is a card description.
          </p>
        </div>
        <Checkbox
          checked={checked}
          onCheckedChange={setChecked}
          className="absolute md:top-5 md:right-6 top-3 right-4 mt-0"
        />
      </CardHeader>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t md:px-6 md:py-4 p-4">
        <span className="text-sm text-card-foreground">Today<span className="text-sm text-muted-foreground ml-2">10:00 PM - 11:45 PM</span></span>
        <div className="flex items-center -space-x-2">
          {[...Array(5)].map((_, i) => (
            <Avatar key={i} className="h-5 w-5 border-[1px] border-card bg-background">
              <AvatarImage src="https://github.com/shadcn.png" alt={`User ${i + 1}`} />
            </Avatar>
          ))}
        </div>
      </CardFooter>
    </Card>
  )
}
