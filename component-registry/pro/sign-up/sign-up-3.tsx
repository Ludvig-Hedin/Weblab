"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export function SignUp3() {
  return (
    <div className="md:flex md:min-h-screen bg-background md:p-6 py-12 gap-x-6">
      {/* Left side: Sign-up form */}
      <div className="md:w-1/2 flex items-center justify-center">
        <div className="max-w-sm px-6 md:p-0 w-full ">
          {/* Logo and header */}
          <div className="space-y-6 mb-6">
            <Logo className="h-8 w-8" />
            <div className="flex flex-col gap-y-3">
              <h1 className="text-2xl md:text-3xl font-bold">Create an account</h1>
              <p className="text-muted-foreground text-sm">
                Let's get started. Fill in the details below to create your
                account.
              </p>
            </div>
          </div>

          {/* Sign-up form fields */}
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

          {/* Sign-up button */}
          <div className="flex flex-col space-y-4 mb-6">
            <Button className="w-full">Sign up</Button>
          </div>

          {/* Alternative sign-up options */}
          <div className="flex flex-col space-y-6">
            {/* Separator */}
            <div className="w-full relative">
              <div className="text-xs text-muted-foreground bg-background px-2 uppercase absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                Or
              </div>
              <Separator />
            </div>
            {/* Social media sign-up buttons */}
            <div className="flex gap-x-3">
              {/* GitHub button */}
              <Button variant="outline" className="w-full text-foreground">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 17 17"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g clip-path="url(#clip0_772_108)">
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M8.17312 0.5C3.74567 0.5 0.166504 4.10555 0.166504 8.56611C0.166504 12.1317 2.4598 15.1498 5.64121 16.2181C6.03896 16.2984 6.18466 16.0445 6.18466 15.831C6.18466 15.644 6.17155 15.003 6.17155 14.3352C3.9443 14.816 3.4805 13.3736 3.4805 13.3736C3.12256 12.4388 2.59222 12.1985 2.59222 12.1985C1.86324 11.7044 2.64532 11.7044 2.64532 11.7044C3.45395 11.7578 3.87826 12.5324 3.87826 12.5324C4.59396 13.7609 5.74724 13.4138 6.21121 13.2001C6.27742 12.6792 6.48966 12.3187 6.71501 12.1184C4.93862 11.9314 3.06963 11.237 3.06963 8.13869C3.06963 7.2573 3.38757 6.53619 3.89137 5.97536C3.81188 5.77509 3.53343 4.94696 3.97102 3.83858C3.97102 3.83858 4.64706 3.62487 6.17139 4.66654C6.82401 4.48998 7.49704 4.40016 8.17312 4.3994C8.84916 4.3994 9.53832 4.49298 10.1747 4.66654C11.6992 3.62487 12.3752 3.83858 12.3752 3.83858C12.8128 4.94696 12.5342 5.77509 12.4547 5.97536C12.9718 6.53619 13.2766 7.2573 13.2766 8.13869C13.2766 11.237 11.4076 11.918 9.61797 12.1184C9.90969 12.3721 10.1614 12.8528 10.1614 13.614C10.1614 14.6957 10.1483 15.5638 10.1483 15.8308C10.1483 16.0445 10.2942 16.2984 10.6918 16.2182C13.8732 15.1497 16.1665 12.1317 16.1665 8.56611C16.1796 4.10555 12.5873 0.5 8.17312 0.5Z"
                      fill="currentColor"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_772_108">
                      <rect
                        width="16"
                        height="16"
                        fill="currentColor"
                        transform="translate(0.166504 0.5)"
                      />
                    </clipPath>
                  </defs>
                </svg>
              </Button>
              <Button variant="outline" className="w-full text-foreground">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 17 17"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g clip-path="url(#clip0_772_237)">
                    <path
                      d="M16.1039 7.26714L16.0232 6.92464H8.57893V10.0754H13.0268C12.565 12.2682 10.4221 13.4225 8.67179 13.4225C7.39821 13.4225 6.05571 12.8868 5.16714 12.0257C4.69833 11.5642 4.32516 11.0147 4.069 10.4087C3.81283 9.80271 3.6787 9.15216 3.67429 8.49429C3.67429 7.16714 4.27071 5.83964 5.13857 4.96643C6.00643 4.09321 7.31714 3.60464 8.62036 3.60464C10.1129 3.60464 11.1825 4.39714 11.5825 4.75857L13.8214 2.53143C13.1646 1.95429 11.3604 0.5 8.54821 0.5C6.37857 0.5 4.29821 1.33107 2.7775 2.84679C1.27679 4.33929 0.5 6.4975 0.5 8.5C0.5 10.5025 1.235 12.5529 2.68929 14.0571C4.24321 15.6614 6.44393 16.5 8.71 16.5C10.7718 16.5 12.7261 15.6921 14.1189 14.2264C15.4882 12.7836 16.1964 10.7871 16.1964 8.69429C16.1964 7.81321 16.1079 7.29 16.1039 7.26714Z"
                      fill="currentColor"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_772_237">
                      <rect
                        width="16"
                        height="16"
                        fill="white"
                        transform="translate(0.5 0.5)"
                      />
                    </clipPath>
                  </defs>
                </svg>
              </Button>
              <Button variant="outline" className="w-full text-foreground">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 17 17"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g clip-path="url(#clip0_772_70)">
                    <path
                      d="M15.3611 12.9689C15.1192 13.5279 14.8328 14.0424 14.5009 14.5155C14.0486 15.1604 13.6782 15.6068 13.3928 15.8547C12.9504 16.2616 12.4763 16.47 11.9687 16.4818C11.6042 16.4818 11.1647 16.3781 10.6531 16.1678C10.1399 15.9584 9.66819 15.8547 9.2369 15.8547C8.78456 15.8547 8.29944 15.9584 7.78055 16.1678C7.26086 16.3781 6.84221 16.4878 6.52212 16.4986C6.03532 16.5194 5.5501 16.3051 5.06577 15.8547C4.75664 15.5851 4.36999 15.1229 3.90679 14.4681C3.40982 13.7688 3.00124 12.958 2.68115 12.0336C2.33835 11.0351 2.1665 10.0682 2.1665 9.13214C2.1665 8.05987 2.3982 7.13506 2.86228 6.36007C3.22701 5.73757 3.71223 5.24653 4.31952 4.88604C4.92681 4.52556 5.58299 4.34186 6.28963 4.33011C6.67629 4.33011 7.18333 4.44971 7.81343 4.68477C8.44176 4.92061 8.8452 5.04021 9.02209 5.04021C9.15433 5.04021 9.60251 4.90036 10.3623 4.62156C11.0808 4.363 11.6872 4.25594 12.184 4.29811C13.5301 4.40675 14.5414 4.9374 15.214 5.89342C14.0101 6.62288 13.4145 7.64458 13.4264 8.95525C13.4373 9.97616 13.8076 10.8257 14.5355 11.5003C14.8654 11.8133 15.2337 12.0553 15.6436 12.2272C15.5547 12.4849 15.4609 12.7318 15.3611 12.9689V12.9689ZM12.2738 0.820091C12.2738 1.62027 11.9815 2.3674 11.3988 3.05894C10.6956 3.88104 9.84507 4.35608 8.92273 4.28112C8.91098 4.18513 8.90416 4.08409 8.90416 3.97792C8.90416 3.20975 9.23857 2.38765 9.83243 1.71547C10.1289 1.37514 10.506 1.09215 10.9633 0.86641C11.4195 0.644037 11.8511 0.521059 12.257 0.5C12.2689 0.606972 12.2738 0.713951 12.2738 0.820081V0.820091Z"
                      fill="currentColor"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_772_70">
                      <rect
                        width="16"
                        height="16"
                        fill="white"
                        transform="translate(0.833008 0.5)"
                      />
                    </clipPath>
                  </defs>
                </svg>
              </Button>
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link className="underline text-foreground" href="#">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right side: Testimonial */}
      <div className="w-1/2 min-h-full bg-destructive rounded-xl hidden md:flex flex-col-reverse bg-[url('https://ui.shadcn.com/placeholder.svg')] bg-cover bg-center relative overflow-hidden">
        <div className="absolute inset-0 bg-black opacity-60"></div>
        <div className="relative z-10 p-12">
          <div>
            {/* Testimonial quote */}
            <p className="text-lg text-white mb-6">
              "Shadcn UI Kit for Figma has completely transformed our design
              process. It's incredibly intuitive and saves us so much time. The
              components are beautifully crafted and customizable."
            </p>
            {/* Testimonial author */}
            <div>
              <p className="font-semibold text-white">Sarah Thompson</p>
              <p className="text-white">
                Lead UX Designer at BrightWave Solutions
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
