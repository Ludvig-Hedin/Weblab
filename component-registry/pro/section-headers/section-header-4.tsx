"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EllipsisVertical, Search } from "lucide-react";

export function SectionHeader4() {
  return (
    <div className="bg-background pt-4 md:pt-6">
      <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
        {/* Title */}
        <div className="flex justify-between md:items-center md:gap-6 gap-4 md:flex-row flex-col relative">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Storage</h2>
            <p className="text-sm text-muted-foreground">
              Read and write directly to databases and stores from your
              projects.
            </p>
          </div>
          <div className="flex gap-3 md:flex-row flex-col-reverse">
            {/* Actions */}
            <div className="flex gap-2 justify-end flex-row-reverse md:flex-row">
              <div className="relative w-full">
                <Input type="search" placeholder="Search" className="pl-8" />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="md:static absolute right-[-8px] top-[-8px]">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>View</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
