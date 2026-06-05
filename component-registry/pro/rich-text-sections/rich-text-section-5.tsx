"use client";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import Image from "next/image";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@radix-ui/react-separator";

const TABLE_OF_CONTENTS = [
  { label: "The King's Plan", href: "#the-kings-plan" },
  { label: "The Joke Tax", href: "#the-joke-tax" },
  { label: "Jokester's Revolt", href: "#jokesters-revolt" },
  { label: "The People's Rebellion", href: "#the-peoples-rebellion" },
];

export function RichTextSection5() {
  const handleScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-6">
        <article 
          className="flex flex-col gap-12 md:gap-24" 
          aria-labelledby="article-title"
        >
          <div className="flex flex-col lg:flex-row items-top gap-8 lg:gap-12">
            <div className="flex flex-col justify-between flex-1 gap-6">
              <div className="flex flex-col gap-4 md:gap-5">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground leading-5">
                    Nov 11, 2024
                  </p>
                  <span className="text-sm text-muted-foreground leading-5">
                    ·
                  </span>
                  <p className="text-sm text-muted-foreground leading-5">
                    Articles
                  </p>
                </div>

                <h1 
                  id="article-title"
                  className="text-4xl lg:text-5xl font-bold text-foreground"
                >
                  Short and clear engaging headline
                </h1>

                <p className="text-lg text-muted-foreground leading-7">
                  Add a concise value statement that captures reader interest
                  and previews content value. Focus on benefits while keeping it
                  under two lines. Align with your blog categories.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="Lando Norris"
                  />
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-medium text-foreground leading-5">
                    Lando Norris
                  </p>
                  <p className="text-sm text-muted-foreground leading-5">
                    Product Designer
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 h-full">
              <AspectRatio ratio={16 / 10}>
                <Image
                  src="https://ui.shadcn.com/placeholder.svg"
                  alt="Article cover image"
                  fill
                  className="object-cover rounded-xl h-full w-full"
                />
              </AspectRatio>
            </div>
          </div>
          <div className="flex flex-row gap-12">
            <div className="flex flex-col gap-6 max-w-3xl">
              <p className="leading-7 mt-0">
                Once upon a time, in a far-off land, there was a very lazy king
                who spent all day lounging on his throne. One day, his advisors
                came to him with a problem: the kingdom was running out of
                money.
              </p>

              <h2
                id="the-kings-plan"
                className="scroll-mt-16 text-3xl font-semibold border-b pb-2"
              >
                The King's Plan
              </h2>

              <p className="leading-7">
                The king thought long and hard, and finally came up with a
                brilliant plan: he would tax the jokes in the kingdom.
              </p>

              <blockquote className="border-l-2 pl-6 italic">
                "After all," he said, "everyone enjoys a good joke, so it's only
                fair that they should pay for the privilege."
              </blockquote>

              <h3
                id="the-joke-tax"
                className="scroll-mt-16 mt-8 text-2xl font-semibold"
              >
                The Joke Tax
              </h3>

              <p className="leading-7">
                The king's subjects were not amused. They grumbled and
                complained, but the king was firm:
              </p>

              <ul className="ml-6 list-disc space-y-2">
                <li>1st level of puns: 5 gold coins</li>
                <li>2nd level of jokes: 10 gold coins</li>
                <li>3rd level of one-liners: 20 gold coins</li>
              </ul>

              <p className="leading-7">
                As a result, people stopped telling jokes, and the kingdom fell
                into a gloom. But there was one person who refused to let the
                king's foolishness get him down: a court jester named Jokester.
              </p>

              <h3
                id="jokesters-revolt"
                className="scroll-mt-16 mt-8 text-2xl font-semibold"
              >
                Jokester's Revolt
              </h3>

              <p className="leading-7">
                Jokester began sneaking into the castle in the middle of the
                night and leaving jokes all over the place: under the king's
                pillow, in his soup, even in the royal toilet. The king was
                furious, but he couldn't seem to stop Jokester.
              </p>

              <p className="leading-7">
                And then, one day, the people of the kingdom discovered that the
                jokes left by Jokester were so funny that they couldn't help but
                laugh. And once they started laughing, they couldn't stop.
              </p>

              <h3
                id="the-peoples-rebellion"
                className="scroll-mt-16 mt-8 text-2xl font-semibold"
              >
                The People's Rebellion
              </h3>

              <p className="leading-7">
                The people of the kingdom, feeling uplifted by the laughter,
                started to tell jokes and puns again, and soon the entire
                kingdom was in on the joke.
              </p>

              <p className="leading-7">
                The king, seeing how much happier his subjects were, realized
                the error of his ways and repealed the joke tax. Jokester was
                declared a hero, and the kingdom lived happily ever after.
              </p>

              <p className="leading-7">
                The moral of the story is: never underestimate the power of a
                good laugh and always be careful of bad ideas.
              </p>
            </div>

            <aside className="flex-col gap-5 hidden lg:flex">
              <span className="text-sm text-foreground font-medium">
                On this page
              </span>
              <nav className="flex flex-col gap-3">
                {TABLE_OF_CONTENTS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => handleScroll(e, item.href)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </aside>
          </div>
        </article>
      </div>
    </section>
  );
}
