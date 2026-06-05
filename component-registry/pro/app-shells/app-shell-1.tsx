"use client";

import { useState } from "react";
import { ChevronDown, Menu, Zap, Search, X, EllipsisVertical } from "lucide-react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/logo";

export function AppShell1() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  // Mobile top bar component
  const MobileTopBar = () => (
    <div
      className={`bg-background flex items-center justify-between px-4 h-14 ${
        !isMenuOpen ? "border-b border-border" : ""
      }`}
    >
      <Button
        variant="ghost"
        onClick={toggleMenu}
        className="relative flex items-center justify-center h-9 w-9 -ml-2 [&_svg]:size-5"
      >
        <span
          className={`absolute transition-all duration-300 ${
            isMenuOpen ? "opacity-0 rotate-90" : "opacity-100 rotate-0"
          }`}
        >
          <Menu />
        </span>
        <span
          className={`absolute transition-all duration-300 ${
            isMenuOpen ? "opacity-100 rotate-0" : "opacity-0 -rotate-90"
          }`}
        >
          <X />
        </span>
      </Button>

      <Logo className="absolute left-1/2 transform -translate-x-1/2 w-8 h-8" />

      <div className="flex items-center gap-3 absolute right-4">
        <Button variant="ghost" className="h-9 w-9 p-0 [&_svg]:size-5">
          <Search className="text-muted-foreground" />
        </Button>
        <Button className="h-9 w-9 p-0 [&_svg]:size-5">
          <Zap />
        </Button>
      </div>
    </div>
  );

  // Navigation items component
  const NavItems = ({ isMobile = false }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const toggleSettings = () => setIsSettingsOpen(!isSettingsOpen);

    const linkClasses = `font-medium ${isMobile ? "text-base" : "text-sm"} ${
      isMobile
        ? "text-muted-foreground"
        : "text-muted-foreground hover:bg-primary/5"
    } px-3 py-2 rounded-md`;

    return (
      <>
        <Link href="#" className={`${linkClasses} ${isMobile ? "text-primary" : "text-primary"}`}>
          Dashboard
        </Link>
        <Link href="#" className={`${linkClasses} flex gap-2`}>
          Orders
          <Badge className="h-5 w-5 text-xs flex items-center justify-center p-0">
            2
          </Badge>
        </Link>
        <Link href="#" className={linkClasses}>Products</Link>
        <Link href="#" className={linkClasses}>Customers</Link>
        {isMobile ? (
          <div>
            <button
              onClick={toggleSettings}
              className={`w-full text-left ${linkClasses} flex items-center justify-between`}
            >
              Settings
              <ChevronDown
                className={`h-5 w-5 transition-transform ${
                  isSettingsOpen ? "transform rotate-180" : ""
                }`}
              />
            </button>
            {isSettingsOpen && (
              <div className="ml-3 mt-1 space-y-1">
                <Link href="#" className="block text-muted-foreground px-3 py-2 rounded-md text-base font-medium">
                  General
                </Link>
                <Link href="#" className="block text-muted-foreground px-3 py-2 rounded-md text-base font-medium">
                  Security
                </Link>
                <Link href="#" className="block text-muted-foreground px-3 py-2 rounded-md text-base font-medium">
                  API
                </Link>
                <Link href="#" className="block text-muted-foreground px-3 py-2 rounded-md text-base font-medium">
                  Advanced
                </Link>
              </div>
            )}
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className={`flex items-center ${linkClasses}`}>
              Settings <ChevronDown className="ml-1 h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>General</DropdownMenuItem>
              <DropdownMenuItem>Security</DropdownMenuItem>
              <DropdownMenuItem>API</DropdownMenuItem>
              <DropdownMenuItem>Advanced</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </>
    );
  };

  return (
    <div className="bg-background">
      {/* Desktop Navbar */}
      <nav className="h-16 bg-background border-b border-border shadow-sm hidden lg:block">
        <div className="container mx-auto flex items-center justify-between px-6 h-full">
          <div className="flex items-center gap-x-4">
            <Logo />
            <div className="flex items-center gap-x-1">
              <NavItems />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon">
              <Search className="h-5 w-5 text-muted-foreground" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="cursor-pointer">
                  <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                  <AvatarFallback>JD</AvatarFallback>
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
            <Button>
              <Zap className="h-4 w-4" /> Upgrade
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile Navbar */}
      <nav className="lg:hidden">
        <MobileTopBar />
      </nav>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="bg-background lg:hidden border-b border-border">
          <div className="flex flex-col">
            <div className="flex-grow overflow-y-auto p-2">
              <div className="flex flex-col">
                <NavItems isMobile={true} />
              </div>
            </div>
            <Separator />
            <div className="p-2">
              <div className="flex items-center space-x-3 p-2">
                <Avatar>
                  <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">John Doe</p>
                  <p className="text-sm text-muted-foreground">hi@shadcndesign.com</p>
                </div>
              </div>
              <div>
                <Link href="#" className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  My profile
                </Link>
                <Link href="#" className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  Account settings
                </Link>
                <Link href="#" className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  Billing
                </Link>
                <Link href="#" className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  Sign out
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-background border-b border-border md:py-6 py-4">
        <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/docs/components">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Project alpha</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex justify-between md:items-center gap-6 md:flex-row flex-col">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Project alpha
              </h1>
              <p className="text-sm lg:text-base text-muted-foreground">
                Manage your project's details such as name, image, description and settings.
              </p>
            </div>
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
      </div>

      <div className="container mx-auto lg:px-6 px-4 py-6 flex flex-col gap-6">
        <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
          Replace this div with your content
        </div>
      </div>
    </div>
  );
}
