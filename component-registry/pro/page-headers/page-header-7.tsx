"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical } from "lucide-react";
import Link from "next/link";

export function PageHeader7() {
  return (
    <div className="bg-background border-b border-border pt-4 md:pt-6">
      <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
        {/* Main content */}
        <div className="flex justify-between md:items-center gap-6 md:flex-row flex-col">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Project alpha
            </h1>
            <p className="text-sm lg:text-base text-muted-foreground">
              Manage your project's details such as name, image, description and
              settings.
            </p>
          </div>
          {/* Buttons */}
          <div className="flex gap-2 justify-end flex-row-reverse md:flex-row">
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Share</DropdownMenuItem>
                  <DropdownMenuItem>View</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button variant="outline" className="hidden lg:inline-flex">
              Share
            </Button>
            <Button variant="outline" className="hidden lg:inline-flex">
              View
            </Button>
            <Button variant="outline">Edit</Button>
            <Button>Publish</Button>
          </div>
        </div>
      </div>
      {/* Nav */}
      <nav className="mt-6">
        <div className="container mx-auto lg:px-3 px-4 flex overflow-x-auto">
          <Link
            href="#"
            className="text-sm py-1.5 border-b-2 border-primary text-foreground flex-shrink-0"
          >
            <span className="md:px-3 px-2.5 py-2 block rounded-md hover:bg-muted">
              Nav link
            </span>
          </Link>
          <Link
            href="#"
            className="text-sm text-muted-foreground py-1.5 flex-shrink-0"
          >
            <span className="md:px-3 px-2.5 py-2 block rounded-md hover:bg-muted">
              Nav link
            </span>
          </Link>
          <Link
            href="#"
            className="text-sm text-muted-foreground py-1.5 flex-shrink-0"
          >
            <span className="md:px-3 px-2.5 py-2 block rounded-md hover:bg-muted">
              Nav link
            </span>
          </Link>
          <Link
            href="#"
            className="text-sm text-muted-foreground py-1.5 flex-shrink-0"
          >
            <span className="md:px-3 px-2.5 py-2 block rounded-md hover:bg-muted">
              Nav link
            </span>
          </Link>
          <Link
            href="#"
            className="text-sm text-muted-foreground py-1.5 flex-shrink-0"
          >
            <span className="md:px-3 px-2.5 py-2 block rounded-md hover:bg-muted">
              Nav link
            </span>
          </Link>
          <Link
            href="#"
            className="text-sm text-muted-foreground py-1.5 flex-shrink-0"
          >
            <span className="md:px-3 px-2.5 py-2 block rounded-md hover:bg-muted">
              Nav link
            </span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
