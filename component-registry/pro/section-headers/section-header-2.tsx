"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EllipsisVertical, Search } from "lucide-react";

export function SectionHeader2() {
  return (
    <div className="bg-background pt-4 md:pt-6">
      <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
        {/* Title */}
        <div className="flex justify-between md:items-center md:gap-6 gap-4 md:flex-row flex-col">
          <div className="space-y-1">
            <div className="flex gap-2 items-center justify-between md:justify-start">
              <h2 className="text-xl font-semibold">Storage</h2>
              <Badge variant="secondary">Status</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Read and write directly to databases and stores from your
              projects.
            </p>
          </div>
          {/* Search and Actions */}
          <div className="flex gap-3 md:flex-row flex-col-reverse">
            <div className="relative">
              <Input type="search" placeholder="Search" className="pl-8" />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex gap-2 justify-end flex-row-reverse md:flex-row">
              <div className="lg:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>View</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button variant="outline" className="hidden lg:inline-flex">
                View
              </Button>
              <Button variant="outline" className="hidden lg:inline-flex">
                Edit
              </Button>
              <Button>Publish</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
