'use client';

import type { ControllerRenderProps, Resolver } from 'react-hook-form';
import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Heart } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod';

import { Price, PriceValue } from '@/components/shadcnblocks/price';
import { Button } from '@/components/ui/button';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from '@/components/ui/carousel';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const STOCK_STATUS = {
    IN_STOCK: 'IN_STOCK',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
} as const;

type StockStatusCode = keyof typeof STOCK_STATUS;

type FormType = z.infer<typeof formSchema>;
type FieldName = keyof FormType;

type Image = {
    src: string;
    alt: string;
};

interface ProductPrice {
    regular: number;
    sale?: number;
    currency: string;
}

type Option = {
    id: string;
    value: string;
    label: string;
    thumbnail?: string;
    stockStatusCode?: StockStatusCode;
};

interface Hinges {
    label: string;
    id: string;
    min?: number;
    max?: number;
    name: FieldName;
    options?: Option[];
}

type Product = {
    images: Image[];
    name: string;
    description: string;
    link: string;
    price: ProductPrice;
    hinges: Record<FieldName, Hinges>;
    variant: {
        color: string;
        size: string;
    };
};

interface ProductImagesProps {
    images: Image[];
}

interface ProductFormProps {
    hinges: Record<FieldName, Hinges>;
    selected?: FormType;
}

interface RadioGroupProps {
    options?: Array<Option>;
    field: ControllerRenderProps<FormType>;
}

type SizeOptionProps = Option;

const PRODUCT_DETAILS: Product = {
    name: 'Stylish Light Brown Hat',
    description:
        'We craft gentle formulas that truly work and bring confidence to your daily ritual',
    link: '#',
    images: [
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Stylish-Hat-and-Sunglasses-2.png',
            alt: '',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Stylish-Portrait-hat-2.png',
            alt: '',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Stylish-Modern-Look-2.png',
            alt: '',
        },
        {
            src: 'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Fashionable-Pose-2.png',
            alt: '',
        },
    ],
    price: {
        regular: 499.0,
        sale: 389.0,
        currency: 'USD',
    },
    variant: {
        color: 'light-brown',
        size: 'size-1',
    },
    hinges: {
        color: {
            label: 'Color',
            id: 'color',
            name: 'color',
            options: [
                {
                    id: 'light-brown',
                    value: 'light-brown',
                    label: 'Light Brown',
                    thumbnail:
                        'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Stylish-Beige-Fedora-1.png',
                    stockStatusCode: 'IN_STOCK',
                },
                {
                    id: 'dark-brown',
                    value: 'dark-brown',
                    label: 'Dark Brown',
                    thumbnail:
                        'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Classic-Fedora-Hat-1.png',
                    stockStatusCode: 'IN_STOCK',
                },
                {
                    id: 'black',
                    value: 'black',
                    label: 'Black',
                    thumbnail:
                        'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/ecommerce/accessories/Classic-Black-Fedora-Hat-1.png',
                    stockStatusCode: 'OUT_OF_STOCK',
                },
            ],
        },
        size: {
            label: 'Hat Size',
            id: 'size',
            name: 'size',
            options: [
                {
                    id: 'size-1',
                    value: 'size-1',
                    label: '6⅝',
                    stockStatusCode: 'IN_STOCK',
                },
                {
                    id: 'size-2',
                    value: 'size-2',
                    label: '6¾',
                    stockStatusCode: 'IN_STOCK',
                },
                {
                    id: 'size-3',
                    value: 'size-3',
                    label: '6⅞',
                    stockStatusCode: 'OUT_OF_STOCK',
                },
                {
                    id: 'size-4',
                    value: 'size-4',
                    label: '7',
                    stockStatusCode: 'OUT_OF_STOCK',
                },
                {
                    id: 'size-5',
                    value: 'size-5',
                    label: '7⅛',
                    stockStatusCode: 'IN_STOCK',
                },
                {
                    id: 'size-6',
                    value: 'size-6',
                    label: '7¼',
                    stockStatusCode: 'OUT_OF_STOCK',
                },
                {
                    id: 'size-7',
                    value: 'size-7',
                    label: '7⅜',
                    stockStatusCode: 'IN_STOCK',
                },
                {
                    id: 'size-8',
                    value: 'size-8',
                    label: '7½',
                    stockStatusCode: 'IN_STOCK',
                },
            ],
        },
    },
};

