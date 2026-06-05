"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function Button10() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="w-fit mx-auto mt-10">
      <Button
        variant="ghost"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="relative flex items-center justify-center h-9 w-9"
      >
        <span className={`absolute transition-all duration-300 ${isMenuOpen ? 'opacity-0 rotate-90' : 'opacity-100 rotate-0'}`}>
        <Menu className="h-4 w-4" />
      </span>
      <span className={`absolute transition-all duration-300 ${isMenuOpen ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'}`}>
        <X className="h-4 w-4" />
      </span>
      </Button>
    </div>
  )
}



