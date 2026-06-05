"use client";

import { Separator } from "@/components/ui/separator";
import "./patterns-example.css";

export function PatternsDocumentation() {
  return (
    <main className="bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        <section>
          <h1 className="text-4xl font-semibold mb-4">Using Patterns</h1>
          <p className="text-lg text-muted-foreground">
            Our pattern library provides versatile SVG patterns in CSS that can
            be used in various ways.
          </p>
          <Separator className="my-12" />
          <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
          <ol className=" text-muted-foreground list-decimal pl-8 space-y-2">
            <li>
              Find the pattern you want to use in the{" "}
              <span className="font-mono text-foreground">
                patterns/patterns.css
              </span>{" "}
              file.
            </li>
            <li>
              Copy and paste the pattern into your{" "}
              <span className="font-mono text-foreground">globals.css</span>{" "}
              file.
            </li>
            <li>Rename the pattern class to match your project.</li>
            <li>
              Edit the pattern colors in the background-image svg to fit your
              needs.
            </li>
            <li>
              Use the pattern in your project by adding the pattern class to
              your element.
            </li>
          </ol>
        </section>

        <Separator />

        <section>
          <h2 className="text-2xl font-semibold mb-4">Customizing Patterns</h2>
          <p className="text-muted-foreground mb-8">
            You can customize the patterns by editing the SVG code in the
            background-image property. In the example below, you can see how to
            change the stroke color from black to blue.
          </p>
          <p className="text-muted-foreground mb-8">
            Make sure you always change the '#' in your color value to '%23 so it will display properly. 
          </p>
          <div className="border border-border rounded-md bg-card overflow-hidden mb-6">
            <div className="text-foreground px-3 py-2 font-medium border-b border-border">
              globals.css
            </div>
            <pre className="bg-zinc-950 font-normal text-wrap leading-normal text-white p-4 text-sm font-mono">
              <code>
                {`.pattern-background {
    background-image: url("data:image/svg+xml,%3Csvg width='140' height='16' viewBox='0 0 140 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_4133_10133)'%3E%3Cpath d='M-0.0390625 44C16.7069 44 23.8369 34.61 32.6009 24.676C41.5709 14.516 51.4569 4 70.0009 4C88.5449 4 98.4309 14.516 107.401 24.676C116.165 34.61 123.295 44 140.041 44M-0.0390625 28.004C16.7069 28 23.8369 18.612 32.6009 8.678C41.5709 -1.484 51.4569 -12 70.0009 -12C88.5449 -12 98.4309 -1.484 107.401 8.678C116.165 18.612 123.295 28 140.041 28.006M140.001 12.008C123.255 12.006 116.165 2.612 107.401 -7.322C98.4309 -17.484 88.5449 -28 70.0009 -28C51.4569 -28 41.5709 -17.484 32.6009 -7.322C23.8369 2.612 16.7069 12 -0.0390625 12.004' `}<span className="bg-white px-1 rounded border text-black">{`stroke='%23bfdbfe'`}</span>{`/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_4133_10133'%3E%3Crect width='140' height='16' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E");
    background-repeat: repeat;
    width: 100%;
    height: 100%;
}
`}
              </code>
            </pre>
          </div>
        </section>

        <Separator />

        <section>
          <h2 className="text-2xl font-semibold mb-3">Example usage</h2>
          <p className="text-muted-foreground mb-12">
            Here are some examples of how to use patterns in your project.
          </p>

          <h3 className="text-xl font-semibold mb-4">Background Pattern</h3>

          <div className="pattern-background bg-blue-50 dark:bg-blue-950 w-full py-20 border border-border rounded-md mb-6"></div>

          <div className="border border-border rounded-md bg-card overflow-hidden mb-6">
            <div className="text-foreground px-3 py-2 font-medium border-b border-border">
              globals.css
            </div>
            <pre className="bg-zinc-950 font-normal leading-normal text-white p-4 text-sm font-mono overflow-x-scroll">
              <code>
                {`.pattern-background {
    background-image: url("data:image/svg+xml,%3Csvg width='140' height='16' viewBox='0 0 140 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_4133_10133)'%3E%3Cpath d='M-0.0390625 44C16.7069 44 23.8369 34.61 32.6009 24.676C41.5709 14.516 51.4569 4 70.0009 4C88.5449 4 98.4309 14.516 107.401 24.676C116.165 34.61 123.295 44 140.041 44M-0.0390625 28.004C16.7069 28 23.8369 18.612 32.6009 8.678C41.5709 -1.484 51.4569 -12 70.0009 -12C88.5449 -12 98.4309 -1.484 107.401 8.678C116.165 18.612 123.295 28 140.041 28.006M140.001 12.008C123.255 12.006 116.165 2.612 107.401 -7.322C98.4309 -17.484 88.5449 -28 70.0009 -28C51.4569 -28 41.5709 -17.484 32.6009 -7.322C23.8369 2.612 16.7069 12 -0.0390625 12.004' stroke='%23bfdbfe'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_4133_10133'%3E%3Crect width='140' height='16' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E");
    background-repeat: repeat;
    width: 100%;
    height: 100%;
}
  
:is(.dark .pattern-background) {
    background-image: url("data:image/svg+xml,%3Csvg width='140' height='16' viewBox='0 0 140 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_4133_10133)'%3E%3Cpath d='M-0.0390625 44C16.7069 44 23.8369 34.61 32.6009 24.676C41.5709 14.516 51.4569 4 70.0009 4C88.5449 4 98.4309 14.516 107.401 24.676C116.165 34.61 123.295 44 140.041 44M-0.0390625 28.004C16.7069 28 23.8369 18.612 32.6009 8.678C41.5709 -1.484 51.4569 -12 70.0009 -12C88.5449 -12 98.4309 -1.484 107.401 8.678C116.165 18.612 123.295 28 140.041 28.006M140.001 12.008C123.255 12.006 116.165 2.612 107.401 -7.322C98.4309 -17.484 88.5449 -28 70.0009 -28C51.4569 -28 41.5709 -17.484 32.6009 -7.322C23.8369 2.612 16.7069 12 -0.0390625 12.004' stroke='%231e3a8a'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_4133_10133'%3E%3Crect width='140' height='16' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E");
}`}
              </code>
            </pre>
          </div>

          <div className="border border-border rounded-md bg-card overflow-hidden">
            <div className="text-foreground px-3 py-2 font-medium border-b border-border">
              component.tsx
            </div>
            <pre className="bg-zinc-950 font-normal leading-normal text-white p-4 text-sm font-mono overflow-x-scroll">
              <code>
                {`<div className="pattern-background bg-blue-50 dark:bg-blue-950 w-full py-20 border border-border rounded-md"></div>`}
              </code>
            </pre>
          </div>

          <h3 className="text-xl font-semibold mb-4 mt-16">Animated Pattern</h3>

          <div className="pattern-animated bg-blue-50 dark:bg-blue-950 w-full py-20 border border-border rounded-md mb-6"></div>

          <div className="border border-border rounded-md bg-card overflow-hidden mb-6">
            <div className="text-foreground px-3 py-2 font-medium border-b border-border">
              globals.css
            </div>
            <pre className="bg-zinc-950 font-normal leading-normal text-white p-4 text-sm font-mono overflow-x-scroll">
              <code>
                {`@keyframes moveDown {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 20px; /* matches height of SVG */
  }
}

.pattern-animated {
  background-image: url("data:image/svg+xml,%3Csvg width='80' height='20' viewBox='0 0 80 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_4173_208053)'%3E%3Cpath d='M-20.1328 4.56799C-13.1778 4.93199 -6.45181 7.37599 0.00018692 9.99999C6.45219 12.624 13.0362 15.072 20.0002 15C26.9672 14.928 33.5602 12.659 40.0002 9.99999C46.4402 7.34099 53.0332 5.07199 60.0002 4.99999C66.9642 4.92799 73.5482 7.37599 80.0002 9.99999C86.4522 12.624 93.1782 15.068 100.133 15.432' stroke='%233b82f6'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_4173_208053'%3E%3Crect width='80' height='20' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E");
  background-repeat: repeat;
  animation: moveDown 2s linear infinite;
}

:is(.dark .pattern-animated) {
  background-image: url("data:image/svg+xml,%3Csvg width='80' height='20' viewBox='0 0 80 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_4173_208053)'%3E%3Cpath d='M-20.1328 4.56799C-13.1778 4.93199 -6.45181 7.37599 0.00018692 9.99999C6.45219 12.624 13.0362 15.072 20.0002 15C26.9672 14.928 33.5602 12.659 40.0002 9.99999C46.4402 7.34099 53.0332 5.07199 60.0002 4.99999C66.9642 4.92799 73.5482 7.37599 80.0002 9.99999C86.4522 12.624 93.1782 15.068 100.133 15.432' stroke='%233b82f6'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_4173_208053'%3E%3Crect width='80' height='20' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E");
}`}
              </code>
            </pre>
          </div>

          <div className="border border-border rounded-md bg-card overflow-hidden">
            <div className="text-foreground px-3 py-2 font-medium border-b border-border">
              component.tsx
            </div>
            <pre className="bg-zinc-950 font-normal leading-normal text-white p-4 text-sm font-mono overflow-x-scroll">
              <code>
                {`<div className="pattern-animated bg-blue-50 dark:bg-blue-950 w-full py-20 border border-border rounded-md"></div>`}
              </code>
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
