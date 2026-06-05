"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Bookmark } from "lucide-react"

export function Button8() {
  const [isBookmarked, setIsBookmarked] = React.useState(false)
  const [bookmarkCount, setBookmarkCount] = React.useState(24)

  const toggleBookmark = () => {
    setIsBookmarked(!isBookmarked)
    setBookmarkCount(prevCount => isBookmarked ? prevCount - 1 : prevCount + 1)
  }

  return (
    <div className="flex items-center -space-x-px w-fit mx-auto mt-10">
      <Button 
        variant={isBookmarked ? "default" : "outline"}
        className={`flex items-center gap-2 h-10 px-4 py-2 rounded-r-none ${
          isBookmarked ? "bg-primary text-primary-foreground" : ""
        }`}
        onClick={toggleBookmark}
        aria-pressed={isBookmarked}
        aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
      >
        <Bookmark className="w-4 h-4" />
        <span className="text-sm font-medium leading-5">
          {isBookmarked ? "Bookmarked" : "Bookmark"}
        </span>
      </Button>
      
      <Button 
        variant={isBookmarked ? "default" : "outline"}
        className={`flex items-center h-10 px-3 py-2 rounded-l-none ${
          isBookmarked 
            ? "bg-primary text-primary-foreground" 
            : "text-muted-foreground"
        }`}
        aria-label={`${bookmarkCount} bookmarks`}
      >
        <span className="text-sm font-medium leading-5">{bookmarkCount}</span>
      </Button>
    </div>
  )
}
