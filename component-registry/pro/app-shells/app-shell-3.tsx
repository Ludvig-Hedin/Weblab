"use client";

import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Menu, Zap, Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";

function Navbar2() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  // Mobile top bar component
  const MobileTopBar = () => (
    <div
      className={`bg-background flex items-center justify-between px-4 h-14 ${
        !isMenuOpen ? "border-b border-border" : ""
      }`}
    >
      {/* Mobile menu toggle button */}
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

      {/* Logo */}
      <Logo className="absolute left-1/2 transform -translate-x-1/2 w-8 h-8" />

      {/* Mobile upgrade button */}
      <div className="flex items-center gap-3 absolute right-4">
        <Button className="h-9 w-9 p-0 [&_svg]:size-5">
          <Zap />
        </Button>
      </div>
    </div>
  );

  // Navigation items component
  const NavItems = ({ isMobile = false }) => {
    const linkClasses = `font-medium ${isMobile ? "text-base" : "text-sm"} ${
      isMobile
        ? "text-muted-foreground"
        : "text-muted-foreground hover:bg-primary/5"
    } px-3 py-2 rounded-md`;

    return (
      <>
        {/* Main navigation links */}
        <Link className={linkClasses}>Dashboard</Link>
        <Link className={linkClasses}>Orders</Link>
        <Link className={linkClasses}>Products</Link>
        <Link className={linkClasses}>Customers</Link>
        <Link
          className={`${linkClasses} ${
            isMobile ? "text-primary" : "text-primary"
          }`}
        >
          Settings
        </Link>
      </>
    );
  };

  return (
    <>
      {/* Desktop Navbar */}
      <nav className="h-16 bg-background border-b border-border shadow-sm hidden lg:block">
        <div className="container mx-auto flex items-center justify-between px-6 h-full">
          {/* Left section: Logo */}
          <div className="flex items-center gap-x-4">
            <Logo />
          </div>
          {/* Right section: user menu and button */}
          <div className="flex items-center gap-x-4">
            <div className="flex items-center gap-x-1">
              <NavItems />
            </div>
            <Button>
              <Zap className="h-4 w-4" /> Upgrade
            </Button>
            {/* User menu dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="cursor-pointer">
                  <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
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

      {/* Mobile Navbar */}
      <nav className="lg:hidden">
        <MobileTopBar />
      </nav>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="bg-background lg:hidden border-b border-border">
          <div className="flex flex-col">
            {/* Mobile menu content */}
            <div className="flex-grow overflow-y-auto p-2">
              <div className="flex flex-col">
                <NavItems isMobile={true} />
              </div>
            </div>
            <Separator />
            {/* Mobile user profile section */}
            <div className="p-2">
              {/* User info */}
              <div className="flex items-center space-x-3 p-2">
                <Avatar>
                  <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                  />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">John Doe</p>
                  <p className="text-sm text-muted-foreground">
                    hi@shadcndesign.com
                  </p>
                </div>
              </div>
              {/* User-related links */}
              <div>
                <Link
                  href="#"
                  className="block font-medium text-muted-foreground px-2 py-2 rounded-md"
                >
                  My profile
                </Link>
                <Link
                  href="#"
                  className="block font-medium text-muted-foreground px-2 py-2 rounded-md"
                >
                  Account settings
                </Link>
                <Link
                  href="#"
                  className="block font-medium text-muted-foreground px-2 py-2 rounded-md"
                >
                  Billing
                </Link>
                <Link
                  href="#"
                  className="block font-medium text-muted-foreground px-2 py-2 rounded-md"
                >
                  Sign out
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PageHeader4() {
  return (
    <div className="md:py-6 py-4">
      <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
        {/* Breadcrumb navigation */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink>Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Profile details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Main content */}
        <div className="flex justify-between md:items-center gap-6 md:flex-row flex-col">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Profile details
            </h1>
            <p className="text-sm lg:text-base text-muted-foreground">
              Manage your profile details such as name, image, description and
              settings.
            </p>
          </div>
          {/* Search */}
          <div className="relative md:max-w-xs w-full">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input type="search" placeholder="Search" className="pl-8" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell3() {
  return (
    <div className="bg-muted">
      <Navbar2 />
      <PageHeader4 />
      <div className="container mx-auto lg:px-6 px-4 pb-4 flex flex-col gap-6">
        <div className="bg-background border border-border shadow-sm rounded-lg">
          <div className="pt-4 md:pt-6">
            <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
              <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
                Replace this div with your content
              </div>
            </div>
          </div>
          <div className="container mx-auto lg:px-6 px-4 py-6">
            <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
              Replace this div with your content
            </div>
          </div>
          <div className="border-t border-border py-4">
            <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
              <div className="w-full text-muted-foreground p-6 border border-border rounded-md bg-muted text-center border-dashed">
                Replace this div with your content
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
