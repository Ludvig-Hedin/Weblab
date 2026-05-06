import {
    ChevronRight,
    CreditCard,
    Package,
    RotateCcw,
    ShoppingBag,
    Truck,
    User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HelpCategory {
    icon: React.ReactNode;
    title: string;
    description: string;
    articles: number;
}

interface PopularTopic {
    title: string;
    href: string;
}

interface Help1Props {
    title?: string;
    description?: string;
    categories?: HelpCategory[];
    popularTopics?: PopularTopic[];
    className?: string;
}

const DEFAULT_CATEGORIES: HelpCategory[] = [
    {
        icon: <Package className="size-5" />,
        title: 'Orders',
        description: 'Track, modify, or cancel orders',
        articles: 12,
    },
    {
        icon: <Truck className="size-5" />,
        title: 'Shipping',
        description: 'Delivery options and tracking',
        articles: 8,
    },
    {
        icon: <RotateCcw className="size-5" />,
        title: 'Returns & Refunds',
        description: 'Return policy and process',
        articles: 15,
    },
    {
        icon: <CreditCard className="size-5" />,
        title: 'Payments',
        description: 'Payment methods and issues',
        articles: 10,
    },
    {
        icon: <User className="size-5" />,
        title: 'Account',
        description: 'Profile, password, and settings',
        articles: 7,
    },
    {
        icon: <ShoppingBag className="size-5" />,
        title: 'Products',
        description: 'Sizing, care, and availability',
        articles: 9,
    },
];

const DEFAULT_TOPICS: PopularTopic[] = [
    { title: 'Where is my order?', href: '#' },
    { title: 'How to return an item', href: '#' },
    { title: 'Forgot my password', href: '#' },
    { title: 'Payment not going through', href: '#' },
    { title: 'Size guide', href: '#' },
    { title: 'Shipping to my country', href: '#' },
];

const Help1 = ({
    title = 'Help Center',
    description = 'How can we help you today?',
    categories = DEFAULT_CATEGORIES,
    popularTopics = DEFAULT_TOPICS,
    className,
}: Help1Props) => {
    return (
        <section className={cn('py-32', className)}>
            <div className="container max-w-4xl">
                <div className="mb-10 text-center">
                    <h1 className="mb-4 text-4xl font-medium tracking-tight md:text-5xl">
                        {title}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">{description}</p>
                </div>

                <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map((category, index) => (
                        <Card
                            key={index}
                            className="group cursor-pointer gap-0 p-0 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="shrink-0 text-slate-500 dark:text-slate-400">
                                        {category.icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-medium">{category.title}</h3>
                                            <ChevronRight className="size-4 text-slate-500 transition-transform group-hover:translate-x-0.5 dark:text-slate-400" />
                                        </div>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            {category.description}
                                        </p>
                                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                            {category.articles} articles
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="rounded-xl bg-slate-100/50 p-6 dark:bg-slate-800/50">
                    <h2 className="mb-3 text-lg font-medium">Popular Topics</h2>
                    <div className="-mx-2 grid sm:grid-cols-2 lg:grid-cols-3">
                        {popularTopics.map((topic, index) => (
                            <a
                                key={index}
                                href={topic.href}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white dark:hover:bg-slate-950"
                            >
                                <ChevronRight className="size-4 text-slate-500 dark:text-slate-400" />
                                {topic.title}
                            </a>
                        ))}
                    </div>
                </div>

                <div className="mt-10 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Can&apos;t find what you&apos;re looking for?
                    </p>
                    <Button className="mt-3">Contact Support</Button>
                </div>
            </div>
        </section>
    );
};

export { Help1 };
