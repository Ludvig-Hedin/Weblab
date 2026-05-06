import { Marquee, MarqueeContent, MarqueeFade, MarqueeItem } from '@/components/kibo-ui/marquee';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface About3Props {
    className?: string;
    title: string;
    description?: string;
    mainImage: {
        src: string;
        alt: string;
    };
    secondaryImage: {
        src: string;
        alt: string;
    };
    breakout: {
        src?: string;
        alt?: string;
        title: string;
        description: string;
        buttonText?: string;
        buttonUrl?: string;
    };
    companies?: Array<{
        src: string;
        alt: string;
    }> | null;
    achievementsTitle?: string;
    achievementsDescription?: string;
    achievements?: Array<{
        label: string;
        value: string;
    }>;
    contentSections?: Array<{
        title: string;
        content: string;
    }>;
}

const About3 = ({
    className,
    title = 'About Us',
    description = 'We are a passionate team dedicated to creating innovative solutions that empower businesses thrive in the digital age. With years of experience design and development, we craft beautiful, accessible components help teams build faster.',
    mainImage = {
        src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/photos/annie-spratt-MChSQHxGZrQ-unsplash.jpg',
        alt: 'about',
    },
    secondaryImage = {
        src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/photos/annie-spratt-AkftcHujUmk-unsplash.jpg',
        alt: 'about',
    },
    breakout = {
        src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/block-1.svg',
        alt: 'logo',
        title: 'Hundreds of blocks at Shadcnblocks.com',
        description:
            'Providing businesses with effective tools to improve workflows, boost efficiency, and encourage growth.',
        buttonText: 'Discover more',
        buttonUrl: 'https://www.shadcnblocks.com',
    },
    companies = [
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/company/fictional-company-logo-1.svg',
            alt: 'Arc',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/company/fictional-company-logo-2.svg',
            alt: 'Descript',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/company/fictional-company-logo-3.svg',
            alt: 'Mercury',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/company/fictional-company-logo-4.svg',
            alt: 'Ramp',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/company/fictional-company-logo-5.svg',
            alt: 'Retool',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/company/fictional-company-logo-6.svg',
            alt: 'Watershed',
        },
    ],
    achievementsTitle = 'Our Achievements in Numbers',
    achievementsDescription = 'Providing businesses with effective tools to improve workflows, boost efficiency, and encourage growth.',
    achievements = [
        { label: 'Companies', value: '300+' },
        { label: 'Projects Finalized', value: '800+' },
        { label: 'Happy Customers', value: '99%' },
        { label: 'Recognized Awards', value: '10+' },
    ],
    contentSections = [
        {
            title: 'Our Vision',
            content:
                'For years, the process of building custom software has remained challenging. Today, visual builders exist, but tailored solutions still require technical expertise and a lot time. This is problem for businesses individuals alike.\
\
What if you could create without writing single line code? What build your own tools.\
\
With our platform, can! Our tools let design layouts functionality—all needing to code.\
\
We believe that everyone should be able their solutions, regardless background.',
        },
        {
            title: 'Our Creators',
            content:
                'Our company has been building web tools for over a decade, focusing on efficiency and user control in every project. We know that the best solutions are ones you can create yourself.\
\
We initially developed these our own team, now everyone benefit from them too. proud to offer platform is accessible all, regardless of technical expertise.\
\
Our team made up talented individuals who passionate about creating empower users build their with ease. dedicated helping achieve your goals.',
        },
    ],
}: About3Props) => {
    return (
        <section className={cn('py-32', className)}>
            <div className="container">
                <div className="mb-14 flex flex-col gap-5 lg:w-2/3">
                    <h1 className="text-5xl font-semibold tracking-tighter lg:text-6xl">{title}</h1>
                    <p className="text-lg text-slate-500 md:text-xl dark:text-slate-400">
                        {description}
                    </p>
                </div>
                <div className="grid gap-7 lg:grid-cols-3">
                    <img
                        src={mainImage.src}
                        alt={mainImage.alt}
                        className="size-full max-h-[620px] rounded-xl object-cover lg:col-span-2"
                    />
                    <div className="flex flex-col gap-7 md:flex-row lg:flex-col">
                        <div className="flex flex-col justify-between gap-6 rounded-xl bg-slate-100 p-7 md:w-1/2 lg:w-auto dark:bg-slate-800">
                            {breakout.src && (
                                <img
                                    src={breakout.src}
                                    alt={breakout.alt ?? ''}
                                    className="mr-auto h-12 dark:invert"
                                />
                            )}
                            <div>
                                <p className="mb-2 text-lg font-semibold">{breakout.title}</p>
                                <p className="text-slate-500 dark:text-slate-400">
                                    {breakout.description}
                                </p>
                            </div>
                            <Button variant="outline" className="mr-auto" asChild>
                                <a
                                    href={breakout.buttonUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {breakout.buttonText}
                                </a>
                            </Button>
                        </div>
                        <img
                            src={secondaryImage.src}
                            alt={secondaryImage.alt}
                            className="grow basis-0 rounded-xl object-cover md:w-1/2 lg:min-h-0 lg:w-auto"
                        />
                    </div>
                </div>
                {companies && (
                    <div className="py-32">
                        <Marquee>
                            <MarqueeContent speed={40}>
                                {companies.map((company, idx) => (
                                    <MarqueeItem
                                        key={company.src + idx}
                                        className="mx-8 flex items-center"
                                    >
                                        <img
                                            src={company.src}
                                            alt={company.alt}
                                            className="h-7 w-auto md:h-8 dark:invert"
                                        />
                                    </MarqueeItem>
                                ))}
                            </MarqueeContent>
                            <MarqueeFade side="left" />
                            <MarqueeFade side="right" />
                        </Marquee>
                    </div>
                )}
                <div className="relative overflow-hidden rounded-xl bg-slate-100 p-7 md:p-16 dark:bg-slate-800">
                    <div className="flex flex-col gap-4 text-center md:text-left">
                        <h2 className="text-3xl font-medium md:text-4xl">{achievementsTitle}</h2>
                        <p className="max-w-xl text-slate-500 dark:text-slate-400">
                            {achievementsDescription}
                        </p>
                    </div>
                    <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 md:flex md:flex-wrap md:justify-between">
                        {achievements?.map((item, idx) => (
                            <div
                                className="flex flex-col gap-2 text-center md:text-left"
                                key={item.label + idx}
                            >
                                <span className="font-mono text-4xl font-semibold md:text-5xl">
                                    {item.value}
                                </span>
                                <p className="text-sm md:text-base">{item.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
                {contentSections && contentSections.length > 0 && (
                    <div className="mx-auto grid max-w-5xl gap-16 py-28 md:grid-cols-2 md:gap-28">
                        {contentSections.map((section, idx) => (
                            <div key={section.title + idx}>
                                <h2 className="mb-5 text-4xl font-medium">{section.title}</h2>
                                <p className="text-lg leading-7 whitespace-pre-line text-slate-500 dark:text-slate-400">
                                    {section.content}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export { About3 };
