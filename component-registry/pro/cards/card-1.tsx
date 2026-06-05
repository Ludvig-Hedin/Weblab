"use client"

import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Mail, Phone } from "lucide-react"

export function Card1() {
  return (
    <Card className="max-w-sm mx-auto mt-12">
      <CardHeader className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-start relative">
          <Avatar className="w-10 h-10">
            <AvatarImage src="https://github.com/shadcn.png" alt="User avatar" />
          </Avatar>
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold leading-6 text-card-foreground">
              Title Text
            </h3>
            <p className="text-sm text-muted-foreground">
              This is a card description.
            </p>
          </div>
          <Badge className="absolute top-0 right-0">Admin</Badge>
        </div>
      </CardHeader>
      <CardFooter className="p-2 flex items-center justify-between border-t">
        <Button variant="ghost" size="sm" className="w-full">
          <Mail />
          Email
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Button variant="ghost" size="sm" className="w-full">
          <Phone />
          Call
        </Button>
      </CardFooter>
    </Card>
  )
}
