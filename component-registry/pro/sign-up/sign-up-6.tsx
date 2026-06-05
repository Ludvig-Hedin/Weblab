"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

interface FeatureItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({
  icon,
  title,
  description,
}) => (
  <div className="flex flex-col md:flex-row items-start gap-4">
    <div>{icon}</div>
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
);

export function SignUp6() {
  return (
    <div className="bg-background md:bg-muted">
      <main className="min-h-screen flex flex-col md:flex-row max-w-screen-sm md:max-w-screen-lg mx-auto">
        {/* Left Column - Features & Marketing Content */}
        <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-center">
          {/* Brand Section */}
          <Logo className="mb-6" />
          <h1 className="text-2xl md:text-3xl font-bold mb-4">
            Start Your 30-Day Free Trial
          </h1>
          <p className="text-muted-foreground mb-0 md:mb-8">
            Unlock premium tools to power up your workflow — no credit card
            required.
          </p>

          {/* Desktop Feature List */}
          <div className="space-y-6 hidden md:block">
            <FeatureItem
              icon={<User className="w-6 h-6" />}
              title="Seamless User Experience"
              description="Streamline your workflow with an intuitive, user-friendly interface designed to boost productivity from day one."
            />
            <FeatureItem
              icon={<ShieldCheck className="w-6 h-6" />}
              title="Ensure Compliance"
              description="Easily meet industry regulations with automated compliance checks and up-to-date standards."
            />
            <FeatureItem
              icon={<ShieldCheck className="w-6 h-6" />}
              title="Built-In Security"
              description="Rest easy with enterprise-level encryption and multi-factor authentication, safeguarding your sensitive information."
            />
          </div>
        </div>

        {/* Right Column - Sign Up Form */}
        <div className="md:w-1/2 p-6 pt-0 md:p-8 flex items-center justify-center">
          <div className="w-full md:max-w-lg space-y-4 md:bg-card md:p-8 md:border md:rounded-xl md:shadow-sm">
            {/* Form Fields */}
            {/* Name Input Group */}
            <div className="md:grid md:grid-cols-2 md:gap-4 md:space-y-0 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="firstName">Name</Label>
                <Input id="firstName" placeholder="Name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" placeholder="Name" />
              </div>
            </div>

            {/* Email & Password Fields */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Password" />
              <p className="text-sm text-muted-foreground">
                Minimum 8 characters.
              </p>
            </div>

            {/* Action Buttons */}
            <Button className="w-full">Sign up</Button>

            {/* Sign In Link */}
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/signin" className="text-primary underline">
                Sign in
              </Link>
            </p>

            {/* Divider with "Or" Text */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* Social Login Options */}
            <div className="grid grid-cols-3 gap-3">
              {/* Google Button */}
              <Button variant="outline">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                  <path fill="none" d="M1 1h22v22H1z" />
                </svg>
              </Button>

              {/* GitHub Button */}
              <Button variant="outline">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </Button>

              {/* Apple Button */}
              <Button variant="outline">
                <svg
                  width="17"
                  height="16"
                  viewBox="0 0 17 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g clip-path="url(#clip0_3401_85)">
                    <path
                      d="M15.1966 12.4689C14.9546 13.0279 14.6682 13.5424 14.3364 14.0155C13.884 14.6604 13.5137 15.1068 13.2283 15.3547C12.7858 15.7616 12.3117 15.97 11.8041 15.9818C11.4397 15.9818 11.0002 15.8781 10.4886 15.6678C9.97533 15.4584 9.50364 15.3547 9.07234 15.3547C8.62001 15.3547 8.13489 15.4584 7.616 15.6678C7.09631 15.8781 6.67766 15.9878 6.35757 15.9986C5.87077 16.0194 5.38555 15.8051 4.90122 15.3547C4.59209 15.0851 4.20544 14.6229 3.74224 13.9681C3.24527 13.2688 2.83669 12.458 2.5166 11.5336C2.1738 10.5351 2.00195 9.56821 2.00195 8.63214C2.00195 7.55987 2.23365 6.63506 2.69773 5.86007C3.06246 5.23757 3.54768 4.74653 4.15497 4.38604C4.76226 4.02556 5.41844 3.84186 6.12508 3.83011C6.51173 3.83011 7.01878 3.94971 7.64888 4.18477C8.27721 4.42061 8.68065 4.54021 8.85754 4.54021C8.98978 4.54021 9.43796 4.40036 10.1977 4.12156C10.9162 3.863 11.5226 3.75594 12.0194 3.79811C13.3655 3.90675 14.3769 4.4374 15.0494 5.39342C13.8455 6.12288 13.25 7.14458 13.2618 8.45525C13.2727 9.47616 13.6431 10.3257 14.3709 11.0003C14.7008 11.3133 15.0692 11.5553 15.4791 11.7272C15.3902 11.9849 15.2963 12.2318 15.1966 12.4689V12.4689ZM12.1093 0.320091C12.1093 1.12027 11.8169 1.8674 11.2343 2.55894C10.5311 3.38104 9.68052 3.85608 8.75818 3.78112C8.74643 3.68513 8.73961 3.58409 8.73961 3.47792C8.73961 2.70975 9.07402 1.88765 9.66788 1.21547C9.96436 0.875136 10.3414 0.592152 10.7987 0.36641C11.255 0.144037 11.6866 0.0210593 12.0925 0C12.1043 0.106972 12.1093 0.213951 12.1093 0.320081V0.320091Z"
                      fill="currentColor"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_3401_85">
                      <rect
                        width="16"
                        height="16"
                        fill="white"
                        transform="translate(0.667969)"
                      />
                    </clipPath>
                  </defs>
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
