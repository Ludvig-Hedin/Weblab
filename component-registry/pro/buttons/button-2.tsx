"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { ThumbsUp } from "lucide-react"

export function Button2() {
  const [isLiked, setIsLiked] = React.useState(false)
  const [likeCount, setLikeCount] = React.useState(24)

  const toggleLike = () => {
    setIsLiked(!isLiked)
    setLikeCount(prevCount => isLiked ? prevCount - 1 : prevCount + 1)
  }

  return (
    <div className="flex items-center -space-x-px w-fit mx-auto mt-10">
      <Button 
        variant={isLiked ? "default" : "outline"}
        className={`flex items-center gap-2 h-10 px-4 py-2 rounded-r-none ${
          isLiked ? "bg-primary text-primary-foreground" : ""
        }`}
        onClick={toggleLike}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Unlike" : "Like"}
      >
        <ThumbsUp className="w-4 h-4" />
        <span className="text-sm font-medium leading-5">
          {isLiked ? "Liked" : "Like"}
        </span>
      </Button>
      
      <Button 
        variant={isLiked ? "default" : "outline"}
        className={`flex items-center h-10 px-3 py-2 rounded-l-none ${
          isLiked 
            ? "bg-primary text-primary-foreground" 
            : "text-muted-foreground"
        }`}
        aria-label={`${likeCount} likes`}
      >
        <span className="text-sm font-medium leading-5">{likeCount}</span>
      </Button>
    </div>
  )
}
