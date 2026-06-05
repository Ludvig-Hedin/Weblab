"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

export function TeamSection2() {
  const teamMembers = [
    {
      name: "Ricky Smith",
      role: "CEO",
      description:
        "Leads the company with a clear vision, guiding strategic growth and fostering innovation to ensure long-term success.",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Kurt Bates",
      role: "Innovation Specialist",
      description:
        "Drives innovation efforts, exploring new technologies and strategies to keep the company ahead of industry trends.",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Dennis Callis",
      role: "Designer",
      description:
        "Creates beautiful, innovative, and functional designs that effectively communicate the brand and engage the audience.",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Frances Swann",
      role: "UI/UX Designer",
      description:
        "Crafts seamless, intuitive user interfaces and experiences that ensure products are both easy to use and visually appealing.",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Corina McCoy",
      role: "Culture Curator",
      description:
        "Nurtures company culture, ensuring a positive, inclusive environment where creativity, collaboration, and growth thrive.",
      image: "https://github.com/shadcn.png",
    },
    {
      name: "Rhonda Rhodes",
      role: "Innovation Specialist",
      description:
        "Shapes and communicates the brand's identity, developing strategies that enhance recognition and build lasting customer loyalty.",
      image: "https://github.com/shadcn.png",
    },
  ];

  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-start gap-12">
          <div className="flex flex-col gap-4 max-w-xl">
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 lg:gap-x-6 lg:gap-y-12">
            {teamMembers.map((member, index) => (
              <div key={index} className="flex flex-col items-start gap-4">
                <div className="flex flex-col items-start gap-4">
                  <div className="flex gap-3 items-center">
                    <Avatar className="h-12 w-12 rounded-lg">
                      <AvatarImage src={member.image} alt={member.name} />
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
                <p className="text-base text-muted-foreground">
                  {member.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
