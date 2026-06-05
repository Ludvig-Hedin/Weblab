"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export function SignIn9() {
  return (
    <div className="min-h-screen bg-background md:p-16 gap-x-6">
      {/* Content wrapper */}
      <div className="w-full flex items-top justify-center">
        {/* Sign-in form container */}
        <div className="max-w-sm px-6 py-16 md:p-0 w-full ">
          {/* Logo and header section */}
          <div className="space-y-6 mb-6 items-center flex flex-col">
            <Logo className="h-8 w-8" />
            <div className="flex flex-col gap-y-3 text-center">
              <h1 className="text-2xl md:text-3xl font-bold">Sign in</h1>
              <p className="text-muted-foreground text-sm">
                Log in to unlock tailored content and stay connected with your
                community.
              </p>
            </div>
          </div>
          {/* Input fields section */}
          <div className="space-y-4 mb-6">
            <div className="space-y-2">
              <Input id="email" placeholder="Email or username" type="email" />
              <Input id="password" placeholder="Password" type="password" />
            </div>
          </div>
          {/* Sign-in button and sign-up link section */}
          <div className="flex flex-col space-y-6">
            <Button className="w-full">Sign in</Button>
            {/* Forgot password link */}
            <div className="flex justify-center">
              <Link
                className="underline text-sm text-muted-foreground hover:text-foreground"
                href="#"
              >
                Forgot password?
              </Link>
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Don't have an account?{" "}
              <Link className="underline text-foreground" href="#">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
