"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export function SignIn8() {
  return (
    <div className="md:min-h-screen flex items-center justify-center md:bg-muted bg-cover">
      <div className="md:max-w-[440px] w-full h-screen md:h-auto md:px-4 md:py-6 flex flex-col">
        <Card className="w-full md:rounded-lg shadow-none rounded-none border-none md:border md:shadow-md">
          <div className="max-w-sm mx-auto md:w-full md:max-w-full">
            {/* Card Header: Logo, Title, and Description */}
            <CardHeader className="text-center flex flex-col items-center">
              <Logo className="mb-6" />
              <CardTitle className="md:text-3xl font-bold">Sign in</CardTitle>
              <CardDescription>
                Welcome back! Please sign in to continue.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Social Sign-in Buttons: Google and Github */}
              <div className="w-full flex gap-x-2">
                <Button variant="outline" className="w-full space-x-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g clip-path="url(#clip0_772_376)">
                      <path
                        d="M8 6.54543V9.64361H12.3054C12.1164 10.64 11.549 11.4836 10.6981 12.0509L13.2945 14.0655C14.8072 12.6692 15.68 10.6182 15.68 8.18187C15.68 7.61461 15.6291 7.0691 15.5345 6.54551L8 6.54543Z"
                        fill="#4285F4"
                      />
                      <path
                        d="M3.51625 9.52267L2.93067 9.97093L0.85791 11.5854C2.17427 14.1963 4.87225 16 7.9995 16C10.1594 16 11.9703 15.2873 13.294 14.0655L10.6976 12.0509C9.98492 12.5309 9.07582 12.8218 7.9995 12.8218C5.91951 12.8218 4.15229 11.4182 3.51952 9.52729L3.51625 9.52267Z"
                        fill="#34A853"
                      />
                      <path
                        d="M0.858119 4.41455C0.312695 5.49087 0 6.70543 0 7.99996C0 9.29448 0.312695 10.509 0.858119 11.5854C0.858119 11.5926 3.51998 9.51991 3.51998 9.51991C3.35998 9.03991 3.26541 8.53085 3.26541 7.99987C3.26541 7.46889 3.35998 6.95984 3.51998 6.47984L0.858119 4.41455Z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M7.99966 3.18545C9.17786 3.18545 10.2251 3.59271 11.0615 4.37818L13.3524 2.0873C11.9633 0.792777 10.1597 0 7.99966 0C4.87242 0 2.17427 1.79636 0.85791 4.41455L3.51969 6.48001C4.15238 4.58908 5.91968 3.18545 7.99966 3.18545Z"
                        fill="#EA4335"
                      />
                    </g>
                    <defs>
                      <clipPath id="clip0_772_376">
                        <rect width="16" height="16" fill="white" />
                      </clipPath>
                    </defs>
                  </svg>

                  <span>Google</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full space-x-2 text-foreground"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g clip-path="url(#clip0_775_1398)">
                      <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M8.00662 0C3.57917 0 0 3.60555 0 8.06611C0 11.6317 2.29329 14.6498 5.4747 15.7181C5.87246 15.7984 6.01816 15.5445 6.01816 15.331C6.01816 15.144 6.00505 14.503 6.00505 13.8352C3.7778 14.316 3.31399 12.8736 3.31399 12.8736C2.95606 11.9388 2.42572 11.6985 2.42572 11.6985C1.69674 11.2044 2.47882 11.2044 2.47882 11.2044C3.28744 11.2578 3.71175 12.0324 3.71175 12.0324C4.42745 13.2609 5.58074 12.9138 6.04471 12.7001C6.11092 12.1792 6.32315 11.8187 6.5485 11.6184C4.77211 11.4314 2.90312 10.737 2.90312 7.63869C2.90312 6.7573 3.22107 6.03619 3.72486 5.47536C3.64538 5.27509 3.36693 4.44696 3.80451 3.33858C3.80451 3.33858 4.48055 3.12487 6.00488 4.16654C6.6575 3.98998 7.33054 3.90016 8.00662 3.8994C8.68266 3.8994 9.37181 3.99298 10.0082 4.16654C11.5327 3.12487 12.2087 3.33858 12.2087 3.33858C12.6463 4.44696 12.3677 5.27509 12.2882 5.47536C12.8053 6.03619 13.1101 6.7573 13.1101 7.63869C13.1101 10.737 11.2411 11.418 9.45146 11.6184C9.74318 11.8721 9.99492 12.3528 9.99492 13.114C9.99492 14.1957 9.98181 15.0638 9.98181 15.3308C9.98181 15.5445 10.1277 15.7984 10.5253 15.7182C13.7067 14.6497 16 11.6317 16 8.06611C16.0131 3.60555 12.4208 0 8.00662 0Z"
                        fill="currentColor"
                      />
                    </g>
                    <defs>
                      <clipPath id="clip0_775_1398">
                        <rect width="16" height="16" fill="white" />
                      </clipPath>
                    </defs>
                  </svg>
                  <span>Github</span>
                </Button>
              </div>

              {/* Separator with "Or" text */}
              <div className="w-full relative my-6">
                <div className="text-xs text-muted-foreground bg-background px-2 uppercase absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  Or
                </div>
                <Separator />
              </div>

              {/* Email Sign-in Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" placeholder="Email" type="email" />
                </div>
                <Button className="w-full">Continue</Button>
                <Button variant="link" className="w-full">
                  Use passkey instead
                </Button>
              </div>
            </CardContent>

            {/* Card Footer: Sign-up Link */}
            <CardFooter className="flex w-full items-center justify-center md:bg-muted md:p-6 md:rounded-bl-lg md:rounded-br-lg md:border-t ">
              <p className="text-sm text-center text-muted-foreground">
                Don't have an account?{" "}
                <Link className="underline text-foreground" href="#">
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </div>
        </Card>

        {/* Footer: Copyright and Links */}
        <div className="flex md:flex-row flex-col text-sm text-center w-full md:justify-between gap-y-4 text-muted-foreground bg-muted md:bg-transparent py-6">
          <div>© 2024 shadcndesign.com</div>
          <div className="space-x-4">
            <Link className="underline" href="#">
              Terms
            </Link>
            <Link className="underline" href="#">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
