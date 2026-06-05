"use client";

import { Button } from "@/components/ui/button";

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

export function DescriptionList2() {
  return (
    <div className="bg-background">
      <div className="mx-auto p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div className="space-y-1">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Profile Information
            </h2>
            <p className="text-sm text-muted-foreground">
              Personal details and general information
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          <DescriptionListItem label="Full name">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <span className="text-muted-foreground">Alex Thompson</span>
              <Button variant="link" className="h-5 hidden md:flex">Edit</Button>
              <Button variant="outline" className="md:hidden w-full">Edit</Button>
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="Address">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <span className="text-muted-foreground">123 Main Street, City, Country</span>
              <Button variant="link" className="h-5 hidden md:flex">Edit</Button>
              <Button variant="outline" className="md:hidden w-full">Edit</Button>
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="Email address">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <span className="text-muted-foreground">alex@example.com</span>
              <Button variant="link" className="h-5 hidden md:flex">Edit</Button>
              <Button variant="outline" className="md:hidden w-full">Edit</Button>
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="Phone number">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <span className="text-muted-foreground">+1 234 567 890</span>
              <Button variant="link" className="h-5 hidden md:flex">Edit</Button>
              <Button variant="outline" className="md:hidden w-full">Edit</Button>
            </div>
          </DescriptionListItem>
          <DescriptionListItem label="About">
            <div className="flex md:flex-row flex-col md:items-center justify-between gap-x-6 gap-y-4">
              <span className="text-muted-foreground">
                A motivated professional with 5+ years of experience in software development.
              </span>
              <Button variant="link" className="h-5 hidden md:flex">Edit</Button>
              <Button variant="outline" className="md:hidden w-full">Edit</Button>
            </div>
          </DescriptionListItem>
        </div>
      </div>
    </div>
  );
}
