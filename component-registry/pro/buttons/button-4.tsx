"use client"

import { Button } from "@/components/ui/button"
import { Plus, PenLine, Send, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function Button4() {
  return (
    <div className="flex -space-x-px w-fit mx-auto mt-10">
      <Button 
        variant="outline" 
        className="flex items-center gap-2 h-10 rounded-r-none"
      >
        <Plus className="w-4 h-4" />
        New
      </Button>
      
      <Button 
        variant="outline" 
        className="flex items-center gap-2 h-10 rounded-none"
      >
        <PenLine className="w-4 h-4" />
        Edit
      </Button>
      
      <Button 
        variant="outline" 
        className="flex items-center gap-2 h-10 rounded-none"
      >
        <Send className="w-4 h-4" />
        Send
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="icon"
            className="h-10 w-10 rounded-l-none"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Action 1</DropdownMenuItem>
          <DropdownMenuItem>Action 2</DropdownMenuItem>
          <DropdownMenuItem>Action 3</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
