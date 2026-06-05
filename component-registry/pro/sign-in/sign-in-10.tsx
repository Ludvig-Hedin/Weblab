"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useState } from "react";

export function SignIn10() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    // Main container
    <div className="min-h-screen bg-muted flex items-top pt-16 justify-center">
      {/* Dropdown menu for sign-in form */}
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        {/* Trigger button for dropdown */}
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Sign in</Button>
        </DropdownMenuTrigger>
        {/* Dropdown content */}
        <DropdownMenuContent className="w-screen md:w-[320px] p-6 md:rounded-lg rounded-none border-none md:border">
          <div className="grid gap-4">
            {/* Sign-in form title */}
            <h2 className="text-lg font-bold">Sign in</h2>
            {/* Email input field */}
            <Input id="email" placeholder="Email" type="email" />
            {/* Password input field */}
            <Input id="password" placeholder="Password" type="password" />
            {/* Remember me checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox id="remember" />
              <label
                htmlFor="remember"
                className="text-sm font-medium leading-none"
              >
                Remember me
              </label>
            </div>
            {/* Sign-in button */}
            <Button>Sign in</Button>
            {/* Forgot password link */}
            <div className="text-center">
              <Link
                href="#"
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <Separator />
            {/* Sign-up section */}
            <div>
              <p className="text-sm text-muted-foreground text-center">
                Don't have an account?
              </p>
              {/* Sign-up button */}
              <Button variant="secondary" className="w-full mt-2">
                Sign up
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
