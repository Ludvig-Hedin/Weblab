"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function SectionFooter5() {
  return (
    <div className="bg-background py-4 border-t border-border">
      <div className="container mx-auto lg:px-6 px-4 gap-4 flex items-center justify-between">
        <Button variant="outline" className="w-10 md:min-w-[112px]">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden md:block">Previous</span>
        </Button>
        <span className="text-sm text-muted-foreground text-center">
          <span className="text-foreground font-medium">1-7</span> of 120
        </span>
        <Button variant="outline" className="w-10 md:min-w-[112px]">
          <span className="hidden md:block">Next</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
