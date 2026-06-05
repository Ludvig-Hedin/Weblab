"use client"

import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

export function Card2() {
  return (
    <Card className="max-w-sm mx-auto mt-12">
      <CardContent className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 relative">
          <Avatar className="w-10 h-10">
            <AvatarImage src="https://github.com/shadcn.png" alt="User avatar" />
          </Avatar>
          
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold leading-6 text-card-foreground">
              Title Text
            </h3>
            <p className="text-sm font-normal leading-5 text-muted-foreground">
              This is a card description.
            </p>
          </div>
          
          <Badge className="absolute top-0 right-0">Admin</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
