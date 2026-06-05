"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"

export function Button1() {
  const [value, setValue] = React.useState(23)

  const increment = () => setValue(prev => Math.min(prev + 1, 99))
  const decrement = () => setValue(prev => Math.max(prev - 1, 0))

  return (
    <div className="flex items-center gap-2 w-fit mx-auto mt-10">
      <Button
        variant="outline"
        size="icon"
        className="w-10 h-10 flex justify-center items-center"
        onClick={decrement}
        disabled={value === 0}
        aria-label="Decrease value"
      >
        <Minus className="w-4 h-4" />
      </Button>
      
      <span 
        className="text-sm w-8 leading-5 text-foreground text-center"
        aria-live="polite"
        aria-label="Current value"
      >
        {value}
      </span>

      <Button
        variant="outline"
        size="icon"
        className="w-10 h-10 flex justify-center items-center"
        onClick={increment}
        disabled={value === 99}
        aria-label="Increase value"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  )
}
