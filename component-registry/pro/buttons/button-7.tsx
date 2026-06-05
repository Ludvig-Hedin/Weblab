"use client";

import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function Button7() {
  const [value, setValue] = React.useState("today");

  return (
    <div className="p-0.5 bg-background rounded-lg flex items-center gap-0.5 w-fit mx-auto mt-10">
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={setValue}
        className="flex items-center"
      >
        <ToggleGroupItem
          value="today"
          className="h-10 px-3 rounded-md text-sm font-medium leading-5 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          Today
        </ToggleGroupItem>
        <ToggleGroupItem
          value="week"
          className="h-10 px-3 rounded-md text-sm font-medium leading-5 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          This week
        </ToggleGroupItem>
        <ToggleGroupItem
          value="month"
          className="h-10 px-3 rounded-md text-sm font-medium leading-5 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          This month
        </ToggleGroupItem>
        <ToggleGroupItem
          value="year"
          className="h-10 px-3 rounded-md text-sm font-medium leading-5 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          This year
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