const ProductQuickView4 = ({
    images = PRODUCT_DETAILS.images,
    name = PRODUCT_DETAILS.name,
    description = PRODUCT_DETAILS.description,
    link = PRODUCT_DETAILS.link,
    price = PRODUCT_DETAILS.price,
    hinges = PRODUCT_DETAILS.hinges,
    variant = PRODUCT_DETAILS.variant,
}) => {
    const { regular, sale, currency } = price;

    return (
        <Dialog defaultOpen>
            <DialogContent
                style={
                    {
                        '--dialog-height': 'calc(100dvh - 2.5rem)',
                        '--dialog-max-height': '38.75rem',
                    } as React.CSSProperties
                }
                className="block h-dvh w-full max-w-240! rounded-none border-none p-0 md:h-[var(--dialog-height)] md:max-h-[var(--dialog-max-height)]"
            >
                <div className="max-md:hide-scrollbar grid overflow-auto max-md:h-full md:grid-cols-2 md:overflow-hidden">
                    <div>
                        <ProductImages images={images} />
                    </div>
                    <div>
                        <div className="hide-scrollbar h-full space-y-5 px-8 py-8 md:h-[var(--dialog-height)] md:max-h-[var(--dialog-max-height)] md:overflow-auto md:px-15 md:py-14">
                            <div className="space-y-2">
                                <DialogTitle className="text-2xl leading-normal font-semibold">
                                    {name}
                                </DialogTitle>
                                <DialogDescription>{description}</DialogDescription>
                            </div>
                            <Price
                                onSale={sale != null}
                                className="items-end text-xl font-semibold"
                            >
                                <PriceValue price={sale} currency={currency} variant="sale" />
                                <PriceValue price={regular} currency={currency} variant="regular" />
                            </Price>
                            <ProductForm
                                hinges={hinges}
                                selected={{
                                    color: variant?.color,
                                    size: variant?.size,
                                }}
                            />
                            <Button variant="link" className="px-0" asChild>
                                <a href={link}>View Product Details</a>
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const ProductImages = ({ images }: ProductImagesProps) => {
    if (!images) return null;

    return (
        <Carousel className="h-full md:[&>div]:h-full">
            <CarouselContent className="-ml-0 md:h-full">
                {images.map((img, index) => (
                    <CarouselItem
                        className="w-full pl-0 md:h-[var(--dialog-height)] md:max-h-[var(--dialog-max-height)]"
                        key={index}
                    >
                        <div className="size-full overflow-hidden max-md:aspect-square">
                            <img
                                src={img.src}
                                alt={img.alt}
                                className="block size-full object-cover object-center"
                            />
                        </div>
                    </CarouselItem>
                ))}
            </CarouselContent>
            <CarouselPrevious className="left-1.5" />
            <CarouselNext className="right-1.5" />
        </Carousel>
    );
};

const formSchema = z.object({
    color: z.string(),
    size: z.string(),
});

const ProductForm = ({ hinges, selected }: ProductFormProps) => {
    const form = useForm<FormType>({
        resolver: zodResolver(
            formSchema as unknown as Parameters<typeof zodResolver>[0],
        ) as unknown as Resolver<FormType>,
        defaultValues: {
            color: selected?.color ?? '',
            size: selected?.size ?? '',
        },
    });

    function onSubmit(_values: FormType) {
        // TODO: wire submitted form values to cart logic
    }

    const colorHinges = hinges?.color;
    const sizeHinges = hinges?.size;

    const selectedColorValue = form.watch('color');
    const selectedSizeValue = form.watch('size');

    const currentColor = useMemo(
        () => colorHinges?.options?.find((item) => item.value === selectedColorValue)?.label ?? '',
        [selectedColorValue, colorHinges],
    );

    const currentSize = useMemo(
        () => sizeHinges?.options?.find((item) => item.value === selectedSizeValue)?.label ?? '',
        [selectedSizeValue, sizeHinges],
    );

    return (
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-5">
                {colorHinges && (
                    <Controller
                        control={form.control}
                        name={colorHinges.name}
                        render={({ field }) => (
                            <FieldSet className="gap-2">
                                <FieldLegend className="text-sm leading-normal">
                                    <h2>
                                        {colorHinges.label}:{''}
                                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                                            {currentColor}
                                        </span>
                                    </h2>
                                </FieldLegend>
                                <ColorRadioGroup field={field} options={colorHinges.options} />
                            </FieldSet>
                        )}
                    />
                )}
                {sizeHinges && (
                    <Controller
                        control={form.control}
                        name={sizeHinges.name}
                        render={({ field }) => (
                            <FieldSet className="gap-2">
                                <FieldLegend className="text-sm leading-normal">
                                    <h2>
                                        {sizeHinges.label}:{''}
                                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                                            {currentSize}
                                        </span>
                                    </h2>
                                </FieldLegend>
                                <SizeRadioGroup field={field} options={sizeHinges.options} />
                            </FieldSet>
                        )}
                    />
                )}
                <div className="flex gap-3">
                    <Button size="lg">Add to Cart</Button>
                    <Button size="icon-lg" variant="outline">
                        <Heart />
                    </Button>
                </div>
            </div>
        </form>
    );
};

const ColorRadioGroup = ({ options, field }: RadioGroupProps) => {
    if (!options) return null;

    return (
        <RadioGroup
            {...field}
            value={field.value}
            onValueChange={field.onChange}
            className="flex flex-wrap items-center gap-3"
        >
            {options.map((item, index) => (
                <label
                    key={index}
                    htmlFor={item.id}
                    className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-slate-200 p-0.5 duration-400 has-checked:ring has-disabled:opacity-60 dark:border-slate-800"
                >
                    <RadioGroupItem
                        id={item.id}
                        className="absolute size-px overflow-hidden opacity-0"
                        value={item.value}
                        aria-label={`Select ${item.label}`}
                        disabled={item.stockStatusCode === STOCK_STATUS.OUT_OF_STOCK}
                    />
                    <div
                        style={{
                            backgroundImage: `url(${item.thumbnail})`,
                        }}
                        className="size-full overflow-hidden rounded-sm bg-cover bg-center bg-no-repeat"
                    ></div>
                </label>
            ))}
        </RadioGroup>
    );
};

const SizeRadioGroup = ({ options, field }: RadioGroupProps) => {
    if (!options) return null;

    return (
        <RadioGroup
            {...field}
            value={field.value}
            onValueChange={field.onChange}
            className="flex w-full flex-wrap justify-start gap-2"
        >
            {options &&
                options.map((item) => (
                    <SizeOption
                        key={item.id}
                        stockStatusCode={item.stockStatusCode}
                        id={item.id}
                        label={item.label}
                        value={item.value}
                    />
                ))}
        </RadioGroup>
    );
};

const SizeOption = ({ id, label, stockStatusCode, value }: SizeOptionProps) => {
    return (
        <label
            htmlFor={id}
            className="relative flex h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 px-5 py-2.5 text-center text-sm leading-none uppercase not-has-disabled:hover:ring has-checked:bg-slate-900 has-checked:text-slate-50 has-disabled:cursor-not-allowed has-disabled:bg-slate-100 has-disabled:text-slate-500 has-disabled:line-through dark:border-slate-800 dark:has-checked:bg-slate-50 dark:has-checked:text-slate-900 dark:has-disabled:bg-slate-800 dark:has-disabled:text-slate-400"
        >
            <RadioGroupItem
                id={id}
                className="absolute size-px overflow-hidden opacity-0"
                value={value}
                aria-label={`Select ${label}`}
                disabled={stockStatusCode === STOCK_STATUS.OUT_OF_STOCK}
            />
            {label}
        </label>
    );
};

export { ProductQuickView4 };
