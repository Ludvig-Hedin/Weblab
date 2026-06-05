"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { TreePalm, MapPin, User } from "lucide-react";
import { CardContent } from "../ui/card";

export function Card4() {
  return (
    <Card className="max-w-xl mx-auto mt-12">
      <CardHeader className="p-4 md:p-6">
        <div className="relative">
          <Badge>In progress</Badge>

          <h3 className="text-lg font-semibold text-card-foreground my-2">
            Summer Camp
          </h3>

          <div className="flex -space-x-2 absolute top-0 right-0">
            {[...Array(5)].map((_, i) => (
              <Avatar
                key={i}
                className="w-5 h-5 border-[1px] border-card bg-background"
              >
                <AvatarImage
                  src="https://github.com/shadcn.png"
                  alt={`User ${i + 1}`}
                />
              </Avatar>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <TreePalm className="w-4 h-4" />
              <span>Camp</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>London, Great Britain</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>Alex Johnson</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardFooter className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 py-4 border-t md:px-6">
        <span className="text-sm text-card-foreground">
          Pre-Production (2/4)
        </span>
        <Separator orientation="vertical" className="h-5" />
        <span className="text-sm text-muted-foreground">Updated 4h ago</span>
      </CardFooter>
    </Card>
  );
}
