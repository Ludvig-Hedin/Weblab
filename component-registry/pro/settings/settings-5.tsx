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
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Menu, Zap, Search, X, Download, ExternalLink } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { useState } from "react";

function Navbar1() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

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

  const NavItems = ({ isMobile = false }) => {
    const linkClasses = `font-medium ${isMobile ? "text-base" : "text-sm"} ${
      isMobile
        ? "text-muted-foreground"
        : "text-muted-foreground hover:bg-primary/5"
    } px-3 py-2 rounded-md`;

    return (
      <>
        <Link className={`${linkClasses}`}>Dashboard</Link>
        <Link className={linkClasses}>Orders</Link>
        <Link className={linkClasses}>Products</Link>
        <Link className={linkClasses}>Customers</Link>
        <Link className={`${linkClasses} text-primary`}>Settings</Link>
      </>
    );
  };

  return (
    <>
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
            <Button>
              <Zap className="h-4 w-4" /> Upgrade
            </Button>
          </div>
        </div>
      </nav>

      <nav className="lg:hidden">
        <MobileTopBar />
      </nav>

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
              <div>
                <Link className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  My profile
                </Link>
                <Link className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  Account settings
                </Link>
                <Link className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
                  Billing
                </Link>
                <Link className="block font-medium text-muted-foreground px-2 py-2 rounded-md">
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

// Page Header

function PageHeader3() {
  return (
    <div className="bg-background border-b border-border pt-0 md:pb-6 pb-4">
      <nav className="border-b border-border mb-6">
        <div className="container mx-auto lg:px-3.5 px-2 flex overflow-x-auto">
          <Link className="text-sm py-1.5 text-foreground flex-shrink-0">
            <span className="px-2.5 py-2 block rounded-md hover:bg-muted">
              Profile
            </span>
          </Link>
          <Link className="text-sm text-muted-foreground py-1.5 flex-shrink-0">
            <span className="px-2.5 py-2 block rounded-md hover:bg-muted">
              Account
            </span>
          </Link>
          <Link className="text-sm text-muted-foreground py-1.5 flex-shrink-0">
            <span className="px-2.5 py-2 block rounded-md hover:bg-muted">
              Analytics
            </span>
          </Link>
          <Link className="border-b-2 border-primary text-sm text-foreground py-1.5 flex-shrink-0">
            <span className="px-2.5 py-2 block rounded-md hover:bg-muted">
              API
            </span>
          </Link>
          <Link className="text-sm text-muted-foreground py-1.5 flex-shrink-0">
            <span className="px-2.5 py-2 block rounded-md hover:bg-muted">
              Members
            </span>
          </Link>
        </div>
      </nav>
      <div className="container mx-auto lg:px-6 px-4 flex flex-col gap-6">
        <div className="flex justify-between md:items-center gap-6 md:flex-row flex-col">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              API Settings
            </h1>
            <p className="text-sm lg:text-base text-muted-foreground">
              Configure your API settings. Add, remove or edit existing API
              keys.
            </p>
          </div>

          <div>
            <Button variant="outline">Contact support</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Settings5() {
  return (
    <div className="bg-background">
      <Navbar1 />
      <PageHeader3 />
      <main>
        <div className="container mx-auto p-4 lg:p-6 flex flex-col gap-6 lg:gap-8">
          <section className="flex flex-col gap-4 lg:gap-6">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Your plan</h2>
              <p className="text-muted-foreground text-sm lg:text-base">
                Manage or upgrade your plan.
              </p>
            </div>

            {/* Plan Summary */}
            <Card>
              <CardHeader className="px-4 lg:px-6 pt-4 lg:pt-6 pb-0">
                <div className="flex gap-2 items-center">
                  <CardTitle className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Plan Summary</span>
                  </CardTitle>
                  <Badge variant="secondary">Free Plan</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 lg:p-6">
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">100 credits left</span>
                  </div>
                  <Progress value={50} className="h-4" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Price/Month</p>
                    <p className="font-semibold">$0</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Included Credits
                    </p>
                    <p className="font-semibold">200</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Renewal Date
                    </p>
                    <p className="font-semibold">Oct 3, 2024</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="py-4 px-4 lg:px-6 border-t bg-muted flex justify-end rounded-b-lg">
                <Button>
                  Upgrade plan <ExternalLink />
                </Button>
              </CardFooter>
            </Card>
          </section>
          <Separator />
          {/* Invoices */}
          <section className="flex flex-col gap-4 lg:gap-6">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Invoices</h2>
              <p className="text-muted-foreground text-sm lg:text-base">
                Manage your invoices, billing, and payment details effortlessly.
              </p>
            </div>
            <div className="flex flex-col md:flex-row justify-between">
              <div className="relative mb-2 md:mb-0 md:w-64">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  size={18}
                />
                <Input className="pl-10" placeholder="Search" />
              </div>
              <Button variant="outline">
                <Download /> Download all
              </Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader className="h-12">
                    <TableRow>
                      <TableHead className="text-foreground w-10 pt-1">
                        <Checkbox />
                      </TableHead>
                      <TableHead className="text-foreground">Invoice</TableHead>
                      <TableHead className="text-foreground hidden md:table-cell">
                        Billing date
                      </TableHead>
                      <TableHead className="text-foreground">Status</TableHead>
                      <TableHead className="text-foreground">Plan</TableHead>
                      <TableHead className="text-foreground w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      {
                        id: 2,
                        date: "Sep 5, 2024 8:50",
                        status: "Paid",
                        plan: "Basic plan",
                      },
                      {
                        id: 5,
                        date: "Aug 26, 2024 3:1",
                        status: "Paid",
                        plan: "Basic plan",
                      },
                      {
                        id: 4,
                        date: "Sep 18, 2024 9:5",
                        status: "Paid",
                        plan: "Basic plan",
                      },
                      {
                        id: 3,
                        date: "Sep 11, 2024 3:26",
                        status: "Paid",
                        plan: "Business plan",
                      },
                      {
                        id: 1,
                        date: "Sep 19, 2024 2:3",
                        status: "Paid",
                        plan: "Basic plan",
                      },
                    ].map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="pt-5">
                          <Checkbox />
                        </TableCell>
                        <TableCell className="font-medium">
                          Invoice #{invoice.id}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {invoice.date}
                        </TableCell>
                        <TableCell>{invoice.status}</TableCell>
                        <TableCell>{invoice.plan}</TableCell>
                        <TableCell>...</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end items-center p-4 border-t bg-muted">
                <Pagination className="justify-end hidden md:flex">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#">1</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" isActive>
                        2
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#">3</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                <div className="flex justify-end items-center space-x-2 md:hidden">
                  <Button variant="outline">Previous</Button>
                  <Button variant="outline">Next</Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
