"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import Link from "next/link";

export function SignUp1() {
  return (
    <div className="md:flex md:min-h-screen bg-background md:p-6 py-6 gap-x-6">
      {/* Left side: Sign-up form */}
      <div className="md:w-1/2 flex items-center justify-center">
        <div className="max-w-sm px-6 py-16 md:p-0 w-full">
          {/* Header section with logo and title */}
          <div className="space-y-6 mb-6">
            {/* Logo */}
            <Link href="https://www.shadcndesign.com/" target="_blank">
              <Logo />
            </Link>
            {/* Title and description */}
            <div className="flex flex-col gap-y-3">
              <h1 className="text-2xl md:text-3xl font-bold">
                Create an account
              </h1>
              <p className="text-muted-foreground text-sm">
                Let's get started. Fill in the details below to create your
                account.
              </p>
            </div>
          </div>
          {/* Sign-up form */}
          <div className="space-y-4 mb-6">
            {/* Name input */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Name" type="text" />
            </div>
            {/* Email input */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" placeholder="Email" type="email" />
            </div>
            {/* Password input */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" placeholder="Password" type="password" />
              <p className="text-sm text-muted-foreground">
                Minimum 8 characters.
              </p>
            </div>
            {/* Terms and conditions checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox id="terms" />
              <Label htmlFor="terms" className="text-sm font-normal">
                I agree to the{" "}
                <Link href="#" className="underline text-foreground">
                  Terms & Conditions
                </Link>
              </Label>
            </div>
          </div>
          {/* Sign-up button and Sign-in link */}
          <div className="flex flex-col space-y-4">
            <Button className="w-full">Sign up</Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have account?{" "}
              <Link className="underline text-foreground" href="#">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
      {/* Right side: Image (hidden on mobile) */}
      <Image
        src="https://ui.shadcn.com/placeholder.svg"
        alt="Image"
        width="1800"
        height="1800"
        className="w-1/2 rounded-xl object-cover md:block hidden"
      />
    </div>
  );
}
