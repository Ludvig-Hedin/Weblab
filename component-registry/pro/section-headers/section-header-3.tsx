"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";

export function SectionHeader3() {
  const [activeTab, setActiveTab] = useState("tab1");

  const tabs = [
    { value: "tab1", label: "Tab 1" },
    { value: "tab2", label: "Tab 2" },
    { value: "tab3", label: "Tab 3" },
    { value: "tab4", label: "Tab 4" },
  ];

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
          {/* Actions */}
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
        {/* Tabs */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a tab" />
            </SelectTrigger>
            <SelectContent>
              {tabs.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden md:block">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
