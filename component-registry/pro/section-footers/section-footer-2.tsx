"use client";

import { Button } from "@/components/ui/button";

export function SectionFooter2() {
  return (
    <div className="bg-background py-4 border-t border-border">
      <div className="container mx-auto lg:px-6 px-4 gap-4 flex md:flex-row flex-col justify-between md:items-center items-start">
        <div className="text-sm text-muted-foreground w-full">
          Replace this text your content
        </div>
        <div className="flex items-center gap-2 md:flex-row flex-row-reverse">
          <Button variant="outline">View</Button>
          <Button variant="outline">Edit</Button>
          <Button>Save</Button>
        </div>
      </div>
    </div>
  );
}