"use client"

import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MoreHorizontal } from "lucide-react"

export function Card5() {
  return (
    <Card className="max-w-lg mx-auto mt-12">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 text-foreground">
            <svg viewBox="0 0 32 32" className="w-full h-full">
              <circle cx="16" cy="16" r="16" fill="currentColor" />
            </svg>
          </div>
          
          <h3 className="flex-1 font-semibold text-card-foreground">
            Title Text
          </h3>
          
          <Button variant="ghost" size="icon">
            <MoreHorizontal />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="border-t p-4 sm:p-6 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Last invoice
          </p>
          <p className="text-sm text-card-foreground text-right">
            December 13, 2024
          </p>
        </div>
        
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Amount
          </p>
          <p className="text-sm text-card-foreground text-right">
            $45
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
