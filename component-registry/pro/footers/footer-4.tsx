"use client";

import { Logo } from "@/components/logo";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

// Footer navigation data
const FOOTER_COLUMNS = [
  {
    title: "Company",
    links: [
      { label: "About Us", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Partners", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Guides", href: "#" },
      { label: "Tutorials", href: "#" },
      { label: "FAQ", href: "#" },
      { label: "Downloads", href: "#" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Your Account", href: "#" },
      { label: "Settings", href: "#" },
      { label: "Accessibility", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
  {
    title: "Help & Feedback",
    links: [
      { label: "Contact Support", href: "#" },
      { label: "Get In Touch", href: "#" },
      { label: "Help Articles", href: "#" },
      { label: "Feedback Form", href: "#" },
    ],
  },
];

// Legal links data
const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "Cookies Settings", href: "#" },
];

export function Footer4() {
  return (
    <footer 
      className="bg-background py-16 lg:py-24"
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="container px-6 mx-auto flex flex-col gap-12 lg:gap-16">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5 lg:gap-6 items-center lg:items-start text-center lg:text-left">
          {/* Logo Column */}
          <div className="flex flex-col items-center lg:items-start">
            <Link href="/" aria-label="Go to homepage">
              <Logo />
            </Link>
          </div>

          {/* Navigation Columns */}
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-4">
              {/* Column Title */}
              <h2 className="text-base font-semibold text-foreground">
                {column.title}
              </h2>
              {/* Column Navigation */}
              <nav 
                className="flex flex-col gap-3"
                aria-label={`${column.title} links`}
              >
                {column.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-base text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/* Section Divider */}
        <Separator role="presentation" />

        {/* Bottom Section */}
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between text-center lg:text-left">
          {/* Copyright Text */}
          <p className="text-center text-base text-muted-foreground lg:text-left order-2 lg:order-1">
            <span>Copyright © {new Date().getFullYear()}</span>
            {" "}
            <Link 
              href="/"
              className="hover:underline"
            >
              shadcndesign.com
            </Link>
            . All rights reserved.
          </p>

          {/* Legal Navigation */}
          <nav 
            className="flex flex-col gap-6 lg:flex-row lg:gap-8 text-center lg:text-left items-center lg:items-start order-1 lg:order-2"
            aria-label="Legal links"
          >
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-center text-base text-muted-foreground hover:text-foreground transition-colors md:text-left"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
