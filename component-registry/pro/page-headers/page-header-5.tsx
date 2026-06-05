"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EllipsisVertical,
  ExternalLink,
  PenLine,
  Rocket,
  Share2,
} from "lucide-react";

export function PageHeader5() {
  return (
    <div className="bg-background border-b border-border py-4">
      <div className="container mx-auto px-4 lg:px-6  flex justify-between items-center">
        {/* Project title */}
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Project Alpha
        </h1>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden md:inline-flex">
            <ExternalLink className="h-4 w-4 mr-2" />
            View
          </Button>
          <Button variant="ghost" className="hidden md:inline-flex">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button variant="ghost" className="hidden md:inline-flex">
            <PenLine className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button>
            <Rocket className="h-4 w-4 mr-2 hidden sm:block" />
            Publish
          </Button>

          {/* Dropdown for mobile */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PenLine className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
