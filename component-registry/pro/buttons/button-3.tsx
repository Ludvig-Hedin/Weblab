'use client'

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Rocket } from "lucide-react"

export function Button3() {
  return (
    <div className="flex -space-x-px w-fit mx-auto mt-10">
      <Button 
        variant="outline" 
        className="rounded-r-none flex items-center gap-2 justify-center"
      >
        <Rocket className="h-4 w-4" />
        <span>Publish</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className="rounded-l-none h-10 w-10 p-2 flex items-center justify-center"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <span>Menu Item 1</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <span>Menu Item 2</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <span>Menu Item 3</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
