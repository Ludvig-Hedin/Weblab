"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { File, Download } from "lucide-react";

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
      <div className="col-span-8 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export function DescriptionList1() {
  return (
    <div className="bg-background">
      <div className="mx-auto p-6">
        <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 mb-8">
          <div className="space-y-1">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Application information
            </h2>
            <p className="text-sm text-muted-foreground">
              Personal details and general information
            </p>
          </div>
          <Button variant="outline">Edit</Button>
        </div>

        <div className="flex flex-col">
          <DescriptionListItem label="Full name">
            Alex Thompson
          </DescriptionListItem>
          <DescriptionListItem label="Address">
            123 Main Street, City, Country
          </DescriptionListItem>
          <DescriptionListItem label="Email address">
            alex@example.com
          </DescriptionListItem>
          <DescriptionListItem label="Phone number">
            +1 234 567 890
          </DescriptionListItem>
          <DescriptionListItem label="About">
            A motivated professional with 5+ years of experience in software
            development.
          </DescriptionListItem>
          <DescriptionListItem label="Documents">
            <div className="flex flex-col gap-2 w-full">
              <Card>
                <CardContent className="p-4 md:p-6 flex items-center gap-3">
                  <File className="w-4 h-4 text-foreground shrink-0" />
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-card-foreground">
                        CV.pdf
                      </span>
                      <span className="text-sm text-muted-foreground">
                        2,51mb
                      </span>
                    </div>
                    <Button variant="outline" className="hidden md:flex">
                      Download
                    </Button>
                    <Button variant="outline" size="icon" className="md:hidden">
                      <Download />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 md:p-6 flex items-center gap-3">
                  <File className="w-4 h-4 text-foreground shrink-0" />
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-card-foreground">
                        Portfolio.pdf
                      </span>
                      <span className="text-sm text-muted-foreground">
                        11,24mb
                      </span>
                    </div>
                    <Button variant="outline" className="hidden md:flex">
                      Download
                    </Button>
                    <Button variant="outline" size="icon" className="md:hidden">
                      <Download />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DescriptionListItem>
        </div>
      </div>
    </div>
  );
}
