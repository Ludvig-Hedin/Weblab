"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
interface DescriptionListItemProps {
  label: string;
  children: React.ReactNode;
}

function DescriptionListItem({ label, children }: DescriptionListItemProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-2 py-5 md:py-6 border-t border-border">
      <div className="col-span-4 text-sm font-semibold text-foreground">
        {label}
      </div>
      <div className="col-span-8 text-sm">{children}</div>
    </div>
  );
}

export function DescriptionList3() {
  return (
    <div className="bg-background">
      <div className="mx-auto p-6">
        <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 mb-8">
          <div className="space-y-1">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Profile Information
            </h2>
            <p className="text-sm text-muted-foreground">
              Personal details and general information
            </p>
          </div>
          <Button>Save</Button>
        </div>

        <div className="flex flex-col">
          <DescriptionListItem label="Full name">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <Input placeholder="Full Name" className="md:max-w-sm" defaultValue="Alex Thompson" />
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="Address">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <Input placeholder="Address" className="md:max-w-sm" defaultValue="123 Main Street, City, Country" />
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="Email address">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <Input placeholder="Email address" className="md:max-w-sm" defaultValue="alex@example.com" />
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="Phone number">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <Input placeholder="Phone number" className="md:max-w-sm" defaultValue="+1 234 567 890" />
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="About">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <Textarea placeholder="About" className="md:max-w-sm text-sm" defaultValue="A motivated professional with 5+ years of experience in software development." />
            </div>
          </DescriptionListItem>
        </div>
        <Button className="mt-2 md:hidden block">Save</Button>
      </div>
      
    </div>
  );
}
