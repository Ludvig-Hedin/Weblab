"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ListFilter, Plus, Download } from "lucide-react";

export function TableHeader3() {
  return (
    <div className="container mx-auto flex flex-col justify-between w-full gap-4 bg-background p-6">
      {/* Title and description */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg lg:text-xl  font-semibold text-foreground leading-7">
          Table name
        </h2>
        <p className="text-sm text-muted-foreground leading-5">
          Read and write directly to databases and stores from your projects.
        </p>
      </div>

      {/* Search and buttons */}
      <div className="flex lg:flex-row flex-col justify-between gap-3">
        <div className="relative w-full lg:max-w-[280px] order-2 lg:order-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" type="search" placeholder="Search" />
        </div>
        <div className="flex gap-3 order-1 lg:order-2">
          <Button variant="outline" className="order-2 lg:order-1">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button className="order-1 lg:order-2">
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </div>
    </div>
  );
}
