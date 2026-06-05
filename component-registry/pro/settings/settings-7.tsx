"use client";

import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Menu, Zap, Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function Navbar2() {
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
        : "text-muted-foreground hover:bg-muted/50"
    } px-3 py-2 rounded-md`;

    return (
      <>
        {/* Main navigation links */}
        <Link href="#" className={linkClasses}>
          Dashboard
        </Link>
        <Link href="#" className={linkClasses}>
          Orders
        </Link>
        <Link href="#" className={linkClasses}>
          Products
        </Link>
        <Link href="#" className={linkClasses}>
          Customers
        </Link>
        <Link href="#" className={`${linkClasses} text-primary`}>
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
            {/* New item button */}
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

export function Settings7() {
  return (
    <div className="bg-background">
      <div className="min-h-screen bg-muted/40">
        {/* Use the inline Navbar component */}
        <Navbar2 />
        <div className="bg-background border-b border-border">
          <div className="container mx-auto px-4 md:px-6 py-4 md:py-6 flex flex-col ">
            {/* Main content */}
            <div className="flex justify-between md:items-center gap-3 md:flex-row flex-col">
              <div className="space-y-2">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  Settings
                </h1>
              </div>
              {/* Search */}
              <div className="relative md:max-w-xs w-full">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input type="search" placeholder="Search" className="pl-8" />
              </div>
              {/* Mobile-only dropdown */}
              <div className="md:hidden">
                <Select defaultValue="account">
                  <SelectTrigger>
                    <SelectValue placeholder="Select setting" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profile">Profile</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                    <SelectItem value="members">Members</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="invoices">Invoices</SelectItem>
                    <SelectItem value="notifications">Notifications</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row">
            {/* Sidebar - hidden on mobile, no border */}
            <aside className="hidden md:block w-64 py-6">
              <ul className="space-y-1 -ml-3">
                <li className="hover:bg-accent-foreground/10 rounded-md px-3 py-2 text-sm text-muted-foreground font-medium cursor-pointer">
                  <a>Profile</a>
                </li>
                <li className="hover:bg-accent-foreground/10 bg-accent-foreground/5 rounded-md px-3 py-2 text-sm text-accent-foreground font-medium cursor-pointer">
                  <a>Account</a>
                </li>
                <li className="hover:bg-accent-foreground/10 rounded-md px-3 py-2 text-sm text-muted-foreground font-medium cursor-pointer">
                  <a>Members</a>
                </li>
                <li className="hover:bg-accent-foreground/10 rounded-md px-3 py-2 text-sm text-muted-foreground font-medium cursor-pointer">
                  <a>Billing</a>
                </li>
                <li className="hover:bg-accent-foreground/10 rounded-md px-3 py-2 text-sm text-muted-foreground font-medium cursor-pointer">
                  <a>Invoices</a>
                </li>
                <li className="hover:bg-accent-foreground/10 rounded-md px-3 py-2 text-sm text-muted-foreground font-medium cursor-pointer">
                  <a>Notifications</a>
                </li>
              </ul>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">
              <div className="container mx-auto px-0 py-4 md:py-6 md:pl-6">
                <div className="flex flex-col gap-4 md:gap-6">
                  {/* Avatar Card */}
                  <Card className="border border-border rounded-lg shadow-sm">
                    <div className="p-4 md:p-6">
                      <div className="space-y-1">
                        <h2 className="text-lg md:text-xl font-semibold">
                          Avatar
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Avatar is your profile picture - everyone who visits
                          your profile will see this.
                        </p>
                      </div>
                    </div>
                    <div className="px-4 pb-6 md:px-6 flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src="https://github.com/shadcn.png"
                          alt="User avatar"
                        />
                      </Avatar>
                      <Button variant="outline">
                        <Upload />
                        Upload
                      </Button>
                    </div>
                    <div className="px-4 py-4 md:px-6 border-t flex items-center justify-start md:justify-end">
                      <Button>Save</Button>
                    </div>
                  </Card>

                  {/* Display Name Card */}
                  <Card className="border border-border rounded-lg shadow-sm">
                    <div className="px-4 py-4 md:px-6">
                      <div className="space-y-1">
                        <h2 className="text-lg md:text-xl font-semibold">
                          Display name
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Enter your full name or a display name you'd like to
                          use.
                        </p>
                      </div>
                    </div>
                    <div className="px-4 pb-4 md:px-6">
                      <Input
                        defaultValue="Shadcn Design"
                        className="max-w-[317px]"
                      />
                    </div>
                    <div className="py-4 px-4 md:px-6 border-t flex flex-col md:flex-row items-start md:items-center gap-3 justify-between">
                      <p className="text-sm text-muted-foreground">
                        Maximum allowed length is 32 characters.
                      </p>
                      <Button>Save</Button>
                    </div>
                  </Card>

                  {/* Teams Card */}
                  <Card className="border border-border rounded-lg shadow-sm">
                    <div className="p-4 md:p-6">
                      <div className="space-y-1">
                        <h2 className="text-lg md:text-xl font-semibold">
                          Teams
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Here is your URL namespace for use in our app.
                        </p>
                      </div>
                    </div>
                    <div className="px-4 pb-4 md:px-6">
                      <Table className="w-full min-w-[480px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Team name</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">
                              Permissions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableRow>
                          <TableCell className="font-medium">
                            Shadcn Design Team
                          </TableCell>
                          <TableCell>5 September 2024</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">Admin</Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            Vercel Team
                          </TableCell>
                          <TableCell>2 August 2024</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">Admin</Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            Figma Team
                          </TableCell>
                          <TableCell>14 January 2023</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">Designer</Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            Next JS Team
                          </TableCell>
                          <TableCell>11 May 2023</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">Developer</Badge>
                          </TableCell>
                        </TableRow>
                      </Table>
                    </div>
                    <div className="py-4 px-4 md:px-6 border-t flex flex-col md:flex-row items-start md:items-center gap-3 justify-end">
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="order-2 md:order-1"
                        >
                          Edit
                        </Button>
                        <Button disabled className="order-1 md:order-2">
                          Save
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* Delete Account Card */}
                  <Card className="border border-destructive rounded-lg shadow-sm">
                    <div className="p-4 md:p-6">
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold">
                          Delete account
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          This will permanently delete your Personal Account.
                          Please note that this action is irreversible, so
                          proceed with caution.
                        </p>
                      </div>
                    </div>
                    <div className="py-4 px-4 md:px-6 border-t flex flex-col md:flex-row items-start md:items-center gap-3 justify-between bg-destructive/10">
                      <p className="text-sm text-destructive">
                        This action cannot be undone!
                      </p>
                      <Button variant="destructive">Delete account</Button>
                    </div>
                  </Card>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
