"use client";

import { Button } from "@/components/ui/button";

export function SectionFooter4() {
  return (
    <div className="bg-background py-4 border-t border-border">
      <div className="container mx-auto lg:px-6 px-4 gap-4 flex md:flex-row flex-col justify-between">
        <Button>Purchase Credits</Button>
        <div className="flex gap-3 items-center flex-col md:flex-row md:w-auto w-full">
          <div className="text-sm text-muted-foreground">Need more?</div>
          <Button className="md:w-auto w-full" variant="outline">
            Contact Sales
          </Button>
        </div>
      </div>
    </div>
  );
}