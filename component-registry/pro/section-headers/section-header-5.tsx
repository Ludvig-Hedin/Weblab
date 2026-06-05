"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export function SectionHeader5() {
  const [isEnabled, setIsEnabled] = useState(true);

  const handleSwitchChange = () => {
    setIsEnabled(!isEnabled);
  };

  return (
    <div className="bg-background pt-4 md:pt-6">
      <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
        {/* Title */}
        <div className="flex md:justify-between md:items-center md:gap-6 gap-4 md:flex-row flex-col">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Storage</h2>
            <p className="text-sm text-muted-foreground">
              Read and write directly to databases and stores from your
              projects.
            </p>
          </div>
          {/* Switch */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="switch"
              className={`order-2 md:order-1 ${
                isEnabled ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {isEnabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="switch"
              checked={isEnabled}
              onCheckedChange={handleSwitchChange}
              className="order-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
