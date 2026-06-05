"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { Bell, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

export function Navbar3() {
  return (
    <nav className="w-full border-b bg-background shadow-sm">
      <div className="container h-16 flex items-center justify-between px-6 mx-auto relative">
        {/* Logo */}
        <Logo />
        {/* Desktop search */}
        <div className="absolute left-1/2 -translate-x-1/2 w-[360px] hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="text" placeholder="Search" className="pl-9 h-10" />
          </div>
        </div>

        <div className="flex gap-3">
          {/* Mobile search */}
          <Button
            size="icon"
            variant="ghost"
            className="flex md:hidden [&_svg]:size-5 text-muted-foreground"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Notifications */}
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="md:[&_svg]:size-4 [&_svg]:size-5 text-muted-foreground"
            >
              <Bell className="h-4 w-4" />
            </Button>
            <Badge className="absolute -top-0.5 -right-0.5 w-5 h-5 flex items-center justify-center p-0.5">
              2
            </Badge>
          </div>

          {/* User dropdown */}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="cursor-pointer">
                <AvatarImage
                  src="https://github.com/shadcn.png"
                  alt="User avatar"
                />
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>My Profile</DropdownMenuItem>
              <DropdownMenuItem>Account</DropdownMenuItem>
              <DropdownMenuItem>Billing</DropdownMenuItem>
              <Separator className="my-1" />
              <DropdownMenuItem>Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}