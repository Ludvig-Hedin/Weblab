import { cn } from "@/lib/utils";

interface ComplianceBadge {
  image?: string;
  alt: string;
}

interface ComplianceFeature {
  title: string;
  description: string;
  badgeImage?: string;
  badgeAlt?: string;
}

interface Compliance1Props {
  tagline?: string;
  heading?: string;
  description?: string;
  badges?: ComplianceBadge[];
  features?: ComplianceFeature[];
  className?: string;
}

const Compliance1 = ({
  tagline = "Compliance",
  heading = "Complete Compliance & Security Readiness",
  description = "Stay compliant with privacy and healthcare regulations. Our platform meets GDPR HIPAA requirements, providing data protection compliance monitoring for regulated industries.",
  badges = [
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/compliance/GDPR.svg",
      alt: "GDPR",
    },
    {
      image:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/compliance/CCPA.svg",
      alt: "CCPA",
    },
  ],
  features = [
    {
      title: "Automated audit trails",
      description:
        "Every action is logged and timestamped with immutable audit trails for complete regulatory compliance.",
      badgeImage:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/compliance/ISO-27001.svg",
      badgeAlt: "ISO-27001",
    },
    {
      title: "Compliance monitoring",
      description:
        "Real-time monitoring ensures continuous compliance with industry standards and regulations.",
      badgeImage:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/compliance/ISO-27017.svg",
      badgeAlt: "ISO-27017",
    },
    {
      title: "Regulatory reporting",
      description:
        "Generate compliance reports automatically to meet regulatory requirements and audit demands.",
      badgeImage:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/compliance/ISO-27018.svg",
      badgeAlt: "ISO-27018",
    },
  ],
  className,
}: Compliance1Props) => {
  return (
    <section className={cn("py-24 md:py-32", className)}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 md:px-8">
        <div className="grid gap-9 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <span className="border-foreground-primary/15 text-foreground-tertiary inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-small uppercase tracking-wide">
              <span className="size-1.5 rounded-full bg-foreground-primary" />
              {tagline}
            </span>
            <h2 className="heading-style-h3 text-foreground-primary text-balance">
              {heading}
            </h2>
            <p className="text-foreground-secondary text-regularPlus">{description}</p>
            {badges.length > 0 ? (
              <div className="flex items-center gap-3 flex-wrap mt-2">
                {badges.map((badge, index) =>
                  badge.image ? (
                    <img
                      key={index}
                      src={badge.image}
                      alt={badge.alt}
                      className="h-16 opacity-50 grayscale md:h-20 dark:invert"
                    />
                  ) : (
                    <span
                      key={index}
                      className="border-foreground-primary/15 text-foreground-secondary text-small inline-flex items-center rounded-full border px-3 py-1.5"
                    >
                      {badge.alt}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
          <div className="border-foreground-primary/10 rounded-2xl border">
            {features.map((feature, index) => (
              <div
                key={index}
                className={cn(
                  "relative overflow-hidden p-6 lg:px-8 lg:py-10",
                  index !== features.length - 1 && "border-foreground-primary/10 border-b",
                )}
              >
                <div>
                  <h3 className="text-foreground-primary heading-style-h5">
                    {feature.title}
                  </h3>
                  <p className="text-foreground-secondary text-regular mt-2 w-3/4 pr-10">
                    {feature.description}
                  </p>
                </div>
                {feature.badgeImage ? (
                  <img
                    src={feature.badgeImage}
                    alt={feature.badgeAlt ?? ""}
                    className="absolute right-4 -bottom-7 size-24 opacity-80 grayscale lg:right-8 lg:size-32 dark:invert"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Compliance1 };
export type { Compliance1Props, ComplianceFeature, ComplianceBadge };
