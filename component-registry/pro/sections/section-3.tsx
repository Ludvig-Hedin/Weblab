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
import { EllipsisVertical, Search, Inbox } from "lucide-react";

export function Section3() {
  return (
    <div className="bg-background"> {/* Add border border-border shadow-sm and rounded-lg class to make this section look like a card */}  
      {/* Section header */}
      <div className="container mx-auto lg:px-6 px-4 pt-4 md:pt-6 flex flex-col gap-6">
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
              <Button>Create new</Button>
            </div>
          </div>
        </div>
      </div>
      {/* Section body */}
      <div className="container mx-auto lg:px-6 px-4 py-6">
        <div className="w-full p-6 border border-border rounded-md text-center border-dashed flex flex-col gap-6 items-center">
          <div className="w-12 h-12 bg-card rounded-md shadow-sm text-card-foreground flex items-center justify-center border border-border">
            <Inbox className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg md:text-xl font-semibold">No databases added</h1>
            <p className="text-sm text-muted-foreground">
              Read and write directly to databases and stores from your
              projects.
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3 w-full">
            <Button size="sm">Create new</Button>
            <Button variant="outline" size="sm">Learn more</Button>
          </div>
        </div>
      </div>
      {/* Section footer */}
      <div className="border-t border-border py-4">
        <div className="container mx-auto lg:px-6 px-4 gap-4 flex md:flex-row flex-col justify-between md:items-center items-start">
          <div className="text-sm text-muted-foreground w-full">
            Replace this text with your content
          </div>
          <div className="flex items-center gap-2 md:flex-row flex-row-reverse">
            <Button variant="outline">View</Button>
            <Button variant="outline">Edit</Button>
            <Button>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
