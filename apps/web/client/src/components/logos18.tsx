import { cn } from '@/lib/utils';

type LogosSimpleStaticLogo = Logo & {
    href?: string;
};
interface Logo {
    src: string;
    alt: string;
    srcDark?: string;
    className?: string;
}

interface LogosSimpleStaticProps {
    logos: LogosSimpleStaticLogo[];
    className?: string;
}

type Props = Partial<LogosSimpleStaticProps>;

const defaultProps: LogosSimpleStaticProps = {
    logos: [
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-1.svg',
            alt: 'Company logo 1',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-2.svg',
            alt: 'Company logo 2',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-3.svg',
            alt: 'Company logo 3',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-4.svg',
            alt: 'Company logo 4',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-5.svg',
            alt: 'Company logo 5',
            className: 'h-5 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-6.svg',
            alt: 'Company logo 6',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-7.svg',
            alt: 'Company logo 7',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-8.svg',
            alt: 'Company logo 8',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-9.svg',
            alt: 'Company logo 9',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-10.svg',
            alt: 'Company logo 10',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-11.svg',
            alt: 'Company logo 11',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/placeholder/logos/fictional-company-logo-12.svg',
            alt: 'Company logo 12',
            className: 'h-7 w-auto',
            href: 'https://www.shadcnblocks.com',
        },
    ],
};

const Logos18 = (props: Props) => {
    const { logos, className } = {
        ...defaultProps,
        ...props,
    };

    const MAX_LOGOS = 6;
    const visibleLogos = logos.slice(0, MAX_LOGOS);

    return (
        <section className={cn('py-12 md:py-16 lg:py-32', className)}>
            <div className="container">
                <div className="flex flex-col items-center text-center">
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6 lg:gap-12">
                        {visibleLogos.map((logo, index) => (
                            <div
                                key={`${logo.src}-${index}`}
                                className="flex aspect-3/1 w-28 items-center justify-center sm:w-32"
                            >
                                <img
                                    src={logo.src}
                                    alt={logo.alt}
                                    className={cn(
                                        logo.className,
                                        'h-auto max-h-7 w-auto object-contain dark:invert',
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export { Logos18 };
