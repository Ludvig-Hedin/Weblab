"use client";

import { Card, CardHeader, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Mail, Phone } from "lucide-react";

export function Card3() {
  return (
    <Card className="max-w-sm mx-auto mt-12">
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col items-center gap-4">
          <Avatar className="md:h-20 md:w-20 rounded-xl h-16 w-16">
            <AvatarImage src="https://github.com/shadcn.png" alt="Avatar" />
          </Avatar>
          <div className="flex flex-col gap-1.5 text-center">
            <h3 className="font-semibold text-card-foreground">Title Text</h3>
            <p className="text-sm text-muted-foreground">
              This is a card description.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardFooter className="flex items-center justify-between border-t p-2">
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
  );
}
