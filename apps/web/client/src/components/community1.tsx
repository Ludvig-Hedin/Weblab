import { /* FaDiscord, */ FaGithub /* , FaXTwitter */ } from 'react-icons/fa6';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SocialLink {
    icon: React.ReactNode;
    url: string;
}

interface Community1Props {
    logo?: string;
    heading?: string;
    headingHighlight?: string;
    socialLinks?: SocialLink[];
    className?: string;
}

const Community1 = ({
    logo = 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/block-1.svg',
    heading = 'Join our community',
    headingHighlight = 'of designers & developers',
    socialLinks = [
        // { icon: <FaXTwitter />, url: "https://x.com/shadcnblocks" },
        { icon: <FaGithub />, url: 'https://github.com/shadcnblocks' },
        // { icon: <FaDiscord />, url: "#" },
    ],
    className,
}: Community1Props) => {
    return (
        <section className={cn('py-32', className)}>
            <div className="container">
                <div className="flex flex-col items-center gap-5">
                    <img src={logo} alt="logo" className="size-10" />
                    <h2 className="text-center text-3xl font-semibold">
                        {heading}
                        <br />
                        <span className="text-slate-500/80 dark:text-slate-400/80">
                            {headingHighlight}
                        </span>
                    </h2>
                    <div className="flex items-center gap-4">
                        {socialLinks.map((link) => (
                            <Button key={link.url} size="lg" variant="outline" asChild>
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="size-10"
                                >
                                    {link.icon}
                                </a>
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export { Community1 };
