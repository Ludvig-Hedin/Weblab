"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

export function TeamSection3() {
  const teamMembers = [
    {
      name: "Ricky Smith",
      role: "CEO",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Kurt Bates",
      role: "Innovation Specialist",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Dennis Callis",
      role: "Designer",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Frances Swann",
      role: "UI/UX Designer",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Corina McCoy",
      role: "Culture Curator",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Rhonda Rhodes",
      role: "Innovation Specialist",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Roger Rogers",
      role: "Laziness Expert",
      image: "https://github.com/shadcn.png",
    },
  ];

  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-center gap-12">
          <div className="flex flex-col items-center gap-4 max-w-xl text-center">
            <p className="text-sm md:text-base font-semibold text-muted-foreground">
              Team section
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              People-powered showcase that builds connection
            </h2>
            <p className="text-muted-foreground">
              Add a concise value statement that highlights your team's
              expertise and culture while maintaining a professional tone. Focus
              on collective strengths and achievements while keeping it under 2
              lines.
            </p>
          </div>

          <div className="flex flex-wrap gap-12 lg:gap-x-6 lg:gap-y-12 w-full justify-center">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className="flex flex-col items-center gap-4 text-center w-full md:w-1/3 lg:w-1/5"
              >
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage
                      src="https://github.com/shadcn.png"
                      alt={member.name}
                    />
                  </Avatar>
                  <div className="flex flex-col">
                    <p className="text-base font-semibold text-foreground">
                      {member.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {member.role}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
